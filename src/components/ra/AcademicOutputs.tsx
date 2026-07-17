"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RaAchievementCategory, RaAchievementRecord } from "@/types";

const ACADEMIC_CATEGORIES: RaAchievementCategory[] = ["paper", "patent"];

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function AcademicOutputs() {
  const { t, locale } = useLocale();
  const m = t.ra.academicOutputs;
  const ach = t.ra.achievementHall;
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const [items, setItems] = useState<RaAchievementRecord[]>([]);
  const [papersYtd, setPapersYtd] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [achRes, anRes] = await Promise.all([
        fetch("/api/ra-achievements", { credentials: "same-origin" }),
        fetch("/api/ra-analytics", { credentials: "same-origin" }),
      ]);
      if (achRes.ok) {
        const data = await achRes.json();
        setItems((data.items ?? []).filter((x: RaAchievementRecord) => ACADEMIC_CATEGORIES.includes(x.category)));
      }
      if (anRes.ok) {
        const data = await anRes.json();
        setPapersYtd(data.metrics?.papersYtd ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const papers = useMemo(() => items.filter((x) => x.category === "paper"), [items]);
  const patents = useMemo(() => items.filter((x) => x.category === "patent"), [items]);

  return (
    <RaPageShell title={t.nav.raAcademicOutput}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.hint}</p>
      </GlassPanel>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <GlassPanel>
          <p className="text-xs text-lab-muted">{m.statPapers}</p>
          <p className="mt-1 text-2xl font-bold text-thu">{papers.length}</p>
        </GlassPanel>
        <GlassPanel>
          <p className="text-xs text-lab-muted">{m.statPatents}</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">{patents.length}</p>
        </GlassPanel>
        <GlassPanel>
          <p className="text-xs text-lab-muted">{m.statYtd}</p>
          <p className="mt-1 text-2xl font-bold text-violet-700">{papersYtd}</p>
        </GlassPanel>
      </div>

      {loading ? (
        <GlassPanel>
          <p className="text-sm text-lab-muted">{t.common.loading}</p>
        </GlassPanel>
      ) : items.length === 0 ? (
        <GlassPanel>
          <p className="text-sm text-lab-muted">{m.empty}</p>
          <Link href="/ra/achievements" className="mt-2 inline-block text-sm text-thu hover:underline">
            {m.goAchievements}
          </Link>
        </GlassPanel>
      ) : (
        <div className="space-y-4">
          {[papers, patents].map((group, gi) =>
            group.length > 0 ? (
              <GlassPanel key={gi}>
                <h3 className="mb-3 text-base font-semibold text-thu">
                  {gi === 0 ? ach.categories.paper : ach.categories.patent}
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-3 rounded-lg border border-white/40 bg-white/30 p-3"
                    >
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-white/50 bg-white/50">
                        {isImageMime(item.mimeType) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/ra-achievements/${item.id}/file`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-lab-muted">
                            PDF
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-thu">{item.title}</h4>
                        {item.note && <p className="mt-1 text-xs text-lab-text">{item.note}</p>}
                        <p className="mt-1 text-[10px] text-lab-muted">
                          {new Date(item.createdAt).toLocaleDateString(localeStr)}
                        </p>
                        <a
                          href={`/api/ra-achievements/${item.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs text-thu hover:underline"
                        >
                          {ach.viewScan}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            ) : null
          )}
        </div>
      )}
    </RaPageShell>
  );
}
