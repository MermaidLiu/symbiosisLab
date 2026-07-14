"use client";

import clsx from "clsx";
import { useState } from "react";
import { useAnimalCart } from "@/context/AnimalCartContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";

export function TemporaryCartFloat() {
  const { t } = useLocale();
  const { items, count, removeItem, clear } = useAnimalCart();
  const [expanded, setExpanded] = useState(false);
  const tc = t.animalMgmt.cart;

  return (
    <div className="fixed bottom-6 left-6 z-40">
      {expanded && count > 0 && (
        <GlassPanel className="mb-3 w-72 max-h-64 overflow-y-auto shadow-fluent-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-thu">{tc.title}</span>
            <FluentButton variant="ghost" size="sm" onClick={clear}>
              {tc.clear}
            </FluentButton>
          </div>
          <ul className="space-y-1">
            {items.map((id) => (
              <li key={id} className="flex items-center justify-between rounded-md bg-white/40 px-2 py-1 text-xs">
                <span className="font-mono text-lab-text">{id}</span>
                <button type="button" onClick={() => removeItem(id)} className="text-red-500 hover:underline">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          "fluent-cart-glow flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-fluent-lg transition-transform hover:scale-105"
        )}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {tc.label}
        {count > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-tsinghua-yellow px-1.5 text-[11px] font-bold text-thu-dark">
            {count}
          </span>
        )}
      </button>
    </div>
  );
}
