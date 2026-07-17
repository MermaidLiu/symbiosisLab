"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { api } from "@/lib/api/client";
import { getApplications } from "@/lib/storage/db";
import { OperationApplication } from "@/types/animal-management";

export function VetDashboard() {
  const { t, locale } = useLocale();
  const v = t.animalMgmt.vetCare;
  const d = t.dashboard;
  const [apps, setApps] = useState<OperationApplication[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { applications } = await api.applications();
        setApps(applications);
      } catch {
        setApps(getApplications());
      }
    })();
  }, []);

  const pending = apps.filter(
    (a) => a.type === "veterinary" && (a.status === "pending_receipt" || a.status === "received")
  );
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/animals/vet-care">
          <GlassPanel className="transition hover:bg-white/50">
            <p className="text-xs text-lab-muted">{v.pendingStat}</p>
            <p className="mt-1 text-3xl font-semibold text-thu">{pending.length}</p>
          </GlassPanel>
        </Link>
        <Link href="/animals/managed">
          <GlassPanel className="transition hover:bg-white/50">
            <p className="text-xs text-lab-muted">{d.myAnimals}</p>
            <p className="mt-1 text-sm text-lab-muted">{v.goManaged}</p>
          </GlassPanel>
        </Link>
      </div>

      <GlassPanel>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-thu">{v.sectionPending}</h2>
          <Link href="/animals/vet-care">
            <FluentButton variant="ghost" size="sm">
              {v.openInbox}
            </FluentButton>
          </Link>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-lab-muted">{v.emptyPending}</p>
        ) : (
          <ul className="divide-y divide-white/30">
            {pending.slice(0, 5).map((app) => (
              <li key={app.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-lab-muted">{app.id}</p>
                    <p className="text-sm font-medium text-lab-text">{app.applicant}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-lab-muted">
                      {app.vetInstructions || app.description}
                    </p>
                  </div>
                  <p className="text-[11px] text-lab-muted">
                    {new Date(app.applicationTime).toLocaleString(localeStr)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}
