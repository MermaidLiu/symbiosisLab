"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useLocale } from "@/components/providers/LocaleProvider";
import { makeAssetRef } from "@/lib/ra/ppt-placeholders";
import { RaAchievementCategory, RaAchievementRecord, RaImageLibraryItem } from "@/types";

export type AssetPick = {
  kind: "achievement" | "library";
  id: string;
  title: string;
  thumbUrl: string;
  ref: string;
};

type Tab = "achievements" | "library";

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

interface AssetPanelProps {
  activeSlot: string | null;
  onPick: (asset: AssetPick) => void;
}

export function AssetPanel({ activeSlot, onPick }: AssetPanelProps) {
  const { t } = useLocale();
  const m = t.ra.pptEditor;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("library");
  const [achievements, setAchievements] = useState<RaAchievementRecord[]>([]);
  const [library, setLibrary] = useState<RaImageLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, l] = await Promise.all([
        fetch("/api/ra-achievements", { credentials: "same-origin" }),
        fetch("/api/ra-image-library", { credentials: "same-origin" }),
      ]);
      if (a.ok) {
        const data = await a.json();
        setAchievements(
          ((data.items ?? []) as RaAchievementRecord[]).filter((x) => isImageMime(x.mimeType))
        );
      }
      if (l.ok) {
        const data = await l.json();
        setLibrary(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => {
    if (tab === "achievements") {
      return achievements.map((item) => ({
        kind: "achievement" as const,
        id: item.id,
        title: item.title,
        thumbUrl: `/api/ra-achievements/${item.id}/file`,
        subtitle: t.ra.achievementHall.categories[item.category],
        ref: makeAssetRef("achievement", item.id),
      }));
    }
    return library.map((item) => ({
      kind: "library" as const,
      id: item.id,
      title: item.title,
      thumbUrl: `/api/ra-image-library/${item.id}/file`,
      subtitle: t.ra.imageLibrary.tags[item.tag],
      ref: makeAssetRef("library", item.id),
    }));
  }, [tab, achievements, library, t.ra.achievementHall.categories, t.ra.imageLibrary.tags]);

  function resetUpload() {
    setUploadTitle("");
    setUploadFile(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload() {
    const title = uploadTitle.trim() || uploadFile?.name.replace(/\.[^.]+$/, "") || "";
    if (!title || !uploadFile) {
      setUploadError(m.needTitleFile);
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("file", uploadFile);

      if (tab === "library") {
        form.set("tag", "lab");
        const res = await fetch("/api/ra-image-library", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        if (!res.ok) throw new Error("upload");
      } else {
        form.set("category", "certificate" as RaAchievementCategory);
        const res = await fetch("/api/ra-achievements", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        if (!res.ok) throw new Error("upload");
      }

      resetUpload();
      setShowAdd(false);
      await load();
    } catch {
      setUploadError(m.uploadError);
    } finally {
      setUploading(false);
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-[260px] shrink-0 flex-col border-r border-lab-border/60 bg-white/90 backdrop-blur-md">
      <div className="border-b border-lab-border/50 px-3 py-3">
        <p className="text-xs font-semibold tracking-wide text-thu">{m.assetPanelTitle}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-lab-muted">
          {activeSlot ? m.assetPanelActiveHint : m.assetPanelHint}
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-lab-border/50 p-2">
        {(["library", "achievements"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setShowAdd(false);
              resetUpload();
            }}
            className={clsx(
              "flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
              tab === key
                ? "bg-thu/10 text-thu shadow-sm"
                : "text-lab-muted hover:bg-slate-50 hover:text-thu"
            )}
          >
            {key === "library" ? m.tabImageLibrary : m.tabAchievements}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            resetUpload();
          }}
          className={clsx(
            "shrink-0 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
            showAdd ? "bg-thu text-white" : "bg-slate-100 text-thu hover:bg-thu/10"
          )}
          title={m.addAsset}
        >
          {m.addAsset}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-2 border-b border-lab-border/50 bg-slate-50/80 p-2">
          <input
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder={m.uploadTitlePlaceholder}
            className="w-full rounded-md border border-lab-border/70 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-thu/40"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={tab === "library" ? "image/*" : "image/*,.pdf"}
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="w-full text-[10px] text-lab-muted file:mr-2 file:rounded file:border-0 file:bg-thu/10 file:px-2 file:py-1 file:text-[10px] file:text-thu"
          />
          {uploadError && <p className="text-[10px] text-red-500">{uploadError}</p>}
          <button
            type="button"
            disabled={uploading}
            onClick={() => void handleUpload()}
            className="w-full rounded-md bg-thu px-2 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
          >
            {uploading ? m.uploading : m.uploadAsset}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-1 py-3 text-[11px] text-lab-muted">{t.common.loading}</p>
        ) : cards.length === 0 ? (
          <p className="px-1 py-3 text-[11px] text-lab-muted">
            {tab === "library" ? m.noImages : m.noAchievements}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cards.map((card) => (
              <button
                key={`${card.kind}-${card.id}`}
                type="button"
                onClick={() =>
                  onPick({
                    kind: card.kind,
                    id: card.id,
                    title: card.title,
                    thumbUrl: card.thumbUrl,
                    ref: card.ref,
                  })
                }
                className={clsx(
                  "group overflow-hidden rounded-lg border bg-white text-left transition-all",
                  activeSlot
                    ? "border-thu/25 hover:border-thu/50 hover:ring-1 hover:ring-thu/20"
                    : "border-lab-border/70 hover:border-thu/30 hover:shadow-sm"
                )}
              >
                <div className="aspect-square bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={card.thumbUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="px-1.5 py-1.5">
                  <p className="truncate text-[10px] font-medium text-thu">{card.title}</p>
                  <p className="truncate text-[9px] text-lab-muted">{card.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
