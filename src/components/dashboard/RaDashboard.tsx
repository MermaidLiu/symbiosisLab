"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentModal } from "@/components/fluent/FluentModal";
import { TodoList } from "@/components/ra/TodoList";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getRaWorkModule, RA_WORK_MODULES } from "@/lib/ra/work-modules";
import { RaWorkItem } from "@/types";

export function RaDashboard() {
  const { t } = useLocale();
  const { user } = useAuth();
  const d = t.ra.dashboard;
  const cal = t.ra.calendar;
  const [achievementCount, setAchievementCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [workItems, setWorkItems] = useState<RaWorkItem[]>([]);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calDay, setCalDay] = useState<string | null>(null);
  const [dayLogOpen, setDayLogOpen] = useState(false);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const refreshMeta = useCallback(async () => {
    try {
      const [achRes, imgRes, workRes] = await Promise.all([
        fetch("/api/ra-achievements", { credentials: "same-origin" }),
        fetch("/api/ra-image-library", { credentials: "same-origin" }),
        fetch("/api/ra-work-items", { credentials: "same-origin" }),
      ]);
      if (achRes.ok) {
        const data = await achRes.json();
        setAchievementCount((data.items ?? []).length);
      }
      if (imgRes.ok) {
        const data = await imgRes.json();
        setImageCount((data.items ?? []).length);
      }
      if (workRes.ok) {
        const data = await workRes.json();
        setWorkItems((data.items ?? []) as RaWorkItem[]);
      }
    } catch {
      /* keep fallbacks */
    }
  }, []);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  const workOpen = useMemo(
    () => workItems.filter((i) => i.status !== "done").length,
    [workItems]
  );

  const activityDates = useMemo(() => {
    const set = new Set<string>();
    for (const item of workItems) {
      if (item.due) set.add(item.due.slice(0, 10));
      if (item.updatedAt) set.add(item.updatedAt.slice(0, 10));
    }
    return set;
  }, [workItems]);

  const dayItems = useMemo(() => {
    if (!calDay) return [];
    return workItems
      .filter(
        (i) =>
          i.due?.slice(0, 10) === calDay || i.updatedAt?.slice(0, 10) === calDay
      )
      .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  }, [workItems, calDay]);

  const calCells = useMemo(() => buildMonthGrid(calMonth), [calMonth]);

  const cards = [
    {
      label: d.cardProposals,
      value: `${workOpen}`,
      suffix: d.itemsUnit,
      href: "/ra/proposals",
      accent: "text-thu",
    },
    {
      label: d.cardFunding,
      value: d.manage,
      href: "/ra/funding",
      accent: "text-amber-700",
      small: true,
    },
    {
      label: d.cardImages,
      value: `${imageCount}`,
      suffix: d.unlockedUnit,
      href: "/ra/images",
      accent: "text-sky-700",
    },
    {
      label: d.cardAchievements,
      value: `${achievementCount}`,
      suffix: d.unlockedUnit,
      href: "/ra/achievements",
      accent: "text-amber-700",
    },
    {
      label: d.cardProcess,
      value: d.manage,
      href: "/ra/process",
      accent: "text-indigo-700",
      small: true,
    },
    {
      label: d.cardPpt,
      value: d.manage,
      href: "/ra/ppt",
      accent: "text-thu",
      small: true,
    },
  ];

  function kindLabel(kind: RaWorkItem["kind"]) {
    const mod = RA_WORK_MODULES.find((m) => m.kind === kind);
    return mod ? t.nav[mod.navKey] : kind;
  }

  function statusLabel(item: RaWorkItem) {
    const mod = getRaWorkModule(item.kind);
    const map = t.ra.work.statuses[item.kind] as Record<string, string>;
    return map[item.status] ?? item.status;
  }

  function moduleHref(kind: RaWorkItem["kind"]) {
    const mod = getRaWorkModule(kind);
    return `/ra/${mod.path}`;
  }

  return (
    <div className="fluent-mica-bg flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6">
        <GlassPanel className="mb-5 bg-gradient-to-r from-thu/10 via-white/50 to-tsinghua-yellow/15">
          <p className="text-sm text-lab-muted">{d.welcome}</p>
          <h2 className="mt-1 text-2xl font-bold text-thu">{user?.name}</h2>
          <p className="mt-2 text-sm text-lab-text">{d.hint}</p>
        </GlassPanel>

        <GlassPanel padding={false} className="mb-5 overflow-hidden">
          <div className="grid grid-cols-2 gap-px bg-white/30 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map((card) => (
              <Link
                key={card.href + card.label}
                href={card.href}
                className="bg-white/55 px-3 py-3 text-center transition hover:bg-white/80 sm:text-left"
              >
                <p className="text-[10px] text-lab-muted">{card.label}</p>
                <p
                  className={clsx(
                    "mt-0.5 font-semibold tabular-nums",
                    card.accent,
                    card.small ? "text-base" : "text-xl"
                  )}
                >
                  {card.value}
                  {card.suffix ? (
                    <span className="ml-1 text-sm font-medium text-lab-muted">{card.suffix}</span>
                  ) : null}
                </p>
              </Link>
            ))}
          </div>
        </GlassPanel>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <TodoList compact />

          <GlassPanel>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-thu">{cal.title}</p>
              <div className="flex items-center gap-1">
                <FluentButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const now = new Date();
                    setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  }}
                >
                  {cal.today}
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
              {cal.weekdays.map((label) => (
                <div key={label} className="py-1 font-medium">
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
            <p className="mt-2 text-[10px] leading-relaxed text-lab-muted">{cal.hint}</p>
          </GlassPanel>
        </div>
      </div>

      <FluentModal
        open={dayLogOpen && !!calDay}
        title={calDay ? cal.dayTitle.replace("{d}", calDay) : cal.title}
        size="lg"
        onClose={() => setDayLogOpen(false)}
        footer={
          <div className="flex justify-end">
            <FluentButton variant="outline" onClick={() => setDayLogOpen(false)}>
              {cal.close}
            </FluentButton>
          </div>
        }
      >
        {dayItems.length === 0 ? (
          <p className="text-sm text-lab-muted">{cal.emptyDay}</p>
        ) : (
          <ul className="space-y-2">
            {dayItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={moduleHref(item.kind)}
                  className="block rounded-lg border border-white/50 bg-white/50 px-3 py-2.5 transition hover:bg-white/80"
                  onClick={() => setDayLogOpen(false)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-thu/10 px-2 py-0.5 text-[10px] font-medium text-thu">
                      {kindLabel(item.kind)}
                    </span>
                    <span className="text-[10px] text-lab-muted">{statusLabel(item)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-lab-text">{item.title}</p>
                  {item.due && (
                    <p className="mt-0.5 text-[11px] text-lab-muted">
                      {cal.due}: {item.due}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
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
  const startPad = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
