"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api/client";
import { getApplications, setCachePartial } from "@/lib/storage/db";
import { canProcessVeterinary } from "@/lib/roles";
import { OperationApplication, ApplicationWorkflowStatus } from "@/types/animal-management";

const STATUS_BADGE: Record<ApplicationWorkflowStatus, string> = {
  pending_receipt: "bg-tsinghua-yellow-light text-amber-800 border-amber-200",
  received: "bg-sky-50 text-sky-700 border-sky-200",
  awaiting_conditions: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export function VetCareInbox() {
  const { t, locale } = useLocale();
  const v = t.animalMgmt.vetCare;
  const a = t.animalMgmt.applications;
  const { user } = useAuth();
  const canProcess = user ? canProcessVeterinary(user.roles) : false;
  const [applications, setApplications] = useState<OperationApplication[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { applications: list } = await api.applications();
        setCachePartial({ applications: list });
        setApplications(list);
      } catch {
        setApplications(getApplications());
      }
    })();
  }, []);

  const vetApps = useMemo(
    () => applications.filter((app) => app.type === "veterinary"),
    [applications]
  );

  const pending = vetApps.filter((app) => app.status === "pending_receipt" || app.status === "received");
  const done = vetApps.filter((app) => app.status === "completed" || app.status === "rejected");
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  function statusLabel(s: ApplicationWorkflowStatus) {
    const map: Record<ApplicationWorkflowStatus, string> = {
      pending_receipt: a.tabPending,
      received: a.tabReceived,
      awaiting_conditions: a.tabAwaiting,
      completed: a.tabCompleted,
      rejected: a.tabRejected,
    };
    return map[s];
  }

  async function act(id: string, action: "approve" | "reject" | "receive") {
    if (!canProcess) return;
    setBusy(id);
    try {
      const { applications: list } = await api.reviewApplication(id, action);
      setCachePartial({ applications: list });
      setApplications(list);
    } finally {
      setBusy(null);
    }
  }

  function Card({ app }: { app: OperationApplication }) {
    return (
      <GlassPanel key={app.id}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-xs text-lab-muted">{app.id}</p>
            <h3 className="mt-1 font-semibold text-thu">{app.applicant}</h3>
            <p className="mt-0.5 text-xs text-lab-muted">
              {new Date(app.applicationTime).toLocaleString(localeStr)}
            </p>
          </div>
          <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[app.status])}>
            {statusLabel(app.status)}
          </span>
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-medium text-lab-muted">{v.animals}</p>
          <p className="mt-0.5 font-mono text-xs text-lab-text">
            {(app.animalIds ?? []).join(", ") || "—"}
          </p>
        </div>
        <div className="mt-3">
          <p className="text-[11px] font-medium text-lab-muted">{v.instructions}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-lab-text">
            {app.vetInstructions || app.description}
          </p>
        </div>
        {app.processor && (
          <p className="mt-2 text-xs text-lab-muted">
            {a.colProcessor}: {app.processor}
          </p>
        )}
        {canProcess && (app.status === "pending_receipt" || app.status === "received") && (
          <div className="mt-4 flex flex-wrap gap-2">
            {app.status === "pending_receipt" && (
              <FluentButton
                variant="outline"
                size="sm"
                disabled={busy === app.id}
                onClick={() => void act(app.id, "receive")}
              >
                {v.receive}
              </FluentButton>
            )}
            <FluentButton
              size="sm"
              disabled={busy === app.id}
              onClick={() => void act(app.id, "approve")}
            >
              {v.complete}
            </FluentButton>
            <FluentButton
              variant="ghost"
              size="sm"
              disabled={busy === app.id}
              onClick={() => void act(app.id, "reject")}
            >
              {a.reject}
            </FluentButton>
          </div>
        )}
      </GlassPanel>
    );
  }

  return (
    <>
      <PageHeader title={v.title} subtitle={v.subtitle} />
      <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        <GlassPanel className="mb-4">
          <p className="text-sm text-lab-muted">{v.hint}</p>
          <p className="mt-1 text-xs text-lab-muted">
            {v.pendingCount.replace("{n}", String(pending.length))}
          </p>
        </GlassPanel>

        <h2 className="mb-3 text-sm font-semibold text-thu">{v.sectionPending}</h2>
        {pending.length === 0 ? (
          <GlassPanel className="mb-6">
            <p className="text-sm text-lab-muted">{v.emptyPending}</p>
          </GlassPanel>
        ) : (
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            {pending.map((app) => (
              <Card key={app.id} app={app} />
            ))}
          </div>
        )}

        <h2 className="mb-3 text-sm font-semibold text-thu">{v.sectionDone}</h2>
        {done.length === 0 ? (
          <GlassPanel>
            <p className="text-sm text-lab-muted">{v.emptyDone}</p>
          </GlassPanel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {done.map((app) => (
              <Card key={app.id} app={app} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
