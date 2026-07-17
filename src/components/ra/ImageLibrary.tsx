"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { useLocale } from "@/components/providers/LocaleProvider";
import { RaImageLibraryItem } from "@/types";

export function ImageLibrary() {
  const { t, locale } = useLocale();
  const m = t.ra.imageLibrary;
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const [items, setItems] = useState<RaImageLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<RaImageLibraryItem["tag"]>("lab");
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState<"all" | RaImageLibraryItem["tag"]>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ra-image-library", { credentials: "same-origin" });
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

  const visible = filter === "all" ? items : items.filter((x) => x.tag === filter);

  async function upload() {
    if (!title.trim() || !file) {
      setError(m.needTitleFile);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("tag", tag);
      form.set("file", file);
      const res = await fetch("/api/ra-image-library", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (!res.ok) throw new Error("upload");
      const data = await res.json();
      setItems((prev) => [data.item as RaImageLibraryItem, ...prev]);
      setTitle("");
      setFile(null);
    } catch {
      setError(m.uploadError);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(m.deleteConfirm)) return;
    try {
      const res = await fetch(`/api/ra-image-library?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("delete");
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setError(m.deleteError);
    }
  }

  return (
    <RaPageShell title={t.nav.raImageLibrary}>
      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.hint}</p>
      </GlassPanel>

      <GlassPanel className="mb-4">
        <h3 className="text-base font-semibold text-thu">{m.uploadTitle}</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <FluentInput
            label={m.title}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={m.titlePlaceholder}
          />
          <FluentSelect label={m.tag} value={tag} onChange={(e) => setTag(e.target.value as RaImageLibraryItem["tag"])}>
            <option value="lab">{m.tags.lab}</option>
            <option value="equipment">{m.tags.equipment}</option>
            <option value="experiment">{m.tags.experiment}</option>
          </FluentSelect>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-medium text-lab-muted">{m.file}</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-thu/10 file:px-3 file:py-1.5 file:text-sm file:text-thu"
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4">
          <FluentButton type="button" disabled={uploading} onClick={() => void upload()}>
            {uploading ? m.uploading : m.upload}
          </FluentButton>
        </div>
      </GlassPanel>

      <GlassPanel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-thu">{m.listTitle}</h3>
          <FluentSelect
            className="min-w-[140px]"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">{m.filterAll}</option>
            <option value="lab">{m.tags.lab}</option>
            <option value="equipment">{m.tags.equipment}</option>
            <option value="experiment">{m.tags.experiment}</option>
          </FluentSelect>
        </div>

        {loading ? (
          <p className="text-sm text-lab-muted">{t.common.loading}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-lab-muted">{m.empty}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-lg border border-white/50 bg-white/35"
              >
                <div className="aspect-video bg-white/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/ra-image-library/${item.id}/file`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <p className="text-[10px] text-lab-muted">{m.tags[item.tag]}</p>
                  <h4 className="font-semibold text-thu">{item.title}</h4>
                  <p className="mt-1 text-[10px] text-lab-muted">
                    {new Date(item.createdAt).toLocaleString(localeStr)}
                  </p>
                  <FluentButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => void remove(item.id)}
                  >
                    {t.common.delete}
                  </FluentButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </RaPageShell>
  );
}
