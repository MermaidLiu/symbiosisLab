"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { TodoList } from "@/components/ra/TodoList";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import {
  activeProjectCount,
  getRaWorkspace,
  openSubmissionCount,
} from "@/lib/ra/workspace";

export function RaDashboard() {
  const { t } = useLocale();
  const { user } = useAuth();
  const d = t.ra.dashboard;
  const ws = getRaWorkspace();
  const [achievementCount, setAchievementCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [experimentsWeek, setExperimentsWeek] = useState(ws.analytics.experimentsWeek);

  const refreshMeta = useCallback(async () => {
    try {
      const [achRes, imgRes, anRes] = await Promise.all([
        fetch("/api/ra-achievements", { credentials: "same-origin" }),
        fetch("/api/ra-image-library", { credentials: "same-origin" }),
        fetch("/api/ra-analytics", { credentials: "same-origin" }),
      ]);
      if (achRes.ok) {
        const data = await achRes.json();
        setAchievementCount((data.items ?? []).length);
      }
      if (imgRes.ok) {
        const data = await imgRes.json();
        setImageCount((data.items ?? []).length);
      }
      if (anRes.ok) {
        const data = await anRes.json();
        setExperimentsWeek(data.metrics?.experimentsWeek ?? 0);
      }
    } catch {
      /* keep fallbacks */
    }
  }, []);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  const cards = [
    {
      label: d.cardProjects,
      value: `${activeProjectCount(ws)}`,
      suffix: d.itemsUnit,
      href: "/ra/projects",
      accent: "text-thu",
    },
    {
      label: d.cardSubmissions,
      value: `${openSubmissionCount(ws)}`,
      suffix: d.itemsUnit,
      href: "/ra/submissions",
      accent: "text-indigo-700",
    },
    {
      label: t.nav.raImageLibrary,
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
      label: d.cardAnalytics,
      value: `${experimentsWeek}`,
      suffix: d.weekExps,
      href: "/ra/analytics",
      accent: "text-violet-700",
    },
    {
      label: d.cardPpt,
      value: d.manage,
      href: "/ra/ppt",
      accent: "text-thu",
      small: true,
    },
  ];

  const modules = [
    { href: "/ra/projects", key: "raProjects" as const },
    { href: "/ra/submissions", key: "raSubmissions" as const },
    { href: "/ra/images", key: "raImageLibrary" as const },
    { href: "/ra/achievements", key: "raAchievements" as const },
    { href: "/ra/templates", key: "raTemplates" as const },
    { href: "/ra/analytics", key: "raAnalytics" as const },
    { href: "/ra/ppt", key: "raPptStudio" as const },
    { href: "/ra/academics", key: "raAcademicOutput" as const },
    { href: "/ra/expenses", key: "raExpenses" as const },
  ];

  return (
    <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 md:p-6">
      <GlassPanel className="mb-6 bg-gradient-to-r from-thu/10 via-white/50 to-tsinghua-yellow/15">
        <p className="text-sm text-lab-muted">{d.welcome}</p>
        <h2 className="mt-1 text-2xl font-bold text-thu">{user?.name}</h2>
        <p className="mt-2 text-sm text-lab-text">{d.hint}</p>
      </GlassPanel>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href + card.label} href={card.href}>
            <GlassPanel className="h-full transition-all hover:-translate-y-0.5 hover:shadow-fluent-lg">
              <p className="text-xs text-lab-muted">{card.label}</p>
              <p className={`mt-1 font-bold ${card.accent} ${card.small ? "text-xl" : "text-3xl"}`}>
                {card.value}
                {card.suffix ? (
                  <span className="ml-1 text-sm font-medium text-lab-muted">{card.suffix}</span>
                ) : null}
              </p>
            </GlassPanel>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodoList />
        </div>

        <div className="space-y-6">
          <GlassPanel>
            <h3 className="mb-3 font-semibold text-thu">{d.modules}</h3>
            <div className="space-y-2">
              {modules.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg border border-white/40 bg-white/30 px-3 py-2.5 text-sm transition-colors hover:bg-white/55"
                >
                  {t.nav[item.key]}
                </Link>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
