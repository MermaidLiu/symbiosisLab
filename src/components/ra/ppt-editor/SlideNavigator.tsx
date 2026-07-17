"use client";

import clsx from "clsx";
import { useLocale } from "@/components/providers/LocaleProvider";
import { PptTemplateSlide } from "@/types";

interface SlideNavigatorProps {
  slides: PptTemplateSlide[];
  currentPage: number;
  onSelect: (index: number) => void;
}

/** Beautiful.ai-style left slide thumbnail rail */
export function SlideNavigator({ slides, currentPage, onSelect }: SlideNavigatorProps) {
  const { t } = useLocale();
  const m = t.ra.pptEditor;

  return (
    <nav className="flex h-full w-[132px] shrink-0 flex-col border-r border-[#e6e8ec] bg-[#fafbfc]">
      <div className="border-b border-[#e6e8ec] px-3 py-2.5">
        <p className="text-[11px] font-semibold tracking-wide text-[#5c6370]">{m.slideNavigator}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2.5 py-3">
        {slides.map((slide, index) => {
          const selected = currentPage === index;
          const blockCount = (slide.blocks?.length || 0) || (slide.textKeys?.length || 0) + (slide.imageKeys?.length || 0);
          return (
            <button
              key={slide.index}
              type="button"
              onClick={() => onSelect(index)}
              className={clsx(
                "group w-full text-left transition-all",
                selected ? "opacity-100" : "opacity-80 hover:opacity-100"
              )}
            >
              <div
                className={clsx(
                  "relative aspect-video w-full overflow-hidden rounded-md border-2 bg-white shadow-sm transition-all",
                  selected
                    ? "border-thu shadow-[0_0_0_1px_rgba(102,8,116,0.25)]"
                    : "border-transparent ring-1 ring-[#e6e8ec] group-hover:ring-[#c5c9d2]"
                )}
              >
                {/* Mini layout preview */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#f8f7fc] to-[#fff]">
                  {(slide.blocks ?? []).slice(0, 6).map((b) => (
                    <div
                      key={b.key}
                      className={clsx(
                        "absolute rounded-[1px]",
                        b.kind === "image" ? "bg-[#dfe3ea]" : "bg-[#ece8f8]"
                      )}
                      style={{
                        left: `${b.x * 100}%`,
                        top: `${b.y * 100}%`,
                        width: `${Math.max(b.w, 0.08) * 100}%`,
                        height: `${Math.max(b.h, 0.05) * 100}%`,
                      }}
                    />
                  ))}
                  {!slide.blocks?.length && (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-[8px] text-[#a0a6b2]">{blockCount || "—"}</span>
                    </div>
                  )}
                </div>
                <span className="absolute bottom-0.5 left-1 rounded bg-black/45 px-1 text-[8px] font-medium text-white">
                  {index + 1}
                </span>
              </div>
              <p
                className={clsx(
                  "mt-1 truncate px-0.5 text-[10px]",
                  selected ? "font-semibold text-thu" : "text-[#7a8190]"
                )}
              >
                {m.pageLabel.replace("{n}", String(index + 1))}
              </p>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
