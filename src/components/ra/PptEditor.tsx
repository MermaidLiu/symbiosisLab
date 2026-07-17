"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ControlBar } from "@/components/ra/ppt-editor/ControlBar";
import { PropertiesPanel, AssetPick } from "@/components/ra/ppt-editor/PropertiesPanel";
import {
  bringBlockToFront,
  prepareSlideBlocks,
  sendBlockToBack,
  setBlockAsBackground,
  SlideCanvas,
} from "@/components/ra/ppt-editor/SlideCanvas";
import { SlideNavigator } from "@/components/ra/ppt-editor/SlideNavigator";
import { useLocale } from "@/components/providers/LocaleProvider";
import { isImagePlaceholder } from "@/lib/ra/ppt-placeholders";
import { PptSlideBlock, PptTemplate, PptTemplateSlide } from "@/types";

function emptyValues(slides: PptTemplateSlide[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const slide of slides) {
    const defaults = slide.textDefaults ?? {};
    for (const key of slide.textKeys ?? []) {
      if (!(key in values)) values[key] = defaults[key] ?? "";
    }
    for (const key of slide.imageKeys ?? []) {
      if (!(key in values)) values[key] = "";
    }
    for (const key of slide.placeholders) {
      if (!(key in values)) {
        values[key] = isImagePlaceholder(key) ? "" : defaults[key] ?? "";
      }
    }
  }
  return values;
}

function normalizeSlides(slides: PptTemplateSlide[]): PptTemplateSlide[] {
  return slides.map((s) => ({
    ...s,
    textKeys: s.textKeys ?? [],
    imageKeys: s.imageKeys ?? [],
    placeholders: s.placeholders ?? [],
    textDefaults: s.textDefaults ?? {},
    imageMeta: s.imageMeta ?? [],
    blocks: s.blocks ?? [],
  }));
}

