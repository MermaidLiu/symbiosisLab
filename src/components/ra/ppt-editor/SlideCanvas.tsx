"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import clsx from "clsx";
import { useLocale } from "@/components/providers/LocaleProvider";
import { assetRefToUrl } from "@/lib/ra/ppt-placeholders";
import { PptSlideBlock, PptSlideImageMeta, PptTemplateSlide } from "@/types";

type Rect = Pick<PptSlideBlock, "x" | "y" | "w" | "h">;
type Handle = "nw" | "ne" | "sw" | "se" | "move";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Fit an image into a target box, preserving pixel aspect when known. */
function fitInBox(meta: PptSlideImageMeta | undefined, box: Rect): Rect {
  const pw = meta?.width ?? 0;
  const ph = meta?.height ?? 0;
  if (pw > 0 && ph > 0) {
    const aspect = pw / ph;
    let w = box.w;
    let h = w / aspect;
    if (h > box.h) {
      h = box.h;
      w = h * aspect;
    }
    // Prefer filling the box — bump up if we shrunk too much
    if (w < box.w * 0.85 && h < box.h * 0.85) {
      if (box.w / box.h > aspect) {
        h = box.h;
        w = h * aspect;
      } else {
        w = box.w;
        h = w / aspect;
      }
      if (w > box.w) {
        w = box.w;
        h = w / aspect;
      }
      if (h > box.h) {
        h = box.h;
        w = h * aspect;
      }
    }
    return {
      x: box.x + (box.w - w) / 2,
      y: box.y + (box.h - h) / 2,
      w,
      h,
    };
  }
  // Unknown pixels → use the full target box (always large)
  return { ...box };
}

function ensureBlocks(slide: PptTemplateSlide): PptSlideBlock[] {
  if (slide.blocks?.length) return slide.blocks.map((b) => ({ ...b }));

  const defaults = slide.textDefaults ?? {};
  const textBlocks: PptSlideBlock[] = (slide.textKeys ?? []).map((key, i) => ({
    key,
    kind: "text" as const,
    x: 0.06,
    y: 0.1 + i * 0.12,
    w: 0.5,
    h: 0.1,
    defaultText: defaults[key] ?? "",
  }));

  const imageBlocks: PptSlideBlock[] = (slide.imageKeys ?? []).map((key, i) => ({
    key,
    kind: "image" as const,
    x: 0.58,
    y: 0.12 + i * 0.28,
    w: 0.36,
    h: 0.32,
    imageIndex: i,
  }));

  return [...textBlocks, ...imageBlocks];
}

/**
 * Default Smart Slide layout:
 * - First text → full-width title bar on top
 * - Remaining text → left column over the slide
 * - First image → full-bleed background by default
 * - Extra images → content slots above the background
 */
export function prepareSlideBlocks(slide: PptTemplateSlide): PptSlideBlock[] {
  const raw = ensureBlocks(slide);
  const meta = slide.imageMeta ?? [];

  const texts = raw
    .filter((b) => b.kind === "text")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const images = raw
    .filter((b) => b.kind === "image")
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const out: PptSlideBlock[] = [];
  const bodyTexts = texts.slice(1);
  const fgImages = images.slice(1);
  const useLeftColumn = fgImages.length > 0 && bodyTexts.length > 0;

  // Title
  if (texts[0]) {
    out.push({
      ...texts[0],
      x: 0.04,
      y: 0.03,
      w: 0.92,
      h: 0.1,
      z: 30,
    });
  }

  const titleBottom = texts.length > 0 ? 0.15 : 0.04;

  // Body text (over background)
  bodyTexts.forEach((b, i) => {
    out.push({
      ...b,
      x: 0.04,
      y: titleBottom + 0.02 + i * 0.12,
      w: useLeftColumn ? 0.4 : 0.55,
      h: Math.max(0.1, Math.min(0.22, b.h < 0.08 ? 0.12 : b.h)),
      z: 31 + i,
    });
  });

  // First image → default full-slide background
  if (images[0]) {
    out.push({
      ...images[0],
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      z: 0,
    });
  }

  // Extra images as foreground content slots
  if (fgImages.length === 1) {
    const b = fgImages[0];
    const m = meta[b.imageIndex ?? 1];
    const box: Rect = useLeftColumn
      ? { x: 0.46, y: titleBottom, w: 0.5, h: 0.8 }
      : { x: 0.5, y: titleBottom, w: 0.46, h: 0.75 };
    out.push({ ...b, ...fitInBox(m, box), z: 10 });
  } else if (fgImages.length > 1) {
    const cols = fgImages.length <= 2 ? fgImages.length : 2;
    const rows = Math.ceil(fgImages.length / cols);
    const gap = 0.02;
    const cellW = (useLeftColumn ? 0.5 : 0.46) / cols - gap;
    const cellH = 0.75 / rows - gap;
    const baseX = useLeftColumn ? 0.46 : 0.5;

    fgImages.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const m = meta[b.imageIndex ?? i + 1];
      const box: Rect = {
        x: baseX + col * (cellW + gap),
        y: titleBottom + row * (cellH + gap),
        w: cellW,
        h: cellH,
      };
      out.push({ ...b, ...fitInBox(m, box), z: 10 + i });
    });
  }

  return out;
}

