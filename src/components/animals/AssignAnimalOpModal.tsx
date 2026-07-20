"use client";

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
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [necessary, setNecessary] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [startLocal, setStartLocal] = useState(() => toLocalInput(new Date()));
  const [endLocal, setEndLocal] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return toLocalInput(d);
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setNote("");
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
          .filter((u) => canReceiveAnimalOps(u.roles))
          .sort((a, b) => {
            const ia = preferred.indexOf(a.email);
            const ib = preferred.indexOf(b.email);
            const ra = ia === -1 ? 999 : ia;
            const rb = ib === -1 ? 999 : ib;
            if (ra !== rb) return ra - rb;
            return a.name.localeCompare(b.name, "zh");
          });
        setStaff(list);
        if (!assigneeId && list[0]) setAssigneeId(list[0].id);
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
    } catch {
      setMsg(o.createFail);
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
          <FluentButton disabled={saving || !assigneeId} onClick={() => void submit()}>
            {o.submit}
          </FluentButton>
        </div>
      }
    >
      <p className="mb-3 text-xs text-lab-muted">
        {o.assignHint.replace("{n}", String(animalIds.length))}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
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
      </div>

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
