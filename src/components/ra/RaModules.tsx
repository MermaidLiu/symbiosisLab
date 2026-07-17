"use client";

import { useEffect, useState } from "react";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { FluentModal } from "@/components/fluent/FluentModal";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getRaWorkspace } from "@/lib/ra/workspace";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { api } from "@/lib/api/client";
import { RaProject } from "@/types";

const statusZh: Record<string, string> = {
  active: "进行中",
  paused: "暂停",
  done: "已完成",
  draft: "草稿",
  submitted: "已投",
  revision: "修回中",
  accepted: "已接收",
  rejected: "拒稿",
};

export function ProjectsPage() {
  const { t, locale } = useLocale();
  const m = t.ra.modules;
  const label = (s: string) => (locale === "zh" ? statusZh[s] ?? s : s);
  const [projects, setProjects] = useState<RaProject[]>(() => getRaWorkspace().projects);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<RaProject["status"]>("active");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const { projects: list } = await api.raProjects();
        setProjects(list);
      } catch {
        /* keep workspace fallback */
      }
    })();
  }, []);

  async function submitProject() {
    if (!name.trim() || !due) {
      setError(m.projectNeedFields);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { projects: list } = await api.createRaProject({
        name: name.trim(),
        due,
        status,
        progress,
      });
      setProjects(list);
      setModalOpen(false);
      setName("");
      setDue("");
      setStatus("active");
      setProgress(0);
    } catch {
      setError(m.projectSaveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <RaPageShell
      title={t.nav.raProjects}
      action={
        <FluentButton onClick={() => setModalOpen(true)}>+ {m.addProject}</FluentButton>
      }
    >
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.projectsHint}</p>
      </GlassPanel>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <GlassPanel key={p.id}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-thu">{p.name}</h3>
              <span className="rounded-full bg-white/50 px-2 py-0.5 text-[11px] text-lab-muted">
                {label(p.status)}
              </span>
            </div>
            <p className="mt-2 text-xs text-lab-muted">
              {m.due}: {p.due}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/50">
              <div className="h-full rounded-full bg-thu" style={{ width: `${p.progress}%` }} />
            </div>
            <p className="mt-1 text-right text-xs text-lab-muted">{p.progress}%</p>
          </GlassPanel>
        ))}
      </div>

      <FluentModal
        open={modalOpen}
        title={m.addProject}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={saving} onClick={() => void submitProject()}>
              {saving ? m.projectSaving : t.common.save}
            </FluentButton>
          </div>
        }
      >
        <div className="space-y-3">
          <FluentInput
            label={m.projectName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.projectNamePlaceholder}
          />
          <FluentInput
            label={m.due}
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <FluentSelect
            label={m.colStatus}
            value={status}
            onChange={(e) => setStatus(e.target.value as RaProject["status"])}
          >
            <option value="active">{label("active")}</option>
            <option value="paused">{label("paused")}</option>
            <option value="done">{label("done")}</option>
          </FluentSelect>
          <FluentInput
            label={m.projectProgress}
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </FluentModal>
    </RaPageShell>
  );
}

export function SubmissionsPage() {
  const { t, locale } = useLocale();
  const m = t.ra.modules;
  const ws = getRaWorkspace();
  const label = (s: string) => (locale === "zh" ? statusZh[s] ?? s : s);
  return (
    <RaPageShell title={t.nav.raSubmissions}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.submissionsHint}</p>
      </GlassPanel>
      <GlassPanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/40 text-xs text-lab-muted">
                <th className="py-2 pr-3 font-medium">{m.colTitle}</th>
                <th className="py-2 pr-3 font-medium">{m.colVenue}</th>
                <th className="py-2 pr-3 font-medium">{m.colStatus}</th>
                <th className="py-2 font-medium">{m.colUpdated}</th>
              </tr>
            </thead>
            <tbody>
              {ws.submissions.map((s) => (
                <tr key={s.id} className="border-b border-white/20">
                  <td className="py-2.5 pr-3 font-medium text-thu">{s.title}</td>
                  <td className="py-2.5 pr-3 text-lab-text">{s.venue}</td>
                  <td className="py-2.5 pr-3">{label(s.status)}</td>
                  <td className="py-2.5 text-lab-muted">{s.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </RaPageShell>
  );
}

export function ReviewPage() {
  const { t } = useLocale();
  const m = t.ra.modules;
  const review = getRaWorkspace().reviewToday;
  return (
    <RaPageShell title={t.nav.raReview}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.reviewHint}</p>
      </GlassPanel>
      {review ? (
        <div className="grid gap-4 md:grid-cols-3">
          <GlassPanel>
            <h3 className="text-sm font-semibold text-thu">{m.wentWell}</h3>
            <p className="mt-2 text-sm text-lab-text">{review.wentWell}</p>
          </GlassPanel>
          <GlassPanel>
            <h3 className="text-sm font-semibold text-thu">{m.improve}</h3>
            <p className="mt-2 text-sm text-lab-text">{review.improve}</p>
          </GlassPanel>
          <GlassPanel>
            <h3 className="text-sm font-semibold text-thu">{m.tomorrow}</h3>
            <p className="mt-2 text-sm text-lab-text">{review.tomorrow}</p>
          </GlassPanel>
        </div>
      ) : (
        <GlassPanel>
          <p className="text-sm text-amber-700">{m.reviewEmpty}</p>
          <p className="mt-2 text-xs text-lab-muted">{m.reviewEmptyHint}</p>
        </GlassPanel>
      )}
    </RaPageShell>
  );
}

export function AdvisorPage() {
  const { t } = useLocale();
  const m = t.ra.modules;
  const notes = getRaWorkspace().advisorNotes;
  return (
    <RaPageShell title={t.nav.raAdvisor}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.advisorHint}</p>
      </GlassPanel>
      <div className="space-y-3">
        {notes.map((n) => (
          <GlassPanel key={n.id}>
            <p className="text-xs text-lab-muted">{n.date}</p>
            <h3 className="mt-1 font-semibold text-thu">{n.topic}</h3>
            <p className="mt-2 text-sm text-lab-text">{n.summary}</p>
          </GlassPanel>
        ))}
      </div>
    </RaPageShell>
  );
}

export function ExpensesModulePage() {
  const { t } = useLocale();
  const m = t.ra.modules;
  const pending = getRaWorkspace().expensesPending;
  const demo = [
    { id: "e1", title: "会议差旅", amount: "¥3,280", status: "pending" },
    { id: "e2", title: "试剂耗材", amount: "¥1,560", status: "pending" },
    { id: "e3", title: "版面费", amount: "¥8,000", status: "paid" },
  ];
  return (
    <RaPageShell title={t.nav.raExpenses}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.expensesHint}</p>
        <p className="mt-2 text-sm">
          {m.expensesPending}: <span className="font-bold text-amber-700">{pending}</span>
        </p>
      </GlassPanel>
      <GlassPanel>
        <div className="space-y-2">
          {demo.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-lg border border-white/40 bg-white/30 px-3 py-2.5 text-sm"
            >
              <div>
                <p className="font-medium text-thu">{e.title}</p>
                <p className="text-xs text-lab-muted">
                  {e.status === "pending" ? m.expPending : m.expPaid}
                </p>
              </div>
              <span className="font-semibold">{e.amount}</span>
            </div>
          ))}
        </div>
      </GlassPanel>
    </RaPageShell>
  );
}