/** Send block behind all others (background layer). Text stays above. */
export function sendBlockToBack(blocks: PptSlideBlock[], key: string): PptSlideBlock[] {
  return blocks.map((b) => {
    if (b.key === key) return { ...b, z: 0 };
    if (b.kind === "text") return { ...b, z: Math.max(b.z ?? 20, 30) };
    return b;
  });
}

/** Bring block above all others. */
export function bringBlockToFront(blocks: PptSlideBlock[], key: string): PptSlideBlock[] {
  const maxZ = Math.max(40, ...blocks.map((b) => b.z ?? 10)) + 1;
  return blocks.map((b) => (b.key === key ? { ...b, z: maxZ } : b));
}

/** Place image as full-slide background (bottom layer + cover). Text stays on top. */
export function setBlockAsBackground(blocks: PptSlideBlock[], key: string): PptSlideBlock[] {
  return blocks.map((b) => {
    if (b.key === key) {
      return { ...b, x: 0, y: 0, w: 1, h: 1, z: 0 };
    }
    if (b.kind === "text") {
      return { ...b, z: Math.max(b.z ?? 20, 30) };
    }
    // other images stay above background but below text
    return { ...b, z: Math.max(b.z ?? 10, 5) };
  });
}

/** @deprecated kept for callers — prefer prepareSlideBlocks */
export function fitImageRect(
  block: Rect,
  meta: PptSlideImageMeta | undefined,
  opts: { solo: boolean }
): Rect {
  const top = 0.15;
  const box: Rect = opts.solo
    ? { x: 0.04, y: top, w: 0.92, h: 0.8 }
    : { x: Math.max(block.x, 0.46), y: top, w: 0.5, h: 0.8 };
  return fitInBox(meta, box);
}

function isTitleLike(block: PptSlideBlock, index: number) {
  if (block.key === "title") return true;
  // First text is always laid out as the title bar
  return index === 0 && block.kind === "text";
}

interface SlideCanvasProps {
  templateId: string;
  slide: PptTemplateSlide;
  blocks: PptSlideBlock[];
  values: Record<string, string>;
  activeSlot: string | null;
  onSelectSlot: (key: string | null) => void;
  onFieldChange: (key: string, value: string) => void;
  onBlocksChange: (blocks: PptSlideBlock[]) => void;
}

