"use client";
import { AntIcon } from "@/components/ui/AntIcon";


import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { FluentModal } from "@/components/fluent/FluentModal";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentSelect } from "@/components/fluent/FluentField";
import { useLocale } from "@/components/providers/LocaleProvider";
import { api, PublicUser } from "@/lib/api/client";
import { canReceiveAnimalOps } from "@/lib/roles";
import { displayName } from "@/lib/users";
import {
  ANIMAL_OP_TYPES,
  AnimalOpTask,
  AnimalOpType,
  URGENCY_COLORS,
  urgencyFromFlags,
} from "@/types/animal-ops";

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string {
  return new Date(s).toISOString();
}

interface AssignAnimalOpModalProps {
  open: boolean;
  animalIds: string[];
  onClose: () => void;
  onCreated: () => void;
}

export function AssignAnimalOpModal({
  open,
  animalIds,
  onClose,
  onCreated,
}: AssignAnimalOpModalProps) {
  const { t } = useLocale();
  const o = t.animalMgmt.animalOps;
  const [staff, setStaff] = useState<PublicUser[]>([]);
  const [assigneeTasks, setAssigneeTasks] = useState<AnimalOpTask[]>([]);
  const [opType, setOpType] = useState<AnimalOpType>("fasting");
  const [steps, setSteps] = useState<{ opType: AnimalOpType; assigneeUserId: string }[]>([]);
  const [assistantNames,setAssistantNames] = useState("");
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [necessary, setNecessary] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const defaultHours = () => { const d=new Date(); const start=new Date(d); start.setHours(9,0,0,0); const end=new Date(d); end.setHours(18,0,0,0); return {start,end}; };
  const [startLocal, setStartLocal] = useState(() => toLocalInput(defaultHours().start));
  const [endLocal, setEndLocal] = useState(() => toLocalInput(defaultHours().end));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    const {start,end}=defaultHours();setStartLocal(toLocalInput(start));setEndLocal(toLocalInput(end));
    setNote("");
    setSteps([]);
    (async () => {
      try {
        const { users } = await api.users();
        const preferred = [
          "liqintong@lab.edu.cn",
          "laihongfang@lab.edu.cn",
          "chensisi@lab.edu.cn",
          "chenhongzhen@lab.edu.cn",
          "lvxinwei@lab.edu.cn",
        ];
        const list = users
          .filter((u) => canReceiveAnimalOps(u.roles) && (u.accountStatus ?? "active") === "active")
          .sort((a, b) => {
            const ia = preferred.indexOf(a.email);
            const ib = preferred.indexOf(b.email);
            const ra = ia === -1 ? 999 : ia;
            const rb = ib === -1 ? 999 : ib;
            if (ra !== rb) return ra - rb;
            return a.name.localeCompare(b.name, "zh");
          });
        setStaff(list);
        if (!list.some(u=>u.id===assigneeId) && list[0]) setAssigneeId(list[0].id);
      } catch {
        setStaff([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !assigneeId) {
      setAssigneeTasks([]);
      return;
    }
    (async () => {
      try {
        const { tasks } = await api.animalOpTasks({ assigneeId });
        setAssigneeTasks(tasks.filter((x) => x.status === "scheduled"));
      } catch {
        setAssigneeTasks([]);
      }
    })();
  }, [open, assigneeId]);

  const urgency = urgencyFromFlags(necessary, urgent);
  const urgencyLabel =
    urgency === "critical"
      ? o.urgencyCritical
      : urgency === "important"
        ? o.urgencyImportant
        : urgency === "urgent"
          ? o.urgencyUrgent
          : o.urgencyNormal;

  const busySlots = useMemo(
    () =>
      [...assigneeTasks]
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, 8),
    [assigneeTasks]
  );

  async function submit() {
    if (!assigneeId || animalIds.length === 0) return;
    setSaving(true);
    setMsg("");
    try {
      await api.createAnimalOpTask({
        animalIds,
        steps,
        assistantNames,
        opType,
        note,
        assigneeUserId: assigneeId,
        necessary,
        urgent,
        startTime: fromLocalInput(startLocal),
        endTime: fromLocalInput(endLocal),
      });
      setMsg(o.createOk);
      onCreated();
      setTimeout(onClose, 500);
    } catch (e) {
      const code=e instanceof Error?e.message:"";
      const messages:Record<string,string>={animal_locked:"小鼠已有未闭环实验，请先完成当前任务和学生确认。",invalid_assignee:"负责人账号尚未激活或无动物操作权限，请重新选择。",invalid_or_unauthorized_animals:"所选小鼠已退出、已处死，或不属于当前账号，请刷新后重选。",account_not_active:"当前账号尚未激活，请联系管理员。",invalid_duration:"结束时间须晚于开始时间。",euthanasia_must_be_last:"处死必须是最后一个步骤。",unauthorized:"登录已过期，请重新登录。",invalid_body:"请完整填写操作、负责人及时间。"};
      setMsg(messages[code] || `${o.createFail}（${code || "网络异常"}）`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FluentModal
      open={open}
      title={o.assignTitle}
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <FluentButton variant="outline" onClick={onClose}>
            {t.common.cancel}
          </FluentButton>
          <FluentButton disabled={saving || !assigneeId || steps.some((s) => !s.assigneeUserId)} onClick={() => void submit()}>
            {o.submit}
          </FluentButton>
        </div>
      }
    >
      <p className="mb-3 text-xs text-lab-muted">
        {o.assignHint.replace("{n}", String(animalIds.length))}
      </p>

      <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="mb-1 block text-xs text-lab-muted">{o.opType}</label>
          <FluentSelect
            value={opType}
            onChange={(e) => setOpType(e.target.value as AnimalOpType)}
          >
            {ANIMAL_OP_TYPES.map((k) => (
              <option key={k} value={k}>
                {o.types[k]}
              </option>
            ))}
          </FluentSelect>
        </div>
        <div>
          <label className="mb-1 block text-xs text-lab-muted">{o.assignee}</label>
          <FluentSelect value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">{o.pickAssignee}</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)}
              </option>
            ))}
          </FluentSelect>
        </div>
      <div className="flex justify-end">
        <FluentButton variant="outline" onClick={() => setSteps([...steps, { opType: "fasting", assigneeUserId: "" }])} aria-label="新增操作步骤"><AntIcon name="plus" className="h-4 w-4"/></FluentButton>
      </div>
      </div>
      {steps.map((step, index) => (
        <div key={index} className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <FluentSelect label={"步骤 " + (index + 2)} value={step.opType} onChange={(e) => setSteps(steps.map((s, i) => i === index ? { ...s, opType: e.target.value as AnimalOpType } : s))}>
            {ANIMAL_OP_TYPES.map((k) => <option key={k} value={k}>{o.types[k]}</option>)}
          </FluentSelect>
          <FluentSelect label={o.assignee} value={step.assigneeUserId} onChange={(e) => setSteps(steps.map((s, i) => i === index ? { ...s, assigneeUserId: e.target.value } : s))}>
            <option value="">{o.pickAssignee}</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{displayName(u)}</option>)}
          </FluentSelect>
          <FluentButton variant="outline" aria-label="移除步骤" title="移除步骤" onClick={() => setSteps(steps.filter((_, i) => i !== index))}>
            <AntIcon name="delete" className="h-4 w-4"/>
          </FluentButton>
        </div>
      ))}
      <label className="block text-sm">协助人（可选，主负责人操作流程）<input className="block w-full rounded border p-2" value={assistantNames} onChange={e=>setAssistantNames(e.target.value)} placeholder="可填写多名协助人" /></label>
      {steps.length > 0 && <p className="mt-2 text-xs text-lab-muted">按步骤顺序派发，前一步完成后自动通知下一位负责人。实验步骤在 NAS 闭环后完成交接。</p>}
      <div className="mt-3">
        <label className="mb-1 block text-xs text-lab-muted">{o.note}</label>
        <input
          className="fluent-input w-full rounded-lg px-3 py-2 text-sm shadow-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={o.notePlaceholder}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-lab-text">
          <input
            type="checkbox"
            checked={necessary}
            onChange={(e) => setNecessary(e.target.checked)}
          />
          {o.necessary}
        </label>
        <label className="flex items-center gap-2 text-sm text-lab-text">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          {o.urgent}
        </label>
        <span
          className="rounded px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: URGENCY_COLORS[urgency] }}
        >
          {urgencyLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-lab-muted">{o.startTime}</label>
          <input
            type="datetime-local"
            className="fluent-input w-full rounded-lg px-3 py-2 text-sm shadow-sm"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-lab-muted">{o.endTime}</label>
          <input
            type="datetime-local"
            className="fluent-input w-full rounded-lg px-3 py-2 text-sm shadow-sm"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
          />
        </div>
      </div>

      {assigneeId && (
        <div className="mt-4 rounded-lg border border-white/40 bg-white/40 p-3">
          <p className="mb-2 text-xs font-semibold text-thu">{o.busyTitle}</p>
          {busySlots.length === 0 ? (
            <p className="text-xs text-lab-muted">{o.busyEmpty}</p>
          ) : (
            <ul className="space-y-1">
              {busySlots.map((task) => (
                <li
                  key={task.id}
                  className={clsx("flex items-center gap-2 rounded px-2 py-1 text-[11px]")}
                  style={{ borderLeft: `3px solid ${URGENCY_COLORS[task.urgency]}` }}
                >
                  <span className="text-lab-muted">
                    {new Date(task.startTime).toLocaleString()} –{" "}
                    {new Date(task.endTime).toLocaleTimeString()}
                  </span>
                  <span className="text-lab-text">{o.types[task.opType]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-thu">{msg}</p>}
    </FluentModal>
  );
}
