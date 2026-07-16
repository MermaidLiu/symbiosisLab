"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getISOWeekNum } from "@/lib/progress";

export default function StudentProgressSubmitPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const p = t.ra.progressCollector;
  const [weekNum, setWeekNum] = useState(getISOWeekNum);
  const [content, setContent] = useState("");
  const [blockers, setBlockers] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`/api/progress-reports?week_num=${weekNum}`, {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json();
        const mine = (data.reports as { studentName: string; content: string; blockers: string }[])?.find(
          (r) => r.studentName === user.name
        );
        if (mine) {
          setContent(mine.content);
          setBlockers(mine.blockers);
        } else {
          setContent("");
          setBlockers("");
        }
      } catch {
        // ignore preload errors
      }
    })();
  }, [user, weekNum]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/progress-reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          blockers: blockers.trim(),
          week_num: weekNum,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "failed");
      }
      setMsg(p.submitSuccess);
    } catch {
      setErr(p.submitError);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <PageHeader title={p.submitTitle} />
      <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 md:p-6">
        <GlassPanel className="mx-auto max-w-xl">
          <p className="mb-4 text-sm text-lab-muted">{p.submitHint}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">{p.weekLabel}</label>
              <input
                type="number"
                min={1}
                max={53}
                value={weekNum}
                onChange={(e) => setWeekNum(Number(e.target.value) || getISOWeekNum())}
                className="fluent-input w-28 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">{p.contentLabel}</label>
              <textarea
                required
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
                placeholder={p.contentPlaceholder}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">{p.blockersLabel}</label>
              <textarea
                rows={3}
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
                placeholder={p.blockersPlaceholder}
              />
            </div>
            {msg && <p className="text-sm text-thu">{msg}</p>}
            {err && <p className="text-sm text-red-600">{err}</p>}
            <FluentButton type="submit" disabled={submitting || !content.trim()}>
              {p.submit}
            </FluentButton>
          </form>
        </GlassPanel>
      </div>
    </>
  );
}
