"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentModal } from "@/components/fluent/FluentModal";
import { AnimalOpSchedule } from "@/components/animals/AnimalOpSchedule";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { canUseAnimalStaffWorkbench } from "@/lib/roles";
import { api } from "@/lib/api/client";
import { AnimalOpTask, URGENCY_COLORS } from "@/types/animal-ops";
import { ManagedAnimal } from "@/types/animal-management";
import { trackingDays, trackingStageFromDays } from "@/lib/animals/facility-board";
import { JELLY_TIP_CLASS, resolveStatusColor } from "@/lib/animals/status-tip";

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

function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 饲养员 / 技术员 / 采集员工作台：待处理 · 代管 · 已分配 + 日历 + 排班 */
export function TechnicianWorkbench() {
  const { t, isZh } = useLocale();
  const tw = t.animalMgmt.technicianWorkbench;
  const f = t.animalMgmt.facilityBoard;
  const o = t.animalMgmt.animalOps;
  const m = t.animalMgmt.managed;
  const { user } = useAuth();
  const allowed = user ? canUseAnimalStaffWorkbench(user.roles) : false;

  const [allAnimals, setAllAnimals] = useState<ManagedAnimal[]>([]);
  const [tasks, setTasks] = useState<AnimalOpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [calDay, setCalDay] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState(false);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const loadAnimals = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.facilityBoard();
      setAllAnimals(data.managedAnimals ?? []);
      setError("");
    } catch {
      setError(tw.loadError);
    }
  }, [user, tw.loadError]);

  useEffect(() => {
    if (!allowed || !user) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await loadAnimals();
      try {
        const { tasks: list } = await api.animalOpTasks({ mine: true });
        setTasks(list.filter((x) => x.assigneeUserId === user.id));
      } catch {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed, user, loadAnimals]);

  const scheduled = useMemo(
    () => tasks.filter((x) => x.status === "scheduled"),
    [tasks]
  );

  const pendingCount = scheduled.length;

  const assignedAnimalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of tasks) {
      for (const id of task.animalIds) ids.add(id);
    }
    return ids;
  }, [tasks]);

  /** 带领动物：名下技术员负责 + 任务涉及的小鼠 */
  const ledAnimals = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, ManagedAnimal>();
    for (const a of allAnimals) {
      if (a.technicianUserId === user.id || assignedAnimalIds.has(a.id)) {
        map.set(a.id, a);
      }
    }
    // Task animals not yet in roster still show as stubs via id only — skip if missing
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [allAnimals, assignedAnimalIds, user]);

  const managedCount = ledAnimals.length;

  const assignedCount = useMemo(() => {
    const ids = new Set<string>();
    for (const task of scheduled) {
      for (const id of task.animalIds) ids.add(id);
    }
    return ids.size;
  }, [scheduled]);

  function recordingLabel(row: ManagedAnimal) {
    if (row.statusLabel?.trim()) return row.statusLabel.trim();
    if (!row.recordingStatus) return "—";
    return m.recordingStatus[row.recordingStatus] ?? row.recordingStatus;
  }

  function stageForRow(row: ManagedAnimal) {
    return trackingStageFromDays(
      trackingDays(row.collectionAt, row.lastCollectionAt, row.implantAt)
    );
  }

  function ownerName(row: ManagedAnimal) {
    return row.claimantName?.trim() || tw.noOwner;
  }

  const taskDates = useMemo(() => {
    const set = new Set<string>();
    for (const task of scheduled) {
      set.add(dayKeyFromIso(task.startTime));
    }
    return set;
  }, [scheduled]);

  const dayTasks = useMemo(() => {
    if (!calDay) return [];
    return scheduled
      .filter((task) => dayKeyFromIso(task.startTime) === calDay)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [scheduled, calDay]);

  const calCells = useMemo(() => buildMonthGrid(calMonth), [calMonth]);

  const summaryCards = [
    {
      label: tw.statPending,
      count: pendingCount,
      unit: tw.unitPending,
      desc: tw.statPendingDesc,
    },
    {
      label: tw.statManaged,
      count: managedCount,
      unit: tw.unitAnimals,
      desc: tw.statManagedDesc,
    },
    {
      label: tw.statAssigned,
      count: assignedCount,
      unit: tw.unitAnimals,
      desc: tw.statAssignedDesc,
    },
  ];

  if (!allowed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PageHeader title={t.dashboard.title} />
        <div className="fluent-mica-bg flex-1 p-6 text-sm text-lab-muted">{tw.forbidden}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title={t.dashboard.title} subtitle={tw.subtitle} />
      <div className="fluent-mica-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6">
        {loading ? (
          <GlassPanel>
            <p className="text-sm text-lab-muted">{t.common.loading}</p>
          </GlassPanel>
        ) : error ? (
          <GlassPanel>
            <p className="text-sm text-red-600">{error}</p>
          </GlassPanel>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {summaryCards.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-[#E0D4E8] bg-white/55 p-3"
                  >
                    <p className="text-sm font-semibold text-thu">{item.label}</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-thu">
                      {item.count}
                      <span className="ml-1 text-sm font-medium text-lab-muted">{item.unit}</span>
                    </p>
                    <p className="mt-1 text-xs text-lab-muted">{item.desc}</p>
                  </div>
                ))}
              </div>

              {user && (
                <AnimalOpSchedule
                  userId={user.id}
                  onTasksChange={(list) => setTasks(list)}
                />
              )}

              <GlassPanel>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-thu">{tw.ledAnimalsTitle}</h3>
                    <p className="mt-0.5 text-[11px] text-lab-muted">{tw.ledAnimalsHint}</p>
                  </div>
                  <Link href="/animals/managed" className="text-xs text-thu hover:underline">
                    {tw.goManaged}
                  </Link>
                </div>
                {ledAnimals.length === 0 ? (
                  <p className="text-sm text-lab-muted">{tw.noLedAnimals}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#E0D4E8] text-[11px] text-lab-muted">
                          <th className="px-2 py-2 font-semibold">{m.colId}</th>
                          <th className="px-2 py-2 font-semibold">{tw.colOwner}</th>
                          <th className="px-2 py-2 font-semibold">{tw.colStatusNow}</th>
                          <th className="px-2 py-2 font-semibold">{tw.colStage}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledAnimals.map((row, idx) => (
                          <tr
                            key={row.id}
                            className={clsx(
                              "border-b border-[#EDE4F2]",
                              idx % 2 === 0 ? "bg-white" : "bg-[#F7F1FA]"
                            )}
                          >
                            <td className="px-2 py-2 font-mono text-xs text-thu">{row.id}</td>
                            <td className="px-2 py-2 text-xs text-lab-text">{ownerName(row)}</td>
                            <td className="px-2 py-2">
                              <span
                                className={clsx(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                                  JELLY_TIP_CLASS[
                                    resolveStatusColor(row.statusColor, row.recordingStatus)
                                  ]
                                )}
                              >
                                {recordingLabel(row)}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-xs">{stageForRow(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </GlassPanel>
            </div>

            <div className="space-y-4">
              <GlassPanel>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-thu">{f.calendar}</p>
                  <div className="flex items-center gap-1">
                    <FluentButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const d = new Date();
                        setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      }}
                    >
                      {f.calendarToday}
                    </FluentButton>
                    <FluentButton
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCalMonth(
                          new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1)
                        )
                      }
                    >
                      ‹
                    </FluentButton>
                    <FluentButton
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCalMonth(
                          new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1)
                        )
                      }
                    >
                      ›
                    </FluentButton>
                  </div>
                </div>
                <p className="mb-2 text-center text-xs font-medium text-lab-text">
                  {calMonth.getFullYear()}-{String(calMonth.getMonth() + 1).padStart(2, "0")}
                </p>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-lab-muted">
                  {(isZh
                    ? ["一", "二", "三", "四", "五", "六", "日"]
                    : ["M", "T", "W", "T", "F", "S", "S"]
                  ).map((label, i) => (
                    <div key={`${label}-${i}`} className="py-1 font-medium">
                      {label}
                    </div>
                  ))}
                  {calCells.map((cell, i) =>
                    cell ? (
                      <button
                        key={cell}
                        type="button"
                        onClick={() => {
                          setCalDay(cell);
                          setDayOpen(true);
                        }}
                        className={clsx(
                          "relative flex flex-col items-center rounded-md px-0.5 pb-1 pt-0.5 text-[11px] transition hover:bg-thu/10",
                          cell === todayStr && "font-semibold text-thu"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-7 w-7 items-center justify-center rounded-full",
                            cell === todayStr && "bg-thu/10 ring-2 ring-thu"
                          )}
                        >
                          {Number(cell.slice(-2))}
                        </span>
                        <span
                          className={clsx(
                            "mt-0.5 h-1.5 w-1.5 rounded-full",
                            taskDates.has(cell) ? "bg-thu" : "bg-transparent"
                          )}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <div key={`e-${i}`} className="h-9" />
                    )
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-lab-muted">{tw.calendarHint}</p>
              </GlassPanel>

              <Link
                href="/animals/managed"
                className="block rounded-xl border border-[#E0D4E8] bg-white/55 p-3 transition hover:bg-white/80 hover:shadow-sm"
              >
                <p className="text-sm font-semibold text-thu">{tw.goManaged}</p>
                <p className="mt-1 text-xs text-lab-muted">{tw.goManagedDesc}</p>
              </Link>
            </div>
          </div>
        )}
      </div>

      <FluentModal
        open={dayOpen && !!calDay}
        title={calDay ? tw.dayTasksTitle.replace("{d}", calDay) : f.calendar}
        size="lg"
        onClose={() => setDayOpen(false)}
        footer={
          <div className="flex justify-end">
            <FluentButton variant="outline" onClick={() => setDayOpen(false)}>
              {t.common.close}
            </FluentButton>
          </div>
        }
      >
        {dayTasks.length === 0 ? (
          <p className="text-sm text-lab-muted">{tw.noDayTasks}</p>
        ) : (
          <ul className="space-y-2">
            {dayTasks.map((task) => (
              <li
                key={task.id}
                className="rounded-lg border border-white/50 bg-white/50 px-3 py-2.5"
                style={{ borderLeft: `4px solid ${URGENCY_COLORS[task.urgency]}` }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-thu">{o.types[task.opType]}</p>
                  <time className="text-xs text-lab-muted">
                    {new Date(task.startTime).toLocaleTimeString(isZh ? "zh-CN" : "en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {new Date(task.endTime).toLocaleTimeString(isZh ? "zh-CN" : "en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="mt-1 text-xs text-lab-muted">
                  {task.createdByName} · {task.animalIds.length} {isZh ? "只" : "mice"}
                  {task.note ? ` · ${task.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </FluentModal>
    </div>
  );
}
