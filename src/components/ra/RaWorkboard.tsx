"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { FluentModal } from "@/components/fluent/FluentModal";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getRaWorkModule } from "@/lib/ra/work-modules";
import { RaWorkItem, RaWorkKind } from "@/types";

export function RaWorkboard({ kind }: { kind: RaWorkKind }) {
  const { t } = useLocale();
  const w = t.ra.work;
  const mod = getRaWorkModule(kind);
  const title = t.nav[mod.navKey];
  const hint = w.hints[kind];

  const [items, setItems] = useState<RaWorkItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", owner: "", due: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ra-work-items?kind=${kind}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError(w.loadError);
    } finally {
      setLoading(false);
    }
  }, [kind, w.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const stats = useMemo(() => {
    const open = items.filter((i) => i.status !== "done").length;
    const done = items.filter((i) => i.status === "done").length;
    const overdue = items.filter(
      (i) => i.status !== "done" && i.due && i.due < new Date().toISOString().slice(0, 10)
    ).length;
    return { open, done, overdue, total: items.length };
  }, [items]);

  function statusLabel(status: string) {
    return w.statuses[kind][status as keyof (typeof w.statuses)[typeof kind]] ?? status;
  }

  async function createItem() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ra-work-items", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...form }),
      });
      if (!res.ok) throw new Error("save");
      const data = await res.json();
      setItems(data.items.filter((i: RaWorkItem) => i.kind === kind));
      setModalOpen(false);
      setForm({ title: "", owner: "", due: "", notes: "" });
    } catch {
      setError(w.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function patchItem(id: string, body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/ra-work-items", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) throw new Error("patch");
      const data = await res.json();
      setItems((data.items as RaWorkItem[]).filter((i) => i.kind === kind));
    } catch {
      setError(w.saveError);
    }
  }

  async function removeItem(id: string) {
    if (!confirm(w.deleteConfirm)) return;
    try {
      const res = await fetch(`/api/ra-work-items?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("del");
      const data = await res.json();
      setItems((data.items as RaWorkItem[]).filter((i) => i.kind === kind));
    } catch {
      setError(w.saveError);
    }
  }

  return (
    <RaPageShell
      title={title}
      action={
        <FluentButton size="sm" onClick={() => setModalOpen(true)}>
          + {w.addItem}
        </FluentButton>
      }
    >
      <GlassPanel className="mb-4 bg-[#F7F1FA]/70">
        <p className="text-sm text-lab-text">{hint}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-lab-muted">
          <span>
            {w.statOpen}: <strong className="text-thu">{stats.open}</strong>
          </span>
          <span>
            {w.statDone}: <strong className="text-emerald-700">{stats.done}</strong>
          </span>
          <span>
            {w.statOverdue}: <strong className="text-amber-700">{stats.overdue}</strong>
          </span>
        </div>
      </GlassPanel>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-xs font-medium",
            statusFilter === "all" ? "bg-thu text-white" : "bg-white/60 text-lab-muted hover:bg-white"
          )}
        >
          {t.common.all} ({stats.total})
        </button>
        {mod.statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-medium",
              statusFilter === s ? "bg-thu text-white" : "bg-white/60 text-lab-muted hover:bg-white"
            )}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-lab-muted">{t.common.loading}</p>
      ) : filtered.length === 0 ? (
        <GlassPanel>
          <p className="text-sm text-lab-muted">{w.empty}</p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const doneN = item.checklist.filter((c) => c.done).length;
            const pct = item.checklist.length
              ? Math.round((doneN / item.checklist.length) * 100)
              : 0;
            return (
              <GlassPanel key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-thu">{item.title}</h3>
                      <span className="rounded-full bg-thu/10 px-2 py-0.5 text-[10px] font-medium text-thu">
                        {statusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-lab-muted">
                      {w.owner}: {item.owner || "—"}
                      {item.due ? ` · ${w.due}: ${item.due}` : ""}
                    </p>
                    {item.notes && <p className="mt-2 text-sm text-lab-text">{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <FluentSelect
                      className="min-w-[140px]"
                      value={item.status}
                      onChange={(e) => void patchItem(item.id, { status: e.target.value })}
                    >
                      {mod.statuses.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </FluentSelect>
                    <FluentButton variant="ghost" size="sm" onClick={() => void removeItem(item.id)}>
                      {t.common.delete}
                    </FluentButton>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-lab-muted">
                    <span>{w.checklist}</span>
                    <span>
                      {doneN}/{item.checklist.length} · {pct}%
                    </span>
                  </div>
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/70">
                    <div className="h-full rounded-full bg-thu" style={{ width: `${pct}%` }} />
                  </div>
                  <ul className="space-y-1.5">
                    {item.checklist.map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={c.done}
                            onChange={() =>
                              void patchItem(item.id, { checklistItemId: c.id, done: !c.done })
                            }
                            className="mt-0.5 accent-[#660874]"
                          />
                          <span className={clsx(c.done && "text-lab-muted line-through")}>
                            {c.label}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}

      <FluentModal
        open={modalOpen}
        title={w.addItem}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={saving || !form.title.trim()} onClick={() => void createItem()}>
              {t.common.save}
            </FluentButton>
          </div>
        }
      >
        <div className="space-y-3">
          <FluentInput
            label={w.itemTitle}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={w.itemTitlePlaceholder}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FluentInput
              label={w.owner}
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
            <FluentInput
              label={w.due}
              type="date"
              value={form.due}
              onChange={(e) => setForm({ ...form, due: e.target.value })}
            />
          </div>
          <label className="block text-[11px] font-medium text-lab-muted">{w.notes}</label>
          <textarea
            className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={w.notesPlaceholder}
          />
        </div>
      </FluentModal>
    </RaPageShell>
  );
}
