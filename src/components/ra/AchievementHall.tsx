"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RaAchievementCategory, RaAchievementRecord } from "@/types";

const CATEGORIES: RaAchievementCategory[] = ["certificate", "patent", "paper", "ppt"];

export function AchievementHall() {
  const { t, locale } = useLocale();
  const m = t.ra.achievementHall;
  const [items, setItems] = useState<RaAchievementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<RaAchievementCategory>("certificate");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState<"all" | RaAchievementCategory>("all");
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const categoryLabel = useCallback(
    (c: RaAchievementCategory) => m.categories[c],
    [m.categories]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ra-achievements", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError(m.loadError);
    } finally {
      setLoading(false);
    }
  }, [m.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((x) => x.category === filter)),
    [items, filter]
  );

  async function upload() {
    if (!title.trim() || !file) {
      setError(m.needTitleFile);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("category", category);
      form.set("title", title.trim());
      form.set("note", note.trim());
      form.set("file", file);
      const res = await fetch("/api/ra-achievements", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (!res.ok) throw new Error("upload");
      const data = await res.json();
      setItems((prev) => [data.item as RaAchievementRecord, ...prev]);
      setTitle("");
      setNote("");
      setFile(null);
    } catch {
      setError(m.uploadError);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(m.deleteConfirm)) return;
    try {
      const res = await fetch(`/api/ra-achievements?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("del");
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setError(m.deleteError);
    }
  }

  return (
    <RaPageShell title={t.nav.raAchievements}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.hint}</p>
        <Link href="/ra/ppt" className="mt-2 inline-block text-sm text-thu hover:underline">
          {m.openPpt}
        </Link>
      </GlassPanel>

      <GlassPanel className="mb-4">
        <h3 className="mb-3 font-semibold text-thu">{m.uploadTitle}</h3>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          <FluentSelect
            label={m.category}
            value={category}
            onChange={(e) => setCategory(e.target.value as RaAchievementCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </FluentSelect>
          <FluentInput
            label={m.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={m.titlePlaceholder}
          />
          <FluentInput
            label={m.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={m.notePlaceholder}
            className="md:col-span-2"
          />
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-medium text-lab-muted">{m.scanFile}</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.pptx,.ppt,image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-lab-text file:mr-3 file:rounded-lg file:border-0 file:bg-thu/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-thu"
            />
            <p className="mt-1 text-[11px] text-lab-muted">{m.fileHint}</p>
          </div>
        </div>
        <div className="mt-4">
          <FluentButton type="button" disabled={saving} onClick={() => void upload()}>
            {saving ? m.uploading : m.upload}
          </FluentButton>
        </div>
      </GlassPanel>

      <GlassPanel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-thu">{m.listTitle}</h3>
          <FluentSelect
            className="w-40"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">{m.filterAll}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </FluentSelect>
        </div>
        {loading ? (
          <p className="text-sm text-lab-muted">{t.common.loading}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-lab-muted">{m.empty}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visible.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-white/40 bg-white/30 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-lab-muted">{categoryLabel(item.category)}</p>
                    <h4 className="font-semibold text-thu">{item.title}</h4>
                  </div>
                  <FluentButton type="button" variant="ghost" size="sm" onClick={() => void remove(item.id)}>
                    {t.common.delete}
                  </FluentButton>
                </div>
                {item.note && <p className="mt-1 text-xs text-lab-text">{item.note}</p>}
                <p className="mt-2 text-[11px] text-lab-muted">
                  {item.fileName} ·{" "}
                  {new Date(item.createdAt).toLocaleString(localeStr)}
                </p>
                <a
                  href={`/api/ra-achievements/${item.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-thu hover:underline"
                >
                  {m.viewScan}
                </a>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </RaPageShell>
  );
}
