"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentModal } from "@/components/fluent/FluentModal";
import { TodoList } from "@/components/ra/TodoList";
import { ManagedAnimals } from "@/components/animals/ManagedAnimals";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { canManageAnimals } from "@/lib/roles";
import { api } from "@/lib/api/client";
import { normalizePurpose } from "@/lib/animals/facility-board";
import {
  AnimalDayActivity,
  AnimalPurpose,
  ManagedAnimal,
} from "@/types/animal-management";

/** 小动物负责人工作台：统计 + 待办 + 日历 + 名下动物列表（无笼位） */
export function TechnicianWorkbench() {
  const { t } = useLocale();
  const tw = t.animalMgmt.technicianWorkbench;
  const f = t.animalMgmt.facilityBoard;
  const m = t.animalMgmt.managed;
  const { user } = useAuth();
  const allowed = user ? canManageAnimals(user.roles) : false;

  const [animals, setAnimals] = useState<ManagedAnimal[]>([]);
  const [activities, setActivities] = useState<AnimalDayActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [calDay, setCalDay] = useState<string | null>(null);
  const [dayLogOpen, setDayLogOpen] = useState(false);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    if (!allowed || !user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await api.facilityBoard();
        const mine = (data.managedAnimals ?? []).filter(
          (a) => a.technicianUserId === user.id
        );
        setAnimals(mine);
        const ids = new Set(mine.map((a) => a.id));
        setActivities(
          (data.activities ?? []).filter(
            (ev) =>
              (ev.animalId && ids.has(ev.animalId)) || ev.userId === user.id
          )
        );
        setError("");
      } catch {
        setError(tw.loadError);
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed, user, tw.loadError]);

  const summary = useMemo(() => {
    const purposes: Record<AnimalPurpose, number> = {
      blank: 0,
      signal_processing: 0,
      immunity: 0,
      breeding: 0,
    };
    let claimed = 0;
    for (const a of animals) {
      const p = normalizePurpose(a.purpose);
      purposes[p] += 1;
      if (p !== "blank" && (a.claimantUserId || a.claimantName)) claimed += 1;
    }
    return { total: animals.length, claimed, purposes };
  }, [animals]);

  const activityDates = useMemo(
    () => new Set(activities.map((a) => a.date)),
    [activities]
  );

  const dayEvents = useMemo(() => {
    if (!calDay) return [];
    return activities
      .filter((a) => a.date === calDay)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [activities, calDay]);

  const calCells = useMemo(() => buildMonthGrid(calMonth), [calMonth]);

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
        <div className="mb-5 space-y-4">
          <GlassPanel padding={false} className="overflow-hidden">
            <div className="border-b border-white/40 bg-white/35 px-4 py-2.5">
              <p className="text-xs text-lab-muted">{tw.hint}</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/30 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={tw.statMine} value={summary.total} />
              <Stat label={f.statClaimed} value={summary.claimed} />
              <Stat label={m.purposeBlank} value={summary.purposes.blank} accent="text-[#9B8EAE]" />
              <Stat
                label={m.purposeSignal}
                value={summary.purposes.signal_processing}
                accent="text-[#5BA4E8]"
              />
              <Stat
                label={m.purposeImmunity}
                value={summary.purposes.immunity}
                accent="text-[#82318E]"
              />
              <Stat
                label={m.purposeBreeding}
                value={summary.purposes.breeding}
                accent="text-[#F5A623]"
              />
            </div>
          </GlassPanel>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <TodoList compact />

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
                      setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                    }
                  >
                    ‹
                  </FluentButton>
                  <FluentButton
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
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
                {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                  <div key={d} className="py-1 font-medium">
                    {d}
                  </div>
                ))}
                {calCells.map((cell, i) =>
                  cell ? (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => {
                        setCalDay(cell);
                        setDayLogOpen(true);
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
                          activityDates.has(cell) ? "bg-thu" : "bg-transparent"
                        )}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <div key={`e-${i}`} className="h-9" />
                  )
                )}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-lab-muted">{f.calendarHint}</p>
            </GlassPanel>
          </div>
        </div>

        <div className="mb-3">
          <h2 className="text-sm font-semibold text-thu">{tw.listTitle}</h2>
          <p className="mt-0.5 text-xs text-lab-muted">{tw.listHint}</p>
        </div>

        {loading ? (
          <GlassPanel>
            <p className="text-sm text-lab-muted">{t.common.loading}</p>
          </GlassPanel>
        ) : error ? (
          <GlassPanel>
            <p className="text-sm text-red-600">{error}</p>
          </GlassPanel>
        ) : (
          <ManagedAnimals
            embedded
            technicianScopeId={user!.id}
            onAnimalsChange={(list) => {
              setAnimals(list.filter((a) => a.technicianUserId === user!.id));
            }}
          />
        )}
      </div>

      <FluentModal
        open={dayLogOpen && !!calDay}
        title={calDay ? f.dayLogTitle.replace("{d}", calDay) : f.calendar}
        size="lg"
        onClose={() => setDayLogOpen(false)}
        footer={
          <div className="flex justify-end">
            <FluentButton variant="outline" onClick={() => setDayLogOpen(false)}>
              {f.dayLogClose}
            </FluentButton>
          </div>
        }
      >
        {dayEvents.length === 0 ? (
          <p className="text-sm text-lab-muted">{f.noDayEvents}</p>
        ) : (
          <ol className="relative space-y-0 border-l-2 border-thu/25 pl-4">
            {dayEvents.map((ev) => (
              <li key={ev.id} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-thu" />
                <div className="rounded-lg border border-white/50 bg-white/50 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <time className="text-xs font-semibold text-thu">
                      {new Date(ev.timestamp).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </time>
                    <span className="text-[11px] text-lab-muted">
                      {f.dayLogActor} · {ev.userName}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-lab-text">{ev.details}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-lab-muted">
                    {ev.animalId && (
                      <span className="rounded bg-thu/10 px-1.5 py-0.5 text-thu">
                        {f.dayLogAnimal} {ev.animalId}
                      </span>
                    )}
                    {ev.action && (
                      <span className="rounded bg-black/5 px-1.5 py-0.5">{ev.action}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </FluentModal>
    </div>
  );
}

function buildMonthGrid(monthStart: Date): (string | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startPad = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="bg-white/55 px-3 py-3 text-center sm:text-left">
      <p className="text-[10px] text-lab-muted">{label}</p>
      <p className={clsx("mt-0.5 text-xl font-semibold tabular-nums", accent ?? "text-thu")}>
        {value}
      </p>
    </div>
  );
}
