"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput } from "@/components/fluent/FluentField";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RaAnalyticsMetrics } from "@/types";

const empty: RaAnalyticsMetrics = {
  papersYtd: 0,
  experimentsWeek: 0,
  fundingUsedPct: 0,
  labMembersActive: 0,
  updatedAt: "",
  updatedBy: "",
};

export function AnalyticsBoard() {
  const { t, locale } = useLocale();
  const m = t.ra.analyticsBoard;
  const [metrics, setMetrics] = useState<RaAnalyticsMetrics>(empty);
  const [draft, setDraft] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ra-analytics", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      const next = (data.metrics ?? empty) as RaAnalyticsMetrics;
      setMetrics(next);
      setDraft(next);
    } catch {
      setError(m.loadError);
    } finally {
      setLoading(false);
    }
  }, [m.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ra-analytics", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papersYtd: Number(draft.papersYtd),
          experimentsWeek: Number(draft.experimentsWeek),
          fundingUsedPct: Number(draft.fundingUsedPct),
          labMembersActive: Number(draft.labMembersActive),
        }),
      });
      if (!res.ok) throw new Error("save");
      const data = await res.json();
      const next = data.metrics as RaAnalyticsMetrics;
      setMetrics(next);
      setDraft(next);
      setToast(m.saveSuccess);
      window.setTimeout(() => setToast(""), 2200);
    } catch {
      setError(m.saveError);
    } finally {
      setSaving(false);
    }
  }

  const cards = [
    { label: m.papersYtd, value: metrics.papersYtd },
    { label: m.experimentsWeek, value: metrics.experimentsWeek },
    { label: m.fundingUsed, value: `${metrics.fundingUsedPct}%` },
    { label: m.labMembers, value: metrics.labMembersActive },
  ];

  return (
    <RaPageShell title={t.nav.raAnalytics}>
      {toast && (
        <div className="fixed right-4 top-20 z-50 rounded-lg border border-thu/20 bg-white/95 px-4 py-2 text-sm text-thu shadow-lg">
          {toast}
        </div>
      )}

      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.hint}</p>
        {metrics.updatedAt && (
          <p className="mt-2 text-[11px] text-lab-muted">
            {m.lastUpdated}: {new Date(metrics.updatedAt).toLocaleString(localeStr)}
          </p>
        )}
      </GlassPanel>

      {loading ? (
        <p className="text-sm text-lab-muted">{t.common.loading}</p>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <GlassPanel key={c.label}>
                <p className="text-xs text-lab-muted">{c.label}</p>
                <p className="mt-1 text-3xl font-bold text-thu">{c.value}</p>
              </GlassPanel>
            ))}
          </div>

          <GlassPanel>
            <h3 className="mb-3 font-semibold text-thu">{m.entryTitle}</h3>
            <p className="mb-3 text-xs text-lab-muted">{m.entryHint}</p>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <FluentInput
                label={m.papersYtd}
                type="number"
                min={0}
                value={draft.papersYtd}
                onChange={(e) => setDraft((d) => ({ ...d, papersYtd: Number(e.target.value) }))}
              />
              <FluentInput
                label={m.experimentsWeek}
                type="number"
                min={0}
                value={draft.experimentsWeek}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, experimentsWeek: Number(e.target.value) }))
                }
              />
              <FluentInput
                label={m.fundingUsed}
                type="number"
                min={0}
                max={100}
                value={draft.fundingUsedPct}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, fundingUsedPct: Number(e.target.value) }))
                }
              />
              <FluentInput
                label={m.labMembers}
                type="number"
                min={0}
                value={draft.labMembersActive}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, labMembersActive: Number(e.target.value) }))
                }
              />
            </div>
            <div className="mt-4">
              <FluentButton type="button" disabled={saving} onClick={() => void save()}>
                {saving ? m.saving : m.save}
              </FluentButton>
            </div>
          </GlassPanel>
        </>
      )}
    </RaPageShell>
  );
}
