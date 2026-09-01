"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { exportToCsv } from "@/lib/export";
import {
  canSuperviseAnimalFacility,
  isAnimalClaimantStudent,
  isAnimalExperimentTechnician,
  roleLabelV2,
} from "@/lib/roles";
import { ManagedAnimal } from "@/types/animal-management";
import {
  EXPERIMENT_KINDS,
  ExperimentKind,
  ExperimentOperation,
  AnimalLifecycleTraceEvent,
} from "@/types/animal-lifecycle";

const STATUS_LABEL: Record<string, string> = {
  blank_available: "空白鼠待认领",
  blank_claimed: "已认领待手术",
  awaiting_register: "待扫码建档",
  awaiting_experiment: "待实验",
  in_experiment: "实验中（已锁定）",
  deceased: "已结束",
};

const OP_STATUS: Record<string, string> = {
  open: "进行中 · 待技术员拍照完成",
  tech_submitted: "待学生填写 NAS",
  closed: "已闭环",
  force_closed: "主管强制关闭",
};

const KIND_LABEL: Record<ExperimentKind, string> = {
  ephys: "电生理 / 数据采集",
  behavior: "行为学",
  optotagging: "Optotagging",
  imaging: "成像",
  other: "其他",
};

type FlowStep = {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
  detail?: string;
};

function buildFlow(
  animal: ManagedAnimal,
  ops: ExperimentOperation[]
): FlowStep[] {
  const enrolled =
    Boolean(animal.registeredAt) ||
    animal.registrationStatus === "awaiting_experiment" ||
    animal.registrationStatus === "in_experiment" ||
    (ops.length > 0);
  const open = ops.find((o) => o.status === "open" || o.status === "tech_submitted");
  const latest = ops[0];
  const techDone = Boolean(
    open?.status === "tech_submitted" ||
      open?.status === "closed" ||
      latest?.status === "closed" ||
      latest?.techSubmittedAt
  );
  const studentDone = Boolean(
    open?.status === "closed" || latest?.status === "closed" || latest?.nasDataPath
  );
  const locked = Boolean(animal.animalLock || animal.registrationStatus === "in_experiment");

  return [
    {
      key: "enroll",
      label: "扫码录入 · 分配 ID",
      done: enrolled,
      active: !enrolled,
      detail: animal.id,
    },
    {
      key: "dispatch",
      label: "学生派发技术员",
      done: ops.length > 0 || locked,
      active: enrolled && !locked && ops.length === 0,
      detail: animal.technicianName || undefined,
    },
    {
      key: "tech",
      label: "技术员扫码 · 拍照完成",
      done: techDone && (open?.status !== "open"),
      active: open?.status === "open",
      detail: open?.title || latest?.title,
    },
    {
      key: "nas",
      label: "学生填写 NAS 路径",
      done: studentDone,
      active: open?.status === "tech_submitted",
      detail: open?.nasDataPath || latest?.nasDataPath,
    },
    {
      key: "ready",
      label: "可参与后续实验",
      done: enrolled && !locked && (ops.length === 0 || studentDone || latest?.status === "closed"),
      active: enrolled && !locked && ops.some((o) => o.status === "closed"),
    },
  ];
}

