"use client";

import clsx from "clsx";
import { useLocale } from "@/components/providers/LocaleProvider";
import { PptSlideBlock, PptTemplateSlide } from "@/types";

interface ControlBarProps {
  slide: PptTemplateSlide | null;
  activeKey: string | null;
  onSelectSlot: (key: string) => void;
  onClearImage?: (key: string) => void;
  hasImageReplacement?: boolean;
  onSendToBack?: () => void;
  onBringToFront?: () => void;
  onSetAsBackground?: () => void;
}

function findBlock(slide: PptTemplateSlide | null, key: string | null): PptSlideBlock | null {
  if (!slide || !key) return null;
  return (slide.blocks ?? []).find((b) => b.key === key) ?? null;
}

/** Beautiful.ai-style contextual control bar under the slide */
export function ControlBar({
  slide,
  activeKey,
  onSelectSlot,
  onClearImage,
  hasImageReplacement,
  onSendToBack,
  onBringToFront,
  onSetAsBackground,
}: ControlBarProps) {
  const { t } = useLocale();
  const m = t.ra.pptEditor;
  const fieldLabels = m.fields as Record<string, string>;
  const block = findBlock(slide, activeKey);

  const blocks = slide?.blocks?.length
    ? slide.blocks
    : [
        ...(slide?.textKeys ?? []).map((key) => ({ key, kind: "text" as const })),
        ...(slide?.imageKeys ?? []).map((key, i) => ({
          key,
          kind: "image" as const,
          imageIndex: i,
        })),
      ];

  if (!activeKey || (!block && !blocks.some((b) => b.key === activeKey))) {
    return (
      <div className="flex h-12 items-center justify-center border-t border-[#e6e8ec] bg-white px-4">
        <p className="text-[12px] text-[#9aa1ad]">{m.controlBarEmpty}</p>
      </div>
    );
  }

  const kind =
    block?.kind ??
    (activeKey.startsWith("__img_") || activeKey.startsWith("img_") ? "image" : "text");

  const label =
    fieldLabels[activeKey] ||
    (kind === "image"
      ? m.imageSlotLabel.replace("{n}", String((block?.imageIndex ?? 0) + 1))
      : m.textFieldN.replace("{n}", "1"));

  const isBackground = kind === "image" && (block?.z ?? 10) <= 1;

  return (
    <div className="flex h-12 items-center gap-2 border-t border-[#e6e8ec] bg-white px-3">
      <span
        className={clsx(
          "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold",
          kind === "image" ? "bg-[#eef0f4] text-[#5c6370]" : "bg-thu-muted text-thu"
        )}
      >
        {isBackground ? m.layerBackgroundBadge : kind === "image" ? m.layoutImage : m.layoutText}
      </span>
      <span className="hidden truncate text-[12px] font-medium text-[#2d3340] sm:inline">
        {label}
      </span>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        {onSendToBack && (
          <button
            type="button"
            onClick={onSendToBack}
            className="rounded-md border border-[#e6e8ec] px-2 py-1 text-[11px] font-medium text-[#5c6370] hover:bg-[#f3f4f7]"
            title={m.layerSendBack}
          >
            {m.layerSendBack}
          </button>
        )}
        {onBringToFront && (
          <button
            type="button"
            onClick={onBringToFront}
            className="rounded-md border border-[#e6e8ec] px-2 py-1 text-[11px] font-medium text-[#5c6370] hover:bg-[#f3f4f7]"
            title={m.layerBringFront}
          >
            {m.layerBringFront}
          </button>
        )}
        {kind === "image" && onSetAsBackground && (
          <button
            type="button"
            onClick={onSetAsBackground}
            className="rounded-md bg-thu px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-thu-dark"
            title={m.layerSetBackground}
          >
            {m.layerSetBackground}
          </button>
        )}
        {kind === "image" && hasImageReplacement && onClearImage && (
          <button
            type="button"
            onClick={() => onClearImage(activeKey)}
            className="rounded-md border border-[#e6e8ec] px-2 py-1 text-[11px] font-medium text-[#5c6370] hover:bg-[#f3f4f7]"
          >
            {m.clearImage}
          </button>
        )}
      </div>
    </div>
  );
}
