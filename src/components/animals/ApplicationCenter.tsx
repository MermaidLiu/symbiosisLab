"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentSelect, FluentInput } from "@/components/fluent/FluentField";
import { FluentModal } from "@/components/fluent/FluentModal";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api/client";
import { getApplications, setCachePartial } from "@/lib/storage/db";
import { canManageAnimals, canProcessVeterinary } from "@/lib/roles";
import { OperationApplication, ApplicationWorkflowStatus, ApplicationType } from "@/types/animal-management";

const TABS: ApplicationWorkflowStatus[] = [
  "pending_receipt",
  "received",
  "awaiting_conditions",
  "completed",
  "rejected",
];

const STATUS_BADGE: Record<ApplicationWorkflowStatus, string> = {
  pending_receipt: "bg-tsinghua-yellow-light text-amber-800 border-amber-200",
  received: "bg-sky-50 text-sky-700 border-sky-200",
  awaiting_conditions: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export function ApplicationCenter() {
  const { t, locale } = useLocale();
  const a = t.animalMgmt.applications;
  const { user } = useAuth();
  const canReviewAll = user
    ? user.roles.includes("super_admin") || canManageAnimals(user.roles)
    : false;
  const canReviewVet = user ? canProcessVeterinary(user.roles) : false;
  const canReview = canReviewAll || canReviewVet;

  const [applications, setApplications] = useState<OperationApplication[]>([]);
  const [activeTab, setActiveTab] = useState<ApplicationWorkflowStatus>("pending_receipt");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<ApplicationType>("veterinary");
  const [reviewing, setReviewing] = useState<string | null>(null);

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

  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const typeLabel = (type: ApplicationType) => {
    const map: Record<ApplicationType, string> = {
      custody: a.typeCustody,
      veterinary: a.typeVeterinary,
      transfer: a.typeTransfer,
      cage_change: a.typeCageChange,
      breeding: a.typeBreeding,
      euthanasia: a.typeEuthanasia,
      other: a.typeOther,
    };
    return map[type];
  };

  const tabLabel = (tab: ApplicationWorkflowStatus) => {
    const map: Record<ApplicationWorkflowStatus, string> = {
      pending_receipt: a.tabPending,
      received: a.tabReceived,
      awaiting_conditions: a.tabAwaiting,
      completed: a.tabCompleted,
      rejected: a.tabRejected,
    };
    return map[tab];
  };

  const filtered = useMemo(() => {
    let rows = applications.filter((app) => app.status === activeTab);
    if (typeFilter) rows = rows.filter((app) => app.type === typeFilter);
    if (dateFrom) rows = rows.filter((app) => app.applicationTime >= dateFrom);
    if (dateTo) rows = rows.filter((app) => app.applicationTime <= dateTo + "T23:59:59");
    return rows;
  }, [applications, activeTab, typeFilter, dateFrom, dateTo]);

  const tabCounts = useMemo(() => {
    const counts = {} as Record<ApplicationWorkflowStatus, number>;
    TABS.forEach((tab) => {
      counts[tab] = applications.filter((app) => app.status === tab).length;
    });
    return counts;
  }, [applications]);

  async function submitNew() {
    if (!user || !newDesc.trim()) return;
    const { applications: list } = await api.createApplication({
      type: newType,
      description: newDesc,
      pi: "陈教授",
    });
    setCachePartial({ applications: list });
    setApplications(list);
    setModalOpen(false);
    setNewDesc("");
    setActiveTab("pending_receipt");
  }

  async function cancelApp(id: string) {
    if (!user) return;
    const { applications: list } = await api.cancelApplication(id);
    setCachePartial({ applications: list });
    setApplications(list);
  }

  async function reviewApp(id: string, action: "approve" | "reject") {
    if (!user || !canReview) return;
    const target = applications.find((x) => x.id === id);
    if (!target) return;
    if (!canReviewAll && !(canReviewVet && target.type === "veterinary")) return;
    setReviewing(id);
    try {
      const { applications: list } = await api.reviewApplication(id, action);
      setCachePartial({ applications: list });
      setApplications(list);
      if (action === "approve") setActiveTab("completed");
      else setActiveTab("rejected");
    } finally {
      setReviewing(null);
    }
  }

  return (
    <>
      <PageHeader
        title={a.title}
        action={
          <FluentButton onClick={() => setModalOpen(true)}>+ {a.newApp}</FluentButton>
        }
      />
      <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        <GlassPanel className="mb-4">
          <div className="flex flex-wrap items-end gap-4">
            <FluentInput label={a.dateFrom} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-w-[140px]" />
            <FluentInput label={a.dateTo} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="min-w-[140px]" />
            <FluentSelect label={a.appType} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[160px]">
              <option value="">{t.common.all}</option>
              {(["custody", "veterinary", "transfer", "cage_change", "breeding", "euthanasia", "other"] as ApplicationType[]).map((type) => (
                <option key={type} value={type}>{typeLabel(type)}</option>
              ))}
            </FluentSelect>
          </div>
        </GlassPanel>

        {/* Workflow tabs */}
        <div className="fluent-segment mb-4 flex flex-wrap gap-1 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={clsx(
                "rounded-lg px-3 py-2 text-xs font-medium transition-all",
                activeTab === tab
                  ? "bg-white/80 text-thu shadow-sm backdrop-blur-md"
                  : "text-lab-muted hover:bg-white/40 hover:text-thu"
              )}
            >
              {tabLabel(tab)}
              <span className="ml-1.5 rounded-full bg-thu/10 px-1.5 py-0.5 text-[10px]">{tabCounts[tab]}</span>
            </button>
          ))}
        </div>

        <GlassPanel padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="border-b border-white/30 bg-white/30">
                <tr>
                  {[a.colIndex, a.colTime, a.colApplicant, a.colPi, a.colType, a.colDesc, a.colStatus, a.colWait, a.colProcessor, a.colReceived, a.colCompleted, a.colFeedback, a.colActions].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-lab-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-10 text-center text-sm text-lab-muted">
                      {t.common.noResults}
                    </td>
                  </tr>
                ) : (
                  filtered.map((app, idx) => (
                    <tr key={app.id} className="border-b border-white/20 hover:bg-white/40">
                      <td className="px-3 py-2 text-xs">{idx + 1}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {new Date(app.applicationTime).toLocaleString(localeStr)}
                      </td>
                      <td className="px-3 py-2 text-xs">{app.applicant}</td>
                      <td className="px-3 py-2 text-xs">{app.pi}</td>
                      <td className="px-3 py-2 text-xs">{typeLabel(app.type)}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-xs" title={app.description}>{app.description}</td>
                      <td className="px-3 py-2">
                        <span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[app.status])}>
                          {tabLabel(app.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{app.waitingHours}{a.hours}</td>
                      <td className="px-3 py-2 text-xs">{app.processor ?? "—"}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {app.receivedTime ? new Date(app.receivedTime).toLocaleString(localeStr) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {app.completionTime ? new Date(app.completionTime).toLocaleString(localeStr) : "—"}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-xs">{app.feedback ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {app.status === "pending_receipt" &&
                            (canReviewAll || (canReviewVet && app.type === "veterinary")) && (
                            <>
                              <FluentButton
                                variant="secondary"
                                size="sm"
                                disabled={reviewing === app.id}
                                onClick={() => void reviewApp(app.id, "approve")}
                              >
                                {a.approve}
                              </FluentButton>
                              <FluentButton
                                variant="ghost"
                                size="sm"
                                disabled={reviewing === app.id}
                                onClick={() => void reviewApp(app.id, "reject")}
                              >
                                {a.reject}
                              </FluentButton>
                            </>
                          )}
                          {app.status === "pending_receipt" &&
                            (!canReviewAll || app.applicantUserId === user?.id) && (
                              <FluentButton variant="ghost" size="sm" onClick={() => cancelApp(app.id)}>
                                {a.cancel}
                              </FluentButton>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      </div>

      <FluentModal
        open={modalOpen}
        title={a.modalTitle}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setModalOpen(false)}>{t.common.cancel}</FluentButton>
            <FluentButton onClick={submitNew}>{a.submit}</FluentButton>
          </div>
        }
      >
        <FluentSelect label={a.appType} value={newType} onChange={(e) => setNewType(e.target.value as ApplicationType)} className="mb-3">
          {(["veterinary", "transfer", "cage_change", "breeding", "euthanasia", "other"] as ApplicationType[]).map((type) => (
            <option key={type} value={type}>{typeLabel(type)}</option>
          ))}
        </FluentSelect>
        <label className="mb-1 block text-[11px] font-medium text-lab-muted">{a.description}</label>
        <textarea
          className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
          rows={4}
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
        />
      </FluentModal>
    </>
  );
}
