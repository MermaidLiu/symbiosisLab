"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useLocale } from "@/components/providers/LocaleProvider";
import { assetRefToUrl, makeAssetRef } from "@/lib/ra/ppt-placeholders";
import {
  PptSlideBlock,
  PptTemplateSlide,
  RaAchievementCategory,
  RaAchievementRecord,
  RaImageLibraryItem,
} from "@/types";

type PropTab = "edit" | "media" | "layout";

export type AssetPick = {
  kind: "achievement" | "library";
  id: string;
  title: string;
  thumbUrl: string;
  ref: string;
};

interface PropertiesPanelProps {
  templateId: string;
  slide: PptTemplateSlide | null;
  activeKey: string | null;
  values: Record<string, string>;
  onSelectSlot: (key: string) => void;
  onFieldChange: (key: string, value: string) => void;
  onClearImage: (key: string) => void;
  onPickAsset: (asset: AssetPick) => void;
  onSendToBack?: () => void;
  onBringToFront?: () => void;
  onSetAsBackground?: () => void;
}

function findBlock(slide: PptTemplateSlide | null, key: string | null): PptSlideBlock | null {
  if (!slide || !key) return null;
  return (slide.blocks ?? []).find((b) => b.key === key) ?? null;
}

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

export function PropertiesPanel({
  templateId,
  slide,
  activeKey,
  values,
  onSelectSlot,
  onFieldChange,
  onClearImage,
  onPickAsset,
  onSendToBack,
  onBringToFront,
  onSetAsBackground,
}: PropertiesPanelProps) {
  const { t } = useLocale();
  const m = t.ra.pptEditor;
  const fieldLabels = m.fields as Record<string, string>;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<PropTab>("edit");
  const [mediaSub, setMediaSub] = useState<"library" | "achievements">("library");
  const [achievements, setAchievements] = useState<RaAchievementRecord[]>([]);
  const [library, setLibrary] = useState<RaImageLibraryItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const block = findBlock(slide, activeKey);
  const kind: "text" | "image" | null = block
    ? block.kind
    : activeKey
      ? activeKey.startsWith("__img_") || activeKey.startsWith("img_")
        ? "image"
        : "text"
      : null;

  // Auto-switch tab when selection changes
  useEffect(() => {
    if (!activeKey) return;
    if (kind === "image") setTab("media");
    else if (kind === "text") setTab("edit");
  }, [activeKey, kind]);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
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
      setLoadingMedia(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "media") void loadMedia();
  }, [tab, loadMedia]);

  const mediaCards = useMemo(() => {
    if (mediaSub === "achievements") {
      return achievements.map((item) => ({
        kind: "achievement" as const,
        id: item.id,
        title: item.title,
        thumbUrl: `/api/ra-achievements/${item.id}/file`,
        ref: makeAssetRef("achievement", item.id),
      }));
    }
    return library.map((item) => ({
      kind: "library" as const,
      id: item.id,
      title: item.title,
      thumbUrl: `/api/ra-image-library/${item.id}/file`,
      ref: makeAssetRef("library", item.id),
    }));
  }, [mediaSub, achievements, library]);

  const defaults = slide?.textDefaults ?? {};
  const label =
    (activeKey && fieldLabels[activeKey]) ||
    (kind === "image"
      ? m.imageSlotLabel.replace("{n}", String((block?.imageIndex ?? 0) + 1))
      : activeKey
        ? m.textFieldN.replace("{n}", "1")
        : "");

  const layoutBlocks = slide?.blocks?.length
    ? slide.blocks
    : [
        ...(slide?.textKeys ?? []).map(
          (key, i): PptSlideBlock => ({
            key,
            kind: "text",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            defaultText: defaults[key],
          })
        ),
        ...(slide?.imageKeys ?? []).map(
          (key, i): PptSlideBlock => ({
            key,
            kind: "image",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            imageIndex: i,
          })
        ),
      ];

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
      if (mediaSub === "library") {
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
      setUploadTitle("");
      setUploadFile(null);
      setShowUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMedia();
    } catch {
      setUploadError(m.uploadError);
    } finally {
      setUploading(false);
    }
  }

  const tabs: { id: PropTab; label: string }[] = [
    { id: "edit", label: m.tabEdit },
    { id: "media", label: m.tabMedia },
    { id: "layout", label: m.tabLayout },
  ];

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-[#e6e8ec] bg-white">
      <div className="flex border-b border-[#e6e8ec]">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={clsx(
              "flex-1 py-3 text-[12px] font-semibold transition-colors",
              tab === item.id
                ? "border-b-2 border-thu text-thu"
                : "text-[#8b929e] hover:text-[#5c6370]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "edit" && (
          <>
            {!activeKey || kind !== "text" ? (
              <EmptyState text={m.propertiesEmpty} />
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9aa1ad]">
                    {m.propFieldName}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#2d3340]">{label}</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9aa1ad]">
                    {m.propContent}
                  </label>
                  <textarea
                    rows={10}
                    value={values[activeKey] ?? defaults[activeKey] ?? block?.defaultText ?? ""}
                    onChange={(e) => onFieldChange(activeKey, e.target.value)}
                    placeholder={m.textValuePlaceholder}
                    className="w-full resize-y rounded-lg border border-[#e6e8ec] bg-[#fafbfc] px-3 py-2.5 text-sm text-[#2d3340] outline-none focus:border-thu focus:ring-2 focus:ring-thu/15"
                  />
                </div>
                {(defaults[activeKey] || block?.defaultText) && (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-thu hover:underline"
                    onClick={() =>
                      onFieldChange(activeKey, defaults[activeKey] || block?.defaultText || "")
                    }
                  >
                    {m.resetToTemplate}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {tab === "media" && (
          <div className="space-y-3">
            {kind === "image" && activeKey && (
              <div className="overflow-hidden rounded-lg border border-[#e6e8ec] bg-[#fafbfc]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    assetRefToUrl(values[activeKey] ?? "") ||
                    `/api/ppt-templates/${templateId}/slides/${slide?.index ?? 0}/images/${block?.imageIndex ?? 0}`
                  }
                  alt=""
                  className="aspect-video w-full object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="space-y-2 px-2.5 py-2">
                  <p className="text-[11px] text-[#7a8190]">{m.imagePropHint}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {onSetAsBackground && (
                      <button
                        type="button"
                        onClick={onSetAsBackground}
                        className="rounded-md bg-thu px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        {m.layerSetBackground}
                      </button>
                    )}
                    {onSendToBack && (
                      <button
                        type="button"
                        onClick={onSendToBack}
                        className="rounded-md border border-[#e6e8ec] bg-white px-2 py-1 text-[11px] font-medium text-[#5c6370]"
                      >
                        {m.layerSendBack}
                      </button>
                    )}
                    {onBringToFront && (
                      <button
                        type="button"
                        onClick={onBringToFront}
                        className="rounded-md border border-[#e6e8ec] bg-white px-2 py-1 text-[11px] font-medium text-[#5c6370]"
                      >
                        {m.layerBringFront}
                      </button>
                    )}
                    {values[activeKey] && (
                      <button
                        type="button"
                        onClick={() => onClearImage(activeKey)}
                        className="rounded-md border border-[#e6e8ec] bg-white px-2 py-1 text-[11px] font-medium text-[#5c6370]"
                      >
                        {m.clearImage}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1 rounded-lg bg-[#f3f4f7] p-1">
              {(["library", "achievements"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMediaSub(key)}
                  className={clsx(
                    "flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-colors",
                    mediaSub === key
                      ? "bg-white text-thu shadow-sm"
                      : "text-[#8b929e] hover:text-[#5c6370]"
                  )}
                >
                  {key === "library" ? m.tabImageLibrary : m.tabAchievements}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowUpload((v) => !v)}
                className="rounded-md bg-thu px-2.5 py-1.5 text-[11px] font-semibold text-white"
              >
                {m.addAsset}
              </button>
            </div>

            {showUpload && (
              <div className="space-y-2 rounded-lg border border-[#e6e8ec] bg-[#fafbfc] p-2.5">
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder={m.uploadTitlePlaceholder}
                  className="w-full rounded-md border border-[#e6e8ec] bg-white px-2 py-1.5 text-[12px] outline-none focus:border-thu"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={mediaSub === "library" ? "image/*" : "image/*,.pdf"}
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-[11px] text-[#7a8190]"
                />
                {uploadError && <p className="text-[11px] text-red-500">{uploadError}</p>}
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void handleUpload()}
                  className="w-full rounded-md bg-thu py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                >
                  {uploading ? m.uploading : m.uploadAsset}
                </button>
              </div>
            )}

            {loadingMedia ? (
              <p className="py-4 text-center text-[12px] text-[#9aa1ad]">{t.common.loading}</p>
            ) : mediaCards.length === 0 ? (
              <EmptyState
                text={mediaSub === "library" ? m.noImages : m.noAchievements}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {mediaCards.map((card) => (
                  <button
                    key={`${card.kind}-${card.id}`}
                    type="button"
                    onClick={() =>
                      onPickAsset({
                        kind: card.kind,
                        id: card.id,
                        title: card.title,
                        thumbUrl: card.thumbUrl,
                        ref: card.ref,
                      })
                    }
                    className="overflow-hidden rounded-lg border border-[#e6e8ec] bg-white text-left transition-all hover:border-thu/50 hover:shadow-sm"
                  >
                    <div className="aspect-square bg-[#f3f4f7]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.thumbUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <p className="truncate px-1.5 py-1.5 text-[10px] font-medium text-[#5c6370]">
                      {card.title}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "layout" && (
          <div className="space-y-1.5">
            <p className="mb-2 text-[11px] leading-relaxed text-[#8b929e]">{m.layoutHint}</p>
            {layoutBlocks.length === 0 ? (
              <EmptyState text={m.noPlaceholdersOnPage} />
            ) : (
              layoutBlocks.map((b, i) => {
                const selected = activeKey === b.key;
                const name =
                  fieldLabels[b.key] ||
                  (b.kind === "image"
                    ? m.imageSlotLabel.replace("{n}", String((b.imageIndex ?? i) + 1))
                    : m.textFieldN.replace("{n}", String(i + 1)));
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onSelectSlot(b.key)}
                    className={clsx(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all",
                      selected
                        ? "border-thu bg-thu/5"
                        : "border-[#e6e8ec] hover:border-[#c5c9d2]"
                    )}
                  >
                    <span
                      className={clsx(
                        "flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-bold",
                        b.kind === "image"
                          ? "bg-[#eef0f4] text-[#5c6370]"
                          : "bg-thu-muted text-thu"
                      )}
                    >
                      {b.kind === "image" ? "IMG" : "T"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-[#2d3340]">{name}</p>
                      <p className="truncate text-[10px] text-[#9aa1ad]">
                        {b.kind === "image" ? m.layoutImage : m.layoutText}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#e0e3e9] bg-[#fafbfc] px-4 py-10 text-center">
      <p className="text-[12px] leading-relaxed text-[#9aa1ad]">{text}</p>
    </div>
  );
}
