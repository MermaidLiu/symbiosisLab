"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput } from "@/components/fluent/FluentField";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ProgressReport } from "@/types";
import { PublicUser } from "@/lib/api/client";
import { getISOWeekNum } from "@/lib/progress";

interface MemberCard {
  name: string;
  department?: string;
  report: ProgressReport | null;
}

export function ProgressCollector() {
  const { t, locale } = useLocale();
  const p = t.ra.progressCollector;
  const [weekNum, setWeekNum] = useState(getISOWeekNum);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [members, setMembers] = useState<PublicUser[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/progress-reports?week_num=${weekNum}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("fetch_failed");
      const data = await res.json();
      setReports(data.reports ?? []);
      setMembers(data.labMembers ?? []);
    } catch {
      setError(p.loadError);
    } finally {
      setLoading(false);
    }
  }, [weekNum, p.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards: MemberCard[] = useMemo(() => {
    const byName = new Map(reports.map((r) => [r.studentName, r]));
    const list: MemberCard[] = members.map((m) => ({
      name: m.name,
      department: m.department,
      report: byName.get(m.name) ?? null,
    }));
    // Include orphan reports (name not in roster)
    for (const r of reports) {
      if (!list.some((c) => c.name === r.studentName)) {
        list.push({ name: r.studentName, report: r });
      }
    }
    const q = nameFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [members, reports, nameFilter]);

  const submittedCount = cards.filter((c) => c.report).length;
  const missingCount = cards.length - submittedCount;

  function remind(name: string) {
    setToast(p.remindToast.replace("{name}", name));
    window.setTimeout(() => setToast(""), 2800);
  }

  return (
    <div className="space-y-4">
      <GlassPanel>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-thu">{p.boardTitle}</h2>
            <p className="mt-1 text-xs text-lab-muted">{p.boardHint}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">{p.weekLabel}</label>
              <input
                type="number"
                min={1}
                max={53}
                value={weekNum}
                onChange={(e) => setWeekNum(Number(e.target.value) || getISOWeekNum())}
                className="fluent-input w-24 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <FluentInput
              label={p.filterName}
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder={p.filterPlaceholder}
              className="min-w-[180px]"
            />
            <FluentButton variant="outline" onClick={() => void load()}>
              {p.refresh}
            </FluentButton>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="fluent-badge rounded-full px-2.5 py-1">
            {p.weekLabel} {weekNum}
          </span>
          <span className="rounded-full bg-emerald-50/80 px-2.5 py-1 text-emerald-800">
            {p.submitted}: {submittedCount}
          </span>
          <span className="rounded-full bg-red-50/80 px-2.5 py-1 text-red-700">
            {p.missing}: {missingCount}
          </span>
        </div>
      </GlassPanel>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] max-w-sm rounded-xl border border-white/50 bg-thu px-4 py-3 text-sm text-white shadow-fluent animate-[pageEnter_0.25s_ease]">
          {toast}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <GlassPanel>
          <p className="py-10 text-center text-sm text-lab-muted">{t.common.loading}</p>
        </GlassPanel>
      ) : cards.length === 0 ? (
        <GlassPanel>
          <p className="py-10 text-center text-sm text-lab-muted">{p.empty}</p>
        </GlassPanel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const missing = !card.report;
            return (
              <GlassPanel
                key={card.name}
                className={clsx(
                  "flex flex-col transition-shadow",
                  missing && "border-red-300/70 bg-red-50/50 ring-1 ring-red-200/60"
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className={clsx("font-semibold", missing ? "text-red-700" : "text-thu")}>
                      {card.name}
                    </h3>
                    {card.department && (
                      <p className="text-[10px] text-lab-muted">{card.department}</p>
                    )}
                  </div>
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      missing ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"
                    )}
                  >
                    {missing ? p.statusMissing : p.statusSubmitted}
                  </span>
                </div>

                {card.report ? (
                  <div className="flex-1 space-y-2 text-sm">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-lab-muted">
                        {p.contentLabel}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-lab-text">{card.report.content}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-lab-muted">
                        {p.blockersLabel}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-lab-text">
                        {card.report.blockers || p.noBlockers}
                      </p>
                    </div>
                    <p className="pt-1 text-[10px] text-lab-muted">
                      {p.submittedAt}:{" "}
                      {new Date(card.report.submittedAt).toLocaleString(localeStr)}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col justify-between gap-3">
                    <p className="text-sm text-red-700/90">{p.missingHint}</p>
                    <FluentButton
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={() => remind(card.name)}
                    >
                      {p.remind}
                    </FluentButton>
                  </div>
                )}
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