/** Beautiful.ai-inspired Smart Slide editor shell */
export function PptEditor() {
  const { t } = useLocale();
  const m = t.ra.pptEditor;

  const [templates, setTemplates] = useState<PptTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  /** Editable layout overrides per slide index */
  const [blocksBySlide, setBlocksBySlide] = useState<Record<number, PptSlideBlock[]>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const selected = useMemo(
    () => templates.find((x) => x.id === templateId) ?? null,
    [templates, templateId]
  );

  const slides = selected?.slides ?? [];
  const currentSlide = slides[currentPage] ?? null;

  const currentBlocks = useMemo(() => {
    if (!currentSlide) return [];
    if (blocksBySlide[currentSlide.index]) return blocksBySlide[currentSlide.index];
    return prepareSlideBlocks(currentSlide);
  }, [currentSlide, blocksBySlide]);

  const slidesForNav = useMemo(() => {
    return slides.map((s) => ({
      ...s,
      blocks: blocksBySlide[s.index] ?? prepareSlideBlocks(s),
    }));
  }, [slides, blocksBySlide]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ppt-templates", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      const list = ((data.templates ?? []) as PptTemplate[]).map((tpl) => ({
        ...tpl,
        slides: normalizeSlides(Array.isArray(tpl.slides) ? tpl.slides : []),
        placeholders: tpl.placeholders ?? [],
      }));
      setTemplates(list);
      setTemplateId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    } catch {
      setError(m.loadError);
    } finally {
      setLoading(false);
    }
  }, [m.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setValues({});
      setBlocksBySlide({});
      setCurrentPage(0);
      setActiveSlot(null);
      return;
    }
    setValues(emptyValues(selected.slides));
    const layout: Record<number, PptSlideBlock[]> = {};
    for (const s of selected.slides) {
      layout[s.index] = prepareSlideBlocks(s);
    }
    setBlocksBySlide(layout);
    setCurrentPage(0);
    setActiveSlot(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }

  function updateCurrentBlocks(updater: (blocks: PptSlideBlock[]) => PptSlideBlock[]) {
    if (!currentSlide) return;
    setBlocksBySlide((prev) => {
      const cur = prev[currentSlide.index] ?? prepareSlideBlocks(currentSlide);
      return { ...prev, [currentSlide.index]: updater(cur) };
    });
  }

  function handlePickAsset(asset: AssetPick) {
    if (!activeSlot || !isImagePlaceholder(activeSlot)) {
      showToast(m.selectSlotFirst);
      return;
    }
    setValues((prev) => ({ ...prev, [activeSlot]: asset.ref }));
    showToast(m.imageReplaced.replace("{name}", asset.title));
  }

  async function exportPptx() {
    if (!selected) return;
    setExporting(true);
    setError("");
    try {
      const slideImages: Record<string, string[]> = {};
      for (const slide of selected.slides) {
        const refs = (slide.imageKeys ?? [])
          .map((key) => values[key] ?? "")
          .filter((ref) => ref.startsWith("ach:") || ref.startsWith("lib:"));
        if (refs.length) slideImages[String(slide.index)] = refs;
      }

      const res = await fetch(`/api/ppt-templates/${selected.id}/generate`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, slideImages }),
      });
      if (!res.ok) throw new Error("export");
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disp);
      const filename = decodeURIComponent(match?.[1] || match?.[2] || `${selected.name}.pptx`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(m.exportSuccess);
    } catch {
      setError(m.exportError);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[560px] flex-col overflow-hidden bg-[#f4f5f7]">
      {toast && (
        <div className="fixed right-4 top-16 z-50 rounded-lg border border-thu/20 bg-white px-4 py-2.5 text-sm text-[#2d3340] shadow-lg">
          {toast}
        </div>
      )}

      {/* Top bar — Beautiful.ai style */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#e6e8ec] bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-thu text-[11px] font-bold text-white">
            S
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#2d3340]">
              {selected?.name || m.pptStudioFallback}
            </p>
            <p className="truncate text-[10px] text-[#9aa1ad]">{m.smartSlideHint}</p>
          </div>
        </div>

        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={loading || templates.length === 0}
          className="max-w-[220px] rounded-md border border-[#e6e8ec] bg-[#fafbfc] px-2.5 py-1.5 text-[12px] text-[#2d3340] outline-none focus:border-thu"
        >
          {templates.length === 0 && <option value="">{m.noTemplates}</option>}
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
              {tpl.slides?.length ? ` · ${tpl.slides.length}` : ""}
            </option>
          ))}
        </select>

        <Link
          href="/ra/templates"
          className="hidden text-[12px] font-medium text-thu hover:underline sm:inline"
        >
          {m.goTemplateLibrary}
        </Link>

        <button
          type="button"
          disabled={!selected || exporting}
          onClick={() => void exportPptx()}
          className="rounded-md bg-thu px-4 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-thu-dark disabled:opacity-50"
        >
          {exporting ? m.exporting : m.exportShort}
        </button>
      </header>

      {error && (
        <p className="shrink-0 bg-red-50 px-4 py-2 text-center text-[12px] text-red-600">{error}</p>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#9aa1ad]">
          {t.common.loading}
        </div>
      ) : !selected ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-[#7a8190]">{m.noTemplatesHint}</p>
          <Link
            href="/ra/templates"
            className="rounded-md bg-thu px-4 py-2 text-[13px] font-semibold text-white"
          >
            {m.goTemplateLibrary}
          </Link>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <SlideNavigator
            slides={slidesForNav}
            currentPage={currentPage}
            onSelect={(index) => {
              setCurrentPage(index);
              setActiveSlot(null);
            }}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6 md:p-10">
              {currentSlide && (
                <SlideCanvas
                  templateId={selected.id}
                  slide={currentSlide}
                  blocks={currentBlocks}
                  values={values}
                  activeSlot={activeSlot}
                  onSelectSlot={setActiveSlot}
                  onFieldChange={(key, value) =>
                    setValues((prev) => ({ ...prev, [key]: value }))
                  }
                  onBlocksChange={(next) =>
                    setBlocksBySlide((prev) => ({
                      ...prev,
                      [currentSlide.index]: next,
                    }))
                  }
                />
              )}
            </div>

            <ControlBar
              slide={currentSlide ? { ...currentSlide, blocks: currentBlocks } : null}
              activeKey={activeSlot}
              onSelectSlot={setActiveSlot}
              hasImageReplacement={!!(activeSlot && values[activeSlot])}
              onClearImage={(key) => setValues((prev) => ({ ...prev, [key]: "" }))}
              onSendToBack={() => {
                if (!activeSlot) return;
                updateCurrentBlocks((b) => sendBlockToBack(b, activeSlot));
                setActiveSlot(null);
                showToast(m.layerSentBack);
              }}
              onBringToFront={() => {
                if (!activeSlot) return;
                updateCurrentBlocks((b) => bringBlockToFront(b, activeSlot));
                showToast(m.layerBroughtFront);
              }}
              onSetAsBackground={() => {
                if (!activeSlot) return;
                updateCurrentBlocks((b) => setBlockAsBackground(b, activeSlot));
                setActiveSlot(null);
                showToast(m.layerSetBackgroundDone);
              }}
            />
          </div>

          <PropertiesPanel
            templateId={selected.id}
            slide={currentSlide ? { ...currentSlide, blocks: currentBlocks } : null}
            activeKey={activeSlot}
            values={values}
            onSelectSlot={setActiveSlot}
            onFieldChange={(key, value) =>
              setValues((prev) => ({ ...prev, [key]: value }))
            }
            onClearImage={(key) => setValues((prev) => ({ ...prev, [key]: "" }))}
            onPickAsset={handlePickAsset}
            onSendToBack={() => {
              if (!activeSlot) return;
              updateCurrentBlocks((b) => sendBlockToBack(b, activeSlot));
              setActiveSlot(null);
              showToast(m.layerSentBack);
            }}
            onBringToFront={() => {
              if (!activeSlot) return;
              updateCurrentBlocks((b) => bringBlockToFront(b, activeSlot));
              showToast(m.layerBroughtFront);
            }}
            onSetAsBackground={() => {
              if (!activeSlot) return;
              updateCurrentBlocks((b) => setBlockAsBackground(b, activeSlot));
              setActiveSlot(null);
              showToast(m.layerSetBackgroundDone);
            }}
          />
        </div>
      )}
    </div>
  );
}
