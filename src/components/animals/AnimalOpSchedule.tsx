"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentModal } from "@/components/fluent/FluentModal";
import { FluentInput } from "@/components/fluent/FluentField";
import { useLocale } from "@/components/providers/LocaleProvider";
import { api } from "@/lib/api/client";
import { AnimalOpTask, URGENCY_COLORS } from "@/types/animal-ops";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7–20
const DAY_START_H = 7;
const DAY_END_H = 21; // exclusive visual end
const PX_PER_HOUR = 48;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + mondayOffset);
  return x;
}

function buildMonthGrid(monthStart: Date): (string | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sortTasks(list: AnimalOpTask[]): AnimalOpTask[] {
  return [...list].sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (so !== 0) return so;
    return a.startTime.localeCompare(b.startTime);
  });
}

type ViewMode = "gantt" | "calendar";

/** Hour-precise schedule: Gantt week or large month calendar; drag to reschedule / reorder. */
export function AnimalOpSchedule({
  userId,
  onTasksChange,
}: {
  userId: string;
  onTasksChange?: (tasks: AnimalOpTask[]) => void;
}) {
  const { t, isZh } = useLocale();
  const o = t.animalMgmt.animalOps;
  const [tasks, setTasks] = useState<AnimalOpTask[]>([]);
  const [view, setView] = useState<ViewMode>("gantt");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [receiptNote, setReceiptNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { tasks: list } = await api.animalOpTasks({ mine: true });
      const mine = list.filter((x) => x.assigneeUserId === userId);
      setTasks(mine);
      onTasksChange?.(mine);
    } catch {
      setTasks([]);
      onTasksChange?.([]);
    }
    // onTasksChange is intentionally omitted — parent often passes an inline setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduled = useMemo(
    () => sortTasks(tasks.filter((x) => x.status === "scheduled")),
    [tasks]
  );

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const calCells = useMemo(() => buildMonthGrid(calMonth), [calMonth]);

  async function reschedule(taskId: string, day: Date, hour: number, minute = 0) {
    const task = tasks.find((x) => x.id === taskId);
    if (!task) return;
    const duration = Math.max(
      new Date(task.endTime).getTime() - new Date(task.startTime).getTime(),
      30 * 60 * 1000
    );
    const start = new Date(day);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + duration);
    try {
      await api.updateAnimalOpTask({
        id: task.id,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      setMsg(o.rescheduleOk);
      await load();
      setTimeout(() => setMsg(""), 1500);
    } catch {
      setMsg(o.rescheduleFail);
    }
  }

  async function reorderOnDay(targetId: string, beforeId: string | null, day: Date) {
    const key = dayKey(day);
    const dayTasks = sortTasks(
      scheduled.filter((t) => dayKey(new Date(t.startTime)) === key)
    );
    const moving = dayTasks.find((t) => t.id === targetId);
    if (!moving) return;
    const rest = dayTasks.filter((t) => t.id !== targetId);
    const insertAt = beforeId ? rest.findIndex((t) => t.id === beforeId) : rest.length;
    const idx = insertAt < 0 ? rest.length : insertAt;
    const next = [...rest.slice(0, idx), moving, ...rest.slice(idx)];
    try {
      await Promise.all(
        next.map((t, i) => api.updateAnimalOpTask({ id: t.id, sortOrder: i }))
      );
      setMsg(o.reorderOk);
      await load();
      setTimeout(() => setMsg(""), 1500);
    } catch {
      setMsg(o.rescheduleFail);
    }
  }

  async function confirmComplete() {
    if (!completeId) return;
    setSaving(true);
    try {
      await api.updateAnimalOpTask({
        id: completeId,
        status: "done",
        receiptNote: receiptNote.trim() || undefined,
      });
      setCompleteId(null);
      setReceiptNote("");
      setMsg(o.completeOk);
      await load();
      setTimeout(() => setMsg(""), 2000);
    } catch {
      setMsg(o.rescheduleFail);
    } finally {
      setSaving(false);
    }
  }

  function tasksOnDay(key: string): AnimalOpTask[] {
    return sortTasks(scheduled.filter((t) => dayKey(new Date(t.startTime)) === key));
  }

  function ganttStyle(task: AnimalOpTask) {
    const s = new Date(task.startTime);
    const e = new Date(task.endTime);
    const startH = s.getHours() + s.getMinutes() / 60;
    const endH = e.getHours() + e.getMinutes() / 60;
    const top = Math.max(0, (startH - DAY_START_H) * PX_PER_HOUR);
    const height = Math.max(PX_PER_HOUR * 0.45, (endH - startH) * PX_PER_HOUR);
    return { top, height };
  }

  const completeTask = completeId ? tasks.find((x) => x.id === completeId) : null;

  return (
    <GlassPanel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-thu">{o.scheduleTitle}</p>
          <p className="mt-0.5 text-[10px] text-lab-muted">{o.scheduleHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#E0D4E8] bg-white/60 p-0.5">
            <button
              type="button"
              className={clsx(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                view === "gantt" ? "bg-thu text-white" : "text-lab-muted hover:text-thu"
              )}
              onClick={() => setView("gantt")}
            >
              {o.viewGantt}
            </button>
            <button
              type="button"
              className={clsx(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                view === "calendar" ? "bg-thu text-white" : "text-lab-muted hover:text-thu"
              )}
              onClick={() => setView("calendar")}
            >
              {o.viewCalendar}
            </button>
          </div>
          {view === "gantt" ? (
            <div className="flex items-center gap-1">
              <FluentButton
                size="sm"
                variant="outline"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() - 7);
                  setWeekStart(d);
                }}
              >
                ‹
              </FluentButton>
              <span className="min-w-[140px] text-center text-[11px] text-lab-muted">
                {dayKey(days[0])} ~ {dayKey(days[6])}
              </span>
              <FluentButton
                size="sm"
                variant="outline"
                onClick={() => {
                  const d = new Date(weekStart);
                  d.setDate(d.getDate() + 7);
                  setWeekStart(d);
                }}
              >
                ›
              </FluentButton>
              <FluentButton
                size="sm"
                variant="ghost"
                onClick={() => setWeekStart(mondayOf(new Date()))}
              >
                {o.thisWeek}
              </FluentButton>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <FluentButton
                size="sm"
                variant="outline"
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                }
              >
                ‹
              </FluentButton>
              <span className="min-w-[88px] text-center text-[11px] text-lab-muted">
                {calMonth.getFullYear()}-{String(calMonth.getMonth() + 1).padStart(2, "0")}
              </span>
              <FluentButton
                size="sm"
                variant="outline"
                onClick={() =>
                  setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                }
              >
                ›
              </FluentButton>
            </div>
          )}
        </div>
      </div>

      {msg && <p className="mb-2 text-xs text-thu">{msg}</p>}

      {view === "gantt" ? (
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div
              className="grid border-b border-[#E0D4E8] pb-1"
              style={{ gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))` }}
            >
              <div />
              {days.map((d) => (
                <div key={dayKey(d)} className="px-1 text-center text-[11px] font-medium text-lab-text">
                  {isZh
                    ? `${d.getMonth() + 1}/${d.getDate()} 周${"日一二三四五六"[d.getDay()]}`
                    : d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}
                </div>
              ))}
            </div>
            <div
              className="grid"
              style={{ gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))` }}
            >
              <div className="relative" style={{ height: (DAY_END_H - DAY_START_H) * PX_PER_HOUR }}>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-white/40 text-[10px] text-lab-muted"
                    style={{ top: (h - DAY_START_H) * PX_PER_HOUR }}
                  >
                    {h}:00
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const key = dayKey(d);
                const dayTasks = tasksOnDay(key);
                return (
                  <div
                    key={key}
                    className="relative border-l border-white/30 bg-white/15"
                    style={{ height: (DAY_END_H - DAY_START_H) * PX_PER_HOUR }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragId) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const hourFloat = DAY_START_H + y / PX_PER_HOUR;
                      const hour = Math.max(DAY_START_H, Math.min(20, Math.floor(hourFloat)));
                      const minute = hourFloat % 1 >= 0.5 ? 30 : 0;
                      const id = dragId;
                      setDragId(null);
                      void reschedule(id, d, hour, minute);
                    }}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-white/25"
                        style={{ top: (h - DAY_START_H) * PX_PER_HOUR, height: PX_PER_HOUR }}
                      />
                    ))}
                    {dayTasks.map((task, i) => {
                      const { top, height } = ganttStyle(task);
                      const lane = i % 3;
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDragId(task.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!dragId || dragId === task.id) return;
                            const id = dragId;
                            setDragId(null);
                            void reorderOnDay(id, task.id, d);
                          }}
                          className="absolute z-10 cursor-grab overflow-hidden rounded-md px-1.5 py-1 text-[10px] text-white shadow-sm active:cursor-grabbing"
                          style={{
                            top,
                            height,
                            left: `calc(${lane * 28}% + 2px)`,
                            width: "calc(44% - 4px)",
                            backgroundColor: URGENCY_COLORS[task.urgency],
                          }}
                          title={`${o.types[task.opType]} · ${task.note || task.createdByName}`}
                        >
                          <div className="truncate font-semibold">{o.types[task.opType]}</div>
                          <div className="truncate opacity-90">
                            {task.animalIds.length} · {task.createdByName}
                          </div>
                          <button
                            type="button"
                            className="mt-0.5 underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompleteId(task.id);
                              setReceiptNote("");
                            }}
                          >
                            {o.markDone}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-lab-muted">
            {(isZh ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"]).map(
              (label, i) => (
                <div key={`${label}-${i}`}>{label}</div>
              )
            )}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calCells.map((cell, i) =>
              cell ? (
                <div
                  key={cell}
                  className="min-h-[110px] rounded-lg border border-[#E0D4E8] bg-white/50 p-1"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (!dragId) return;
                    const task = tasks.find((x) => x.id === dragId);
                    setDragId(null);
                    if (!task) return;
                    const [y, m, d] = cell.split("-").map(Number);
                    const start = new Date(task.startTime);
                    void reschedule(task.id, new Date(y, m - 1, d), start.getHours(), start.getMinutes());
                  }}
                >
                  <p className="mb-1 text-[11px] font-semibold text-thu">{Number(cell.slice(-2))}</p>
                  <div className="space-y-0.5">
                    {tasksOnDay(cell).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDragId(task.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!dragId || dragId === task.id) return;
                          const id = dragId;
                          setDragId(null);
                          const [y, m, d] = cell.split("-").map(Number);
                          void reorderOnDay(id, task.id, new Date(y, m - 1, d));
                        }}
                        className="cursor-grab rounded px-1 py-0.5 text-[9px] leading-tight text-white active:cursor-grabbing"
                        style={{ backgroundColor: URGENCY_COLORS[task.urgency] }}
                      >
                        <div className="truncate font-medium">
                          {new Date(task.startTime).getHours()}:
                          {String(new Date(task.startTime).getMinutes()).padStart(2, "0")}{" "}
                          {o.types[task.opType]}
                        </div>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            setCompleteId(task.id);
                            setReceiptNote("");
                          }}
                        >
                          {o.markDone}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={`e-${i}`} className="min-h-[110px]" />
              )
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-lab-muted">
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: URGENCY_COLORS.critical }} />
          {o.urgencyCritical}
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: URGENCY_COLORS.important }} />
          {o.urgencyImportant}
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: URGENCY_COLORS.urgent }} />
          {o.urgencyUrgent}
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: URGENCY_COLORS.normal }} />
          {o.urgencyNormal}
        </span>
      </div>

      <FluentModal
        open={!!completeId}
        title={o.completeTitle}
        onClose={() => {
          if (!saving) {
            setCompleteId(null);
            setReceiptNote("");
          }
        }}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton
              variant="outline"
              disabled={saving}
              onClick={() => {
                setCompleteId(null);
                setReceiptNote("");
              }}
            >
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={saving} onClick={() => void confirmComplete()}>
              {saving ? t.common.loading : o.completeSubmit}
            </FluentButton>
          </div>
        }
      >
        {completeTask && (
          <div className="space-y-3 text-sm">
            <p className="text-lab-muted">{o.completeHint}</p>
            <p>
              <span className="font-medium text-thu">{o.types[completeTask.opType]}</span>
              {" · "}
              {completeTask.animalIds.length} {isZh ? "只" : "mice"}
              {" · "}
              {completeTask.createdByName}
            </p>
            <FluentInput
              label={o.receiptLabel}
              value={receiptNote}
              onChange={(e) => setReceiptNote(e.target.value)}
              placeholder={o.receiptPlaceholder}
            />
          </div>
        )}
      </FluentModal>
    </GlassPanel>
  );
}
