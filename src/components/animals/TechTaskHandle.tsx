"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { useAuth } from "@/context/AuthContext";
import { canReceiveAnimalOps } from "@/lib/roles";
import { EXPERIMENT_KINDS, ExperimentKind, ExperimentOperation } from "@/types/animal-lifecycle";
import { ManagedAnimal } from "@/types/animal-management";

const KIND_LABEL: Record<ExperimentKind, string> = {
  ephys: "电生理 / 数据采集",
  behavior: "行为学",
  optotagging: "Optotagging",
  imaging: "成像",
  other: "其他",
};

const OP_STATUS: Record<string, string> = {
  open: "待技术员拍照完成",
  tech_submitted: "已提交 · 待学生填 NAS",
  closed: "已闭环",
  force_closed: "已强制关闭",
};

/**
 * 技术员从通知进入：
 * 1) 扫界面小程序码 → 2) 扫笼码核验与派发 ID 一致 → 3) 选择操作、拍照、提交给学生
 */
export function TechTaskHandle() {
  const params = useSearchParams();
  const animalId = (params.get("animalId") || "").trim();
  const operationId = (params.get("operationId") || "").trim();
  const { user } = useAuth();
  const allowed = user ? canReceiveAnimalOps(user.roles) : false;

  const [animal, setAnimal] = useState<ManagedAnimal | null>(null);
  const [operation, setOperation] = useState<ExperimentOperation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cageInput, setCageInput] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [expKind, setExpKind] = useState<ExperimentKind>("ephys");
  const [expTitle, setExpTitle] = useState("数据采集");
  const [resultNote, setResultNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!animalId) {
      setError("缺少 Animal ID");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/animal-lifecycle?animalId=${encodeURIComponent(animalId)}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("not_found");
      const data = await res.json();
      setAnimal(data.animal);
      const ops = (data.operations || []) as ExperimentOperation[];
      const op =
        (operationId && ops.find((o) => o.id === operationId)) ||
        ops.find((o) => o.status === "open") ||
        ops.find((o) => o.status === "tech_submitted") ||
        ops[0] ||
        null;
      setOperation(op);
      if (op) {
        setExpKind(op.kind);
        setExpTitle(op.title || KIND_LABEL[op.kind]);
      }
      if (op?.status === "tech_submitted" || op?.status === "closed") {
        setVerified(true);
      }
    } catch {
      setError("未找到该小鼠或无权查看");
      setAnimal(null);
      setOperation(null);
    } finally {
      setBusy(false);
    }
  }, [animalId, operationId]);

  useEffect(() => {
    void load();
  }, [load]);

  function codesMatch(scanned: string, target: ManagedAnimal | null, expectedId: string): boolean {
    const s = scanned.trim().toUpperCase();
    if (!s) return false;
    if (s === expectedId.toUpperCase()) return true;
    if (!target) return false;
    const cage = (target.cageId || "").toUpperCase();
    const loc = (target.cageLocation || "").toUpperCase();
    return s === cage || s === loc || s === target.id.toUpperCase();
  }

  async function verifyCage() {
    const raw = cageInput.trim();
    if (!raw) {
      setVerifyMsg("请输入或粘贴扫到的笼号 / Animal ID");
      return;
    }
    setBusy(true);
    setVerifyMsg("");
    try {
      // 先按笼号查库，再与派发 ID 比对
      const res = await fetch("/api/animal-lifecycle", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup_cage", cageCode: raw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVerified(false);
        setVerifyMsg(
          res.status === 404
            ? "未找到该笼号对应的小鼠，请确认笼码是否正确"
            : data.error || "核验失败"
        );
        return;
      }
      const found = data.animal as ManagedAnimal;
      if (found.id !== animalId && !codesMatch(raw, animal, animalId)) {
        setVerified(false);
        setVerifyMsg(
          `笼码与派发不一致：扫到 ${found.id}，本任务要求 ${animalId}。请勿处理错误笼位。`
        );
        return;
      }
      if (found.id !== animalId) {
        setVerified(false);
        setVerifyMsg(`笼码对应 ${found.id}，与派发 ${animalId} 不符。`);
        return;
      }
      setAnimal(found);
      const ops = (data.operations || []) as ExperimentOperation[];
      const op =
        (operationId && ops.find((o) => o.id === operationId)) ||
        ops.find((o) => o.status === "open") ||
        null;
      setOperation(op);
      setVerified(true);
      setVerifyMsg(`核验通过：${found.id}（笼位 ${found.cageLocation || found.cageId || "—"}）`);
    } catch {
      // 离线兜底：仅用本地 animal 字段比对
      if (codesMatch(raw, animal, animalId)) {
        setVerified(true);
        setVerifyMsg(`核验通过：${animalId}`);
      } else {
        setVerified(false);
        setVerifyMsg(`笼码与派发 ID ${animalId} 不一致`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const next = [...photoUrls];
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/experiment-uploads", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || "upload");
        next.push(String(data.url));
      }
      setPhotoUrls(next);
    } catch {
      setError("照片上传失败，请重试");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function ensureOperation(): Promise<ExperimentOperation | null> {
    if (operation && operation.status === "open") return operation;
    setBusy(true);
    try {
      const res = await fetch("/api/experiment-operations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animalId,
          kind: expKind,
          title: expTitle.trim() || KIND_LABEL[expKind],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error === "animal_locked" ? "该鼠已有进行中实验" : data.error || "无法创建任务");
        return null;
      }
      setOperation(data.operation);
      return data.operation as ExperimentOperation;
    } catch {
      setError("创建任务失败");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitToStudent() {
    if (!verified) {
      setError("请先核验笼码与派发 Animal ID 一致");
      return;
    }
    if (!photoUrls.length && !resultNote.trim()) {
      setError("请至少上传一张拍照记录或填写结果说明");
      return;
    }
    if (!photoUrls.length) {
      setError("请至少上传一张结果照片");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let op = operation;
      if (!op || op.status !== "open") {
        op = await ensureOperation();
      }
      if (!op) return;
      const res = await fetch("/api/experiment-operations", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: op.id,
          action: "tech_submit",
          resultNote,
          resultImageUrls: photoUrls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "提交失败");
        return;
      }
      setOperation(data.operation);
      setVerifyMsg("已提交给学生，请等待学生填写 NAS 路径闭环。");
    } catch {
      setError("提交失败");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PageHeader title="扫码处理任务" />
        <div className="p-6 text-sm text-lab-muted">仅技术员可处理此任务。</div>
      </div>
    );
  }

  const done = operation?.status === "tech_submitted" || operation?.status === "closed";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="扫码处理任务"
        subtitle="① 扫小程序码 → ② 扫笼码核验 → ③ 选择操作并拍照 → ④ 提交给学生"
        action={
          <FluentButton size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
            刷新状态
          </FluentButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        {error ? (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        {/* Step 1: MP QR */}
        <GlassPanel className="mb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-lab-muted">步骤 1 · 打开小程序</p>
              <p className="text-sm text-lab-text">
                用手机微信扫描右侧小程序码并登录技术员账号，再在小程序内扫描笼上二维码。
              </p>
              <p className="text-xs font-medium text-lab-muted">学生派发的 Animal ID（须一致）</p>
              <p className="font-mono text-2xl font-bold tracking-wide text-thu">{animalId || "—"}</p>
              {animal ? (
                <p className="text-sm text-lab-muted">
                  {animal.strain} · 笼位 {animal.cageLocation || animal.cageId || "—"} · 认领：
                  {animal.claimantName || "—"}
                </p>
              ) : null}
              {operation ? (
                <p className="text-sm">
                  任务：<span className="font-semibold text-thu">{operation.title}</span>
                  <span className="text-lab-muted">
                    {" "}
                    · {KIND_LABEL[operation.kind] || operation.kind} ·{" "}
                    {OP_STATUS[operation.status] || operation.status}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-amber-800">暂无进行中 Operation；核验通过后可在本页创建并提交。</p>
              )}
            </div>
            <div className="shrink-0 rounded-2xl bg-white/90 p-3 text-center shadow-sm ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/miniprogram-qrcode.png"
                alt="小程序码"
                width={168}
                height={168}
                className="mx-auto h-[168px] w-[168px] object-contain"
              />
              <p className="mt-2 text-[11px] text-lab-muted">微信扫码打开小程序</p>
            </div>
          </div>
        </GlassPanel>

        {/* Step 2: verify cage */}
        <GlassPanel className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-lab-muted">
            步骤 2 · 扫笼码核验
          </p>
          <p className="mb-3 text-sm text-lab-muted">
            在小程序扫笼码后，将识别结果（或测试笼号如 ML0001）填入下方核对。必须与派发 ID{" "}
            <span className="font-mono font-semibold text-thu">{animalId}</span> 为同一只鼠。
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <FluentInput
              label="扫到的笼号 / Animal ID"
              className="min-w-[200px] flex-1"
              value={cageInput}
              onChange={(e) => setCageInput(e.target.value)}
              placeholder={animal?.cageId || animal?.cageLocation || "ML0001 或 M…"}
              disabled={done}
            />
            <FluentButton disabled={busy || done} onClick={() => void verifyCage()}>
              核验一致
            </FluentButton>
          </div>
          {verifyMsg ? (
            <p
              className={`mt-2 text-sm ${verified ? "text-emerald-800" : "text-rose-700"}`}
            >
              {verifyMsg}
            </p>
          ) : null}
        </GlassPanel>

        {/* Step 3–4: operate + submit */}
        <GlassPanel className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-lab-muted">
            步骤 3 · 选择操作并拍照 · 步骤 4 · 提交学生
          </p>
          {done ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              已提交给学生。学生填写 NAS 路径闭环后，该鼠可参与后续实验。
            </p>
          ) : (
            <div className="space-y-3">
              {!verified ? (
                <p className="text-sm text-amber-800">请先完成步骤 2 笼码核验，再填写操作与拍照。</p>
              ) : null}
              <FluentSelect
                label="本次做了什么"
                value={expKind}
                disabled={!verified || busy}
                onChange={(e) => {
                  const k = e.target.value as ExperimentKind;
                  setExpKind(k);
                  setExpTitle(KIND_LABEL[k]);
                }}
              >
                {EXPERIMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </FluentSelect>
              <FluentInput
                label="操作标题"
                value={expTitle}
                disabled={!verified || busy}
                onChange={(e) => setExpTitle(e.target.value)}
              />
              <FluentInput
                label="结果说明（可选）"
                value={resultNote}
                disabled={!verified || busy}
                onChange={(e) => setResultNote(e.target.value)}
              />
              <div>
                <p className="mb-1 text-[11px] font-medium text-lab-muted">拍照记录</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void onPickFiles(e.target.files)}
                />
                <FluentButton
                  variant="outline"
                  size="sm"
                  disabled={!verified || uploading || busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "上传中…" : `拍照 / 上传（已 ${photoUrls.length} 张）`}
                </FluentButton>
                {photoUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {photoUrls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="h-20 w-20 rounded-lg object-cover ring-1 ring-black/10"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <FluentButton
                disabled={!verified || busy || uploading}
                onClick={() => void submitToStudent()}
              >
                完成并提交给学生
              </FluentButton>
            </div>
          )}
        </GlassPanel>

        <div className="flex flex-wrap gap-2">
          <Link href="/">
            <FluentButton variant="outline" size="sm">
              返回工作台
            </FluentButton>
          </Link>
          <Link href={`/animals/lifecycle?animalId=${encodeURIComponent(animalId)}`}>
            <FluentButton variant="outline" size="sm">
              打开实验追溯
            </FluentButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
