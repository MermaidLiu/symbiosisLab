"use client";

import clsx from "clsx";
import { locales, localeLabels } from "@/i18n";
import { Locale } from "@/i18n/types";
import { useLocale } from "@/components/providers/LocaleProvider";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="inline-flex rounded-md border border-lab-border bg-white p-0.5 text-xs">
      {locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => setLocale(loc as Locale)}
          className={clsx(
            "rounded px-2 py-1 font-medium transition-colors",
            locale === loc ? "bg-thu text-white" : "text-lab-muted hover:text-thu"
          )}
        >
          {localeLabels[loc as Locale]}
        </button>
      ))}
    </div>
  );
}
