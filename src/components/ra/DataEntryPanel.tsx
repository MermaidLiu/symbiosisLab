"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput } from "@/components/fluent/FluentField";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RaDataEntry } from "@/types";

export function DataEntryPanel() {
  const { t, locale } = useLocale();
  const m = t.ra.dataManage;
  const [entries, setEntries] = useState<RaDataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ra-data-entries", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      setEntries(data.entries ?? []);
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
    if (!category.trim() || !label.trim() || !value.trim()) {
      setError(m.needFields);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ra-data-entries", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim(),
          label: label.trim(),
          value: value.trim(),
          unit: unit.trim(),
          note: note.trim(),
        }),
      });
      if (!res.ok) throw new Error("save");
      const data = await res.json();
      setEntries((prev) => [data.entry as RaDataEntry, ...prev]);
      setCategory("");
      setLabel("");
      setValue("");
      setUnit("");
      setNote("");
    } catch {
      setError(m.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(m.deleteConfirm)) return;
    try {
      const res = await fetch(`/api/ra-data-entries?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("del");
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError(m.deleteError);
    }
  }

  return (
    <RaPageShell title={t.nav.raData}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.hint}</p>
      </GlassPanel>

      <GlassPanel className="mb-4">
        <h3 className="mb-3 font-semibold text-thu">{m.entryTitle}</h3>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <FluentInput
            label={m.category}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={m.categoryPlaceholder}
          />
          <FluentInput
            label={m.label}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={m.labelPlaceholder}
          />
          <FluentInput
            label={m.value}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={m.valuePlaceholder}
          />
          <FluentInput
            label={m.unit}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={m.unitPlaceholder}
          />
          <FluentInput
            label={m.note}
            className="md:col-span-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={m.notePlaceholder}
          />
        </div>
        <div className="mt-4">
          <FluentButton type="button" disabled={saving} onClick={() => void save()}>
            {saving ? m.saving : m.save}
          </FluentButton>
        </div>
      </GlassPanel>

      <GlassPanel>
        <h3 className="mb-3 font-semibold text-thu">{m.listTitle}</h3>
        {loading ? (
          <p className="text-sm text-lab-muted">{t.common.loading}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-lab-muted">{m.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/40 text-xs text-lab-muted">
                  <th className="py-2 pr-3 font-medium">{m.category}</th>
                  <th className="py-2 pr-3 font-medium">{m.label}</th>
                  <th className="py-2 pr-3 font-medium">{m.value}</th>
                  <th className="py-2 pr-3 font-medium">{m.updated}</th>
                  <th className="py-2 font-medium">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-white/20">
                    <td className="py-2.5 pr-3">{e.category}</td>
                    <td className="py-2.5 pr-3 font-medium text-thu">{e.label}</td>
                    <td className="py-2.5 pr-3">
                      {e.value}
                      {e.unit ? ` ${e.unit}` : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-lab-muted">
                      {new Date(e.updatedAt).toLocaleString(localeStr)}
                    </td>
                    <td className="py-2.5">
                      <FluentButton type="button" variant="ghost" size="sm" onClick={() => void remove(e.id)}>
                        {t.common.delete}
                      </FluentButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </RaPageShell>
  );
}
