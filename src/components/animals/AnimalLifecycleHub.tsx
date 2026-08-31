"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/context/AuthContext";
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
  open: "进行中",
  tech_submitted: "待学生闭环",
  closed: "已闭环",
  force_closed: "主管强制关闭",
};

const KIND_LABEL: Record<ExperimentKind, string> = {
  ephys: "电生理",
  behavior: "行为学",
  optotagging: "Optotagging",
  imaging: "成像",
  other: "其他",
};

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

  const [cageLabel, setCageLabel] = useState("");
  const [expKind, setExpKind] = useState<ExperimentKind>("ephys");
  const [expTitle, setExpTitle] = useState("电生理实验");
  const [resultNote, setResultNote] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [nasPath, setNasPath] = useState("");
  const [forceReason, setForceReason] = useState("");

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

  async function postLifecycle(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/animal-lifecycle", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, animalId: selected?.id ?? scanId, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "failed");
      if (data.animal) {
        setSelected(data.animal);
        setScanId(data.animal.id);
      }
      await load();
      if (data.animal?.id) await lookup(data.animal.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function patchOperation(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/experiment-operations", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "failed");
      await load();
      if (selected) await lookup(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function createOperation() {
    if (!selected) return;
    setBusy(true);
    setError("");
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "failed");
      await load();
      await lookup(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法创建实验");
    } finally {
      setBusy(false);
    }
  }

  const animalOps = useMemo(
    () => (selected ? operations.filter((o) => o.animalId === selected.id) : []),
    [operations, selected]
  );
  const openOp = animalOps.find((o) => o.status === "open" || o.status === "tech_submitted");
  const pendingClose = animalOps.find((o) => o.status === "tech_submitted");

  const myAnimals = useMemo(() => {
    if (!user) return animals;
    if (isSupervisor) return animals;
    if (isStudent) return animals.filter((a) => a.claimantUserId === user.id);
    if (isTech) return animals.filter((a) => a.technicianUserId === user.id || a.claimantUserId);
    return animals;
  }, [animals, user, isSupervisor, isStudent, isTech]);

  if (!user) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title="实验追溯 · 全生命周期" />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        <GlassPanel className="mb-4">
          <p className="text-sm text-lab-muted">
            一鼠一 ID、一鼠一闭环。当前身份：
            <span className="ml-1 font-semibold text-thu">
              {role === "student"
                ? "学生（认领员）"
                : role === "technician"
                  ? "技术员"
                  : role === "supervisor"
                    ? "动物房主管"
                    : "管理员"}
            </span>
          </p>
        </GlassPanel>

        {error ? (
          <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <GlassPanel className="mb-4">
          <h3 className="mb-2 font-semibold text-thu">扫描 / 输入 Animal ID</h3>
          <div className="flex flex-wrap gap-2">
            <FluentInput
              className="min-w-[220px] flex-1"
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
              placeholder="M202608310001 或笼位二维码内容"
            />
            <FluentButton disabled={busy} onClick={() => void lookup(scanId)}>
              确认 ID
            </FluentButton>
          </div>
        </GlassPanel>

        {selected ? (
          <GlassPanel className="mb-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-thu">{selected.id}</h3>
                <p className="text-sm text-lab-muted">
                  {selected.strain} · {selected.cageLocation} · 认领：{selected.claimantName || "—"}
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
                    {selected.animalLock ? " · Animal Lock ON" : ""}
                  </span>
                </p>
              </div>
            </div>

            {isStudent && selected.claimantUserId === user.id ? (
              <div className="mb-4 space-y-2 border-t border-white/40 pt-3">
                <p className="text-xs font-medium text-lab-muted">学生操作</p>
                {selected.registrationStatus === "blank_available" ||
                (selected.purpose === "blank" && !selected.claimantUserId) ? (
                  <FluentButton disabled={busy} onClick={() => void postLifecycle("claim_blank")}>
                    认领空白鼠
                  </FluentButton>
                ) : null}
                {selected.registrationStatus === "blank_claimed" ? (
                  <>
                    <FluentInput
                      label="笼牌备注"
                      value={cageLabel}
                      onChange={(e) => setCageLabel(e.target.value)}
                      placeholder="笼牌信息"
                    />
                    <FluentButton
                      disabled={busy}
                      onClick={() => void postLifecycle("complete_surgery", { cageLabelNote: cageLabel })}
                    >
                      标记植入手术完成
                    </FluentButton>
                  </>
                ) : null}
                {selected.registrationStatus === "awaiting_register" ? (
                  <FluentButton disabled={busy} onClick={() => void postLifecycle("register")}>
                    扫码确认 · 正式建档
                  </FluentButton>
                ) : null}
                {pendingClose && pendingClose.studentUserId === user.id ? (
                  <div className="space-y-2 rounded-lg bg-violet-50/80 p-3">
                    <p className="text-xs text-violet-900">待闭环：{pendingClose.title}</p>
                    <FluentInput
                      label="NAS 数据路径"
                      value={nasPath}
                      onChange={(e) => setNasPath(e.target.value)}
                      placeholder="\\\\NAS\\lab\\project\\mouse001\\"
                    />
                    <FluentButton
                      disabled={busy || !nasPath.trim()}
                      onClick={() =>
                        void patchOperation(pendingClose.id, "student_close", { nasDataPath: nasPath })
                      }
                    >
                      完成实验 · 解除锁定
                    </FluentButton>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isTech && selected.registrationStatus === "awaiting_experiment" && !selected.animalLock ? (
              <div className="mb-4 space-y-2 border-t border-white/40 pt-3">
                <p className="text-xs font-medium text-lab-muted">技术员操作（自动绑定 {user.name}）</p>
                <FluentSelect value={expKind} onChange={(e) => setExpKind(e.target.value as ExperimentKind)}>
                  {EXPERIMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </FluentSelect>
                <FluentInput value={expTitle} onChange={(e) => setExpTitle(e.target.value)} />
                <FluentButton disabled={busy} onClick={() => void createOperation()}>
                  创建本次 Operation
                </FluentButton>
              </div>
            ) : null}

            {isTech && openOp?.status === "open" && openOp.technicianUserId === user.id ? (
              <div className="mb-4 space-y-2 border-t border-white/40 pt-3">
                <p className="text-xs font-medium text-lab-muted">提交实验结果</p>
                <FluentInput
                  label="结果说明"
                  value={resultNote}
                  onChange={(e) => setResultNote(e.target.value)}
                />
                <FluentInput
                  label="结果图片路径/链接"
                  value={resultUrl}
                  onChange={(e) => setResultUrl(e.target.value)}
                  placeholder="上传后填写路径或 URL"
                />
                <FluentButton
                  disabled={busy}
                  onClick={() =>
                    void patchOperation(openOp.id, "tech_submit", {
                      resultNote,
                      resultImageUrl: resultUrl,
                    })
                  }
                >
                  技术员提交 · 通知学生
                </FluentButton>
              </div>
            ) : null}

            {isSupervisor && openOp ? (
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
                    void patchOperation(openOp.id, "force_close", { reason: forceReason })
                  }
                >
                  主管强制关闭
                </FluentButton>
              </div>
            ) : null}

            <div className="border-t border-white/40 pt-3">
              <h4 className="mb-2 text-sm font-semibold">Operation 记录</h4>
              {!animalOps.length ? (
                <p className="text-xs text-lab-muted">暂无实验记录</p>
              ) : (
                <ul className="space-y-2">
                  {animalOps.map((op) => (
                    <li key={op.id} className="rounded-lg bg-white/60 p-2 text-xs">
                      <span className="font-semibold text-thu">{op.title}</span> · {KIND_LABEL[op.kind]} ·{" "}
                      {OP_STATUS[op.status]} · 技术员 {op.technicianName}
                      {op.nasDataPath ? (
                        <p className="mt-1 text-lab-muted">NAS: {op.nasDataPath}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </GlassPanel>
        ) : null}

        <GlassPanel>
          <h3 className="mb-2 font-semibold text-thu">我的小鼠</h3>
          <ul className="divide-y divide-white/30">
            {myAnimals.slice(0, 30).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-white/40"
                  onClick={() => void lookup(a.id)}
                >
                  <span className="font-medium text-thu">{a.id}</span>
                  <span className="text-xs text-lab-muted">
                    {STATUS_LABEL[a.registrationStatus ?? ""] ?? "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </GlassPanel>

        {selected && traces.length ? (
          <GlassPanel className="mt-4">
            <h3 className="mb-2 font-semibold text-thu">生命周期追溯</h3>
            <ul className="space-y-2 text-xs">
              {traces.map((t) => (
                <li key={t.id} className="rounded bg-white/50 p-2">
                  <span className="text-lab-muted">{t.timestamp.slice(0, 19).replace("T", " ")}</span>
                  · {t.userName} · {t.details}
                </li>
              ))}
            </ul>
          </GlassPanel>
        ) : null}
      </div>
    </div>
  );
}