/** Clean Beautiful.ai-style Smart Slide canvas with drag + resize */
export function SlideCanvas({
  templateId,
  slide,
  blocks,
  values,
  activeSlot,
  onSelectSlot,
  onFieldChange,
  onBlocksChange,
}: SlideCanvasProps) {
  const { t } = useLocale();
  const m = t.ra.pptEditor;
  const defaults = slide.textDefaults ?? {};
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: string;
    handle: Handle;
    startX: number;
    startY: number;
    orig: Rect;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const updateBlockRect = useCallback(
    (key: string, rect: Rect) => {
      onBlocksChange(
        blocks.map((b) =>
          b.key === key
            ? {
                ...b,
                x: clamp(rect.x, 0, 0.98),
                y: clamp(rect.y, 0, 0.98),
                w: clamp(rect.w, 0.05, 1),
                h: clamp(rect.h, 0.04, 1),
              }
            : b
        )
      );
    },
    [blocks, onBlocksChange]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      const stage = stageRef.current;
      if (!drag || !stage) return;

      const rect = stage.getBoundingClientRect();
      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      const o = drag.orig;

      let next: Rect = { ...o };

      if (drag.handle === "move") {
        next = {
          ...o,
          x: clamp(o.x + dx, 0, 1 - o.w),
          y: clamp(o.y + dy, 0, 1 - o.h),
        };
      } else if (drag.handle === "se") {
        next = {
          x: o.x,
          y: o.y,
          w: clamp(o.w + dx, 0.05, 1 - o.x),
          h: clamp(o.h + dy, 0.04, 1 - o.y),
        };
      } else if (drag.handle === "sw") {
        const w = clamp(o.w - dx, 0.05, o.x + o.w);
        next = {
          x: o.x + o.w - w,
          y: o.y,
          w,
          h: clamp(o.h + dy, 0.04, 1 - o.y),
        };
      } else if (drag.handle === "ne") {
        const h = clamp(o.h - dy, 0.04, o.y + o.h);
        next = {
          x: o.x,
          y: o.y + o.h - h,
          w: clamp(o.w + dx, 0.05, 1 - o.x),
          h,
        };
      } else if (drag.handle === "nw") {
        const w = clamp(o.w - dx, 0.05, o.x + o.w);
        const h = clamp(o.h - dy, 0.04, o.y + o.h);
        next = {
          x: o.x + o.w - w,
          y: o.y + o.h - h,
          w,
          h,
        };
      }

      updateBlockRect(drag.key, next);
    },
    [updateBlockRect]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [dragging, onPointerMove, endDrag]);

  function startDrag(
    e: ReactPointerEvent,
    key: string,
    handle: Handle,
    block: PptSlideBlock
  ) {
    e.stopPropagation();
    e.preventDefault();
    onSelectSlot(key);
    dragRef.current = {
      key,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: block.x, y: block.y, w: block.w, h: block.h },
    };
    setDragging(true);
  }

  let textOrdinal = 0;

  const hint = useMemo(() => m.dragResizeHint, [m.dragResizeHint]);

  const sortedBlocks = useMemo(
    () =>
      [...blocks].sort((a, b) => {
        const za = a.z ?? (a.kind === "text" ? 30 : 10);
        const zb = b.z ?? (b.kind === "text" ? 30 : 10);
        return za - zb;
      }),
    [blocks]
  );

  return (
    <div className="relative w-full max-w-[960px]">
      <div
        className="overflow-hidden rounded-lg bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-black/5"
        onClick={() => onSelectSlot(null)}
      >
        <div ref={stageRef} className="relative aspect-video w-full touch-none bg-white">
          {sortedBlocks.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#9aa1ad]">
              <p className="text-sm">{m.noPlaceholdersOnPage}</p>
              <p className="text-xs">{m.emptySlideHint}</p>
            </div>
          ) : (
            sortedBlocks.map((block) => {
              const selected = activeSlot === block.key;
              const baseZ = block.z ?? (block.kind === "text" ? 30 : 10);
              const isBackground = block.kind === "image" && baseZ <= 1;
              // Never lift background above text when selected (that was covering text)
              let zIndex = baseZ;
              if (selected) {
                if (isBackground) zIndex = 1; // stay under text (30+)
                else if (block.kind === "text") zIndex = 1000 + baseZ;
                else zIndex = Math.min(baseZ + 5, 18); // images under text layer
              }
              const style = {
                left: `${block.x * 100}%`,
                top: `${block.y * 100}%`,
                width: `${block.w * 100}%`,
                height: `${block.h * 100}%`,
                zIndex,
              };

              if (block.kind === "image") {
                const ref = values[block.key] ?? "";
                const userUrl = assetRefToUrl(ref);
                const idx = block.imageIndex ?? 0;
                const previewUrl =
                  userUrl ||
                  `/api/ppt-templates/${templateId}/slides/${slide.index}/images/${idx}`;

                return (
                  <div
                    key={block.key}
                    style={style}
                    onPointerDown={(e) => {
                      // Allow clicking through background to text unless grabbing handles / selected drag
                      if (isBackground && !selected) {
                        // still allow selecting background with shift or via explicit click on badge area
                        return;
                      }
                      startDrag(e, block.key, "move", block);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSlot(block.key);
                    }}
                    className={clsx(
                      "absolute overflow-hidden",
                      isBackground ? "bg-transparent" : "cursor-move bg-[#f3f4f7]",
                      isBackground && !selected && "pointer-events-none",
                      selected
                        ? "ring-2 ring-thu"
                        : !isBackground && "hover:ring-2 hover:ring-thu/40",
                      dragging && selected ? "opacity-95" : ""
                    )}
                  >
                    {/* Hit target to re-select background when pointer-events-none on container */}
                    {isBackground && !selected && (
                      <button
                        type="button"
                        className="pointer-events-auto absolute left-2 top-2 z-10 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white hover:bg-black/70"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSlot(block.key);
                        }}
                      >
                        {m.layerBackgroundBadge}
                      </button>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt=""
                      draggable={false}
                      className={clsx(
                        "pointer-events-none h-full w-full",
                        isBackground ? "object-cover" : "object-contain"
                      )}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div
                      className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-[#f0f1f5]/70"
                      style={{ display: "none" }}
                    >
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-thu shadow-sm">
                        {m.addImage}
                      </span>
                    </div>
                    {isBackground && selected && (
                      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[9px] text-white">
                        {m.layerBackgroundBadge}
                      </span>
                    )}
                    {selected && !userUrl && !isBackground && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/35 to-transparent px-2 py-1.5 text-center">
                        <span className="text-[10px] font-medium text-white">{m.imageSlotHint}</span>
                      </div>
                    )}
                    {selected && (
                      <ResizeHandles
                        onPointerDown={(e, handle) => startDrag(e, block.key, handle, block)}
                      />
                    )}
                  </div>
                );
              }

              const ord = textOrdinal++;
              const defaultText = block.defaultText ?? defaults[block.key] ?? "";
              const value = values[block.key] ?? defaultText;
              const titleLike = isTitleLike(block, ord);

              return (
                <div
                  key={block.key}
                  style={style}
                  className={clsx(
                    "absolute overflow-hidden bg-transparent",
                    selected
                      ? "ring-2 ring-thu"
                      : "hover:ring-1 hover:ring-thu/35"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSlot(block.key);
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-0 z-[1] h-3 cursor-move"
                    onPointerDown={(e) => startDrag(e, block.key, "move", block)}
                  />
                  <textarea
                    value={value}
                    onFocus={() => onSelectSlot(block.key)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onFieldChange(block.key, e.target.value)}
                    placeholder={m.textValuePlaceholder}
                    className={clsx(
                      "h-full w-full resize-none bg-transparent px-1.5 py-2 text-slate-800 outline-none",
                      titleLike
                        ? "text-lg font-semibold leading-tight md:text-2xl"
                        : "text-xs leading-relaxed md:text-sm"
                    )}
                  />
                  {selected && (
                    <ResizeHandles
                      onPointerDown={(e, handle) => startDrag(e, block.key, handle, block)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-[#9aa1ad]">{hint}</p>
    </div>
  );
}

function ResizeHandles({
  onPointerDown,
}: {
  onPointerDown: (e: ReactPointerEvent, handle: Exclude<Handle, "move">) => void;
}) {
  const corners: { handle: Exclude<Handle, "move">; className: string; cursor: string }[] = [
    { handle: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
    { handle: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
    { handle: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
    { handle: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  ];
  return (
    <>
      {corners.map((c) => (
        <span
          key={c.handle}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown(e, c.handle);
          }}
          className={clsx(
            "absolute z-30 h-3 w-3 rounded-[2px] border-2 border-white bg-thu shadow",
            c.className
          )}
          style={{ cursor: c.cursor }}
        />
      ))}
    </>
  );
}