function FlowChart({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flex flex-col gap-0 sm:flex-row sm:items-stretch sm:gap-0">
      {steps.map((s, i) => (
        <div key={s.key} className="flex min-w-0 flex-1 items-stretch sm:flex-col">
          <div className="flex items-center sm:flex-col sm:items-center">
            <div
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                s.done && "bg-emerald-500 text-white",
                s.active && !s.done && "bg-thu text-white ring-4 ring-thu/20",
                !s.done && !s.active && "bg-slate-200 text-slate-500"
              )}
            >
              {s.done ? "✓" : i + 1}
            </div>
            {i < steps.length - 1 ? (
              <div
                className={clsx(
                  "mx-2 h-0.5 w-8 sm:mx-0 sm:my-1 sm:h-6 sm:w-0.5",
                  s.done ? "bg-emerald-400" : "bg-slate-200"
                )}
              />
            ) : null}
          </div>
          <div className="ml-2 min-w-0 pb-3 sm:ml-0 sm:mt-2 sm:pb-0 sm:text-center">
            <p
              className={clsx(
                "text-xs font-semibold",
                s.active ? "text-thu" : s.done ? "text-emerald-800" : "text-lab-muted"
              )}
            >
              {s.label}
            </p>
            {s.detail ? (
              <p className="mt-0.5 truncate text-[10px] text-lab-muted">{s.detail}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnimalLifecycleHub() {
  const { user } = useAuth();
  const params = useSearchParams();
  const [animals, setAnimals] = useState<ManagedAnimal[]>([]);
  const [operations, setOperations] = useState<ExperimentOperation[]>([]);
  const [traces, setTraces] = useState<AnimalLifecycleTraceEvent[]>([]);
  const [scanId, setScanId] = useState(params.get("animalId") ?? "");
  const [selected, setSelected] = useState<ManagedAnimal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expKind, setExpKind] = useState<ExperimentKind>("ephys");
  const [expTitle, setExpTitle] = useState("数据采集");
  const [resultNote, setResultNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [nasPath, setNasPath] = useState("");
  const [forceReason, setForceReason] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const role = user ? roleLabelV2(user.roles) : "student";
  const isStudent = user ? isAnimalClaimantStudent(user.roles) : false;
  const isTech = user ? isAnimalExperimentTechnician(user.roles) : false;
  const isSupervisor = user ? canSuperviseAnimalFacility(user.roles) : false;

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/animal-lifecycle", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      setAnimals(data.animals ?? []);
      setOperations(data.operations ?? []);
      setTraces(data.traces ?? []);
    } catch {
      setError("加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = params.get("animalId");
    if (id) void lookup(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function lookup(id: string) {
    const animalId = id.trim();
    if (!animalId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/animal-lifecycle?animalId=${encodeURIComponent(animalId)}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("not_found");
      const data = await res.json();
      setSelected(data.animal);
      setOperations(data.operations ?? []);
      setTraces(data.traces ?? []);
      setScanId(animalId);
    } catch {
      setError("未找到该 Animal ID");
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  async function patchOperation(
    id: string,
    action: string,
    extra: Record<string, unknown> = {}
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/experiment-operations", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "fail");
      }
      setNasPath("");
      setResultNote("");
      setPhotoUrls([]);
      await lookup(selected?.id || scanId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function uploadResultPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
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
        if (!res.ok || !data.url) {
          throw new Error(data.error || "upload_failed");
        }
        next.push(String(data.url));
      }
      setPhotoUrls(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "照片上传失败");
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  async function createOperation() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/experiment-operations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          animalId: selected.id,
          kind: expKind,
          title: expTitle,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "create_failed");
      }
      await lookup(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  const animalOps = useMemo(() => {
    if (!selected) return [];
    return operations
      .filter((o) => o.animalId === selected.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [operations, selected]);

  const openOp = animalOps.find((o) => o.status === "open");
  const pendingClose = animalOps.find((o) => o.status === "tech_submitted");

  const grouped = useMemo(() => {
    const map = new Map<string, ManagedAnimal[]>();
    for (const a of animals) {
      const key = a.claimantName || a.claimantUserId || "未认领";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"));
  }, [animals]);

  function exportAllLogs() {
    const headers = [
      "时间",
      "AnimalID",
      "操作",
      "操作人",
      "详情",
      "实验标题",
      "实验状态",
      "NAS",
    ];
    const rows: string[][] = traces.map((t) => {
      const op = operations.find((o) => o.id === t.operationId);
      return [
        t.timestamp,
        t.animalId,
        t.action,
        t.userName,
        t.details,
        op?.title ?? "",
        op ? OP_STATUS[op.status] ?? op.status : "",
        op?.nasDataPath ?? "",
      ];
    });
    for (const op of operations) {
      rows.push([
        op.createdAt,
        op.animalId,
        "operation_summary",
        op.technicianName,
        `${op.title} · ${KIND_LABEL[op.kind]} · ${OP_STATUS[op.status]}`,
        op.title,
        OP_STATUS[op.status] ?? op.status,
        op.nasDataPath ?? "",
      ]);
    }
    exportToCsv(
      `实验追溯全部日志_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="实验追溯"
        subtitle={
          isTech
            ? "查看各同学名下小鼠的处理流程；扫码后上传拍照记录"
            : "一鼠一闭环 · 流程图查看操作日志"
        }
        action={
          <FluentButton size="sm" variant="outline" onClick={exportAllLogs}>
            导出全部日志
          </FluentButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        <GlassPanel className="mb-4">
          <p className="text-sm text-lab-muted">
            当前身份：
            <span className="ml-1 font-semibold text-thu">
              {role === "student"
                ? "学生"
                : role === "technician"
                  ? "技术员"
                  : role === "supervisor"
                    ? "动物房主管"
                    : "管理员"}
            </span>
            <span className="ml-2">
              · 同一只小鼠须闭环完成当前实验后才可再次派发；可同时操作多只小鼠。
            </span>
          </p>
        </GlassPanel>

        {isStudent ? (
          <GlassPanel className="mb-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-thu">手机扫码录入小鼠</h3>
                <p className="mt-2 text-sm text-lab-muted">
                  在「代管动物」点「录入小鼠」，或直接扫右侧小程序码；在小程序内扫描鼠笼二维码即可分配唯一
                  ID。派发后请在此页填写 NAS 完成闭环。
                </p>
              </div>
              <div className="shrink-0 rounded-2xl bg-white/80 p-3 text-center shadow-sm ring-1 ring-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/miniprogram-qrcode.png"
                  alt="小程序码"
                  width={140}
                  height={140}
                  className="mx-auto h-[140px] w-[140px] object-contain"
                />
              </div>
            </div>
          </GlassPanel>
        ) : null}

        {error ? (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <GlassPanel className="mb-4">
          <h3 className="mb-2 font-semibold text-thu">查询 Animal ID / 笼码</h3>
          <div className="flex flex-wrap gap-2">
            <FluentInput
              className="min-w-[220px] flex-1"
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
              placeholder="M202608310001"
            />
            <FluentButton disabled={busy} onClick={() => void lookup(scanId)}>
              查看流程
            </FluentButton>
          </div>
        </GlassPanel>

        {selected ? (
          <GlassPanel className="mb-4">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-thu">{selected.id}</h3>
              <p className="text-sm text-lab-muted">
                {selected.strain} · {selected.cageLocation} · 认领：{selected.claimantName || "—"} ·
                技术员：{selected.technicianName || "—"}
              </p>
              <p className="mt-1 text-xs">
                状态：
                <span
                  className={clsx(
                    "ml-1 rounded px-2 py-0.5",
                    selected.animalLock ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"
                  )}
                >
                  {STATUS_LABEL[selected.registrationStatus ?? ""] ?? selected.registrationStatus ?? "—"}
                </span>
              </p>
            </div>

            <div className="mb-4 rounded-xl bg-white/70 p-4">
              <h4 className="mb-3 text-sm font-semibold text-thu">操作流程图</h4>
              <FlowChart steps={buildFlow(selected, animalOps)} />
            </div>

            {isStudent && pendingClose && pendingClose.studentUserId === user.id ? (
              <div className="mb-4 space-y-2 rounded-lg bg-violet-50/80 p-3">
                <p className="text-xs font-medium text-violet-900">
                  技术员已完成「{pendingClose.title}」，请填写本地 NAS 文件夹路径后闭环
                </p>
                <FluentInput
                  label="NAS 数据路径"
                  value={nasPath}
                  onChange={(e) => setNasPath(e.target.value)}
                  placeholder="\\\\NAS\\lab\\project\\mouse001\\"
                />
                <p className="text-[11px] text-lab-muted">路径生成规则后续接入，现阶段可手动填写。</p>
                <FluentButton
                  disabled={busy || !nasPath.trim()}
                  onClick={() =>
                    void patchOperation(pendingClose.id, "student_close", { nasDataPath: nasPath })
                  }
                >
                  完成闭环 · 可参与后续实验
                </FluentButton>
              </div>
            ) : null}

            {isTech && selected.registrationStatus === "awaiting_experiment" && !selected.animalLock ? (
              <div className="mb-4 space-y-2 border-t border-white/40 pt-3">
                <p className="text-xs font-medium text-lab-muted">
                  若学生尚未派发，技术员也可扫码后自行创建本次实验
                </p>
                <FluentSelect value={expKind} onChange={(e) => setExpKind(e.target.value as ExperimentKind)}>
                  {EXPERIMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </FluentSelect>
                <FluentInput value={expTitle} onChange={(e) => setExpTitle(e.target.value)} />
                <FluentButton disabled={busy} onClick={() => void createOperation()}>
                  开始处理（创建 Operation）
                </FluentButton>
              </div>
            ) : null}

            {isTech && openOp?.status === "open" && openOp.technicianUserId === user.id ? (
              <div className="mb-4 space-y-3 border-t border-white/40 pt-3">
                <p className="text-xs font-medium text-lab-muted">提交结果照片与说明</p>
                <FluentInput
                  label="结果说明"
                  value={resultNote}
                  onChange={(e) => setResultNote(e.target.value)}
                  placeholder="例如：行为学完成，鼠状态正常"
                />
                <div>
                  <p className="mb-1 text-[11px] font-medium text-lab-muted">结果照片（可多张）</p>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void uploadResultPhotos(e.target.files)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <FluentButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || uploading}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {uploading ? "上传中…" : "选择 / 拍照上传"}
                    </FluentButton>
                    <span className="text-xs text-lab-muted">已选 {photoUrls.length} 张</span>
                  </div>
                  {photoUrls.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {photoUrls.map((url) => (
                        <div key={url} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="h-20 w-20 rounded-lg object-cover ring-1 ring-black/10"
                          />
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] text-white"
                            onClick={() => removePhoto(url)}
                            aria-label="移除"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <FluentButton
                  disabled={busy || uploading || (!photoUrls.length && !resultNote.trim())}
                  onClick={() => {
                    if (!photoUrls.length) {
                      setError("请至少上传一张结果照片");
                      return;
                    }
                    void patchOperation(openOp.id, "tech_submit", {
                      resultNote,
                      resultImageUrls: photoUrls,
                    });
                  }}
                >
                  完成数据采集 · 通知学生填 NAS
                </FluentButton>
              </div>
            ) : null}

            {isSupervisor && (openOp || pendingClose) ? (
              <div className="mb-4 space-y-2 border-t border-white/40 pt-3">
                <FluentInput
                  label="强制关闭原因"
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                />
                <FluentButton
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void patchOperation((openOp || pendingClose)!.id, "force_close", {
                      reason: forceReason,
                    })
                  }
                >
                  主管强制关闭
                </FluentButton>
              </div>
            ) : null}

            <div className="border-t border-white/40 pt-3">
              <h4 className="mb-2 text-sm font-semibold">历史 Operation</h4>
              {!animalOps.length ? (
                <p className="text-xs text-lab-muted">暂无实验记录</p>
              ) : (
                <ul className="space-y-2">
                  {animalOps.map((op) => (
                    <li key={op.id} className="rounded-lg bg-white/60 p-2 text-xs">
                      <span className="font-semibold text-thu">{op.title}</span> · {KIND_LABEL[op.kind]} ·{" "}
                      {OP_STATUS[op.status]} · 技术员 {op.technicianName}
                      {op.resultImageUrls?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {op.resultImageUrls.map((url) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={url}
                              src={url}
                              alt=""
                              className="h-14 w-14 rounded object-cover ring-1 ring-black/10"
                            />
                          ))}
                        </div>
                      ) : null}
                      {op.nasDataPath ? (
                        <p className="mt-1 text-lab-muted">NAS: {op.nasDataPath}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {traces.length ? (
              <div className="mt-4 border-t border-white/40 pt-3">
                <h4 className="mb-2 text-sm font-semibold">操作日志</h4>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                  {traces.map((t) => (
                    <li key={t.id} className="rounded bg-white/50 p-2">
                      <span className="text-lab-muted">
                        {t.timestamp.slice(0, 19).replace("T", " ")}
                      </span>
                      · {t.userName} · {t.details}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </GlassPanel>
        ) : null}

        <GlassPanel>
          <h3 className="mb-3 font-semibold text-thu">
            {isTech || isSupervisor ? "各同学名下小鼠" : "我的小鼠"}
          </h3>
          {grouped.length === 0 ? (
            <p className="text-sm text-lab-muted">暂无小鼠。学生请先扫码录入。</p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([owner, list]) => (
                <div key={owner}>
                  {(isTech || isSupervisor) && (
                    <p className="mb-1 text-xs font-semibold text-lab-muted">{owner}</p>
                  )}
                  <ul className="divide-y divide-white/30">
                    {list.map((a) => {
                      const ops = operations.filter((o) => o.animalId === a.id);
                      const steps = buildFlow(a, ops);
                      const active = steps.find((s) => s.active)?.label;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="flex w-full flex-col gap-1 py-2.5 text-left hover:bg-white/40 sm:flex-row sm:items-center sm:justify-between"
                            onClick={() => void lookup(a.id)}
                          >
                            <span className="font-medium text-thu">{a.id}</span>
                            <span className="text-xs text-lab-muted">
                              {STATUS_LABEL[a.registrationStatus ?? ""] ?? "—"}
                              {active ? ` · 当前：${active}` : ""}
                            </span>
                          </button>
                          <div className="pb-3 pl-1 opacity-90">
                            <FlowChart steps={steps} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
