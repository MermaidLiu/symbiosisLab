"use client";

import clsx from "clsx";
import { Instrument } from "@/types";
import { useLocale } from "@/components/providers/LocaleProvider";

const statusColors: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-tsinghua-yellow-light text-amber-800 border-tsinghua-yellow",
  retired: "bg-gray-100 text-gray-600 border-gray-200",
};

export function InstrumentStatusBadge({ instrument }: { instrument: Instrument }) {
  const { t, locale } = useLocale();
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";
  const label = t.status[instrument.status];
  const showTip = instrument.status === "maintenance";

  const tipParts: string[] = [];
  if (instrument.maintenanceUntil) {
    tipParts.push(
      t.instruments.maintenanceEta.replace(
        "{time}",
        new Date(instrument.maintenanceUntil).toLocaleString(localeStr, {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      )
    );
  }
  if (instrument.maintenanceNote?.trim()) {
    tipParts.push(instrument.maintenanceNote.trim());
  }
  const repair = instrument.contacts?.find((c) => c.step === "repair");
  if (repair?.name) {
    tipParts.push(`${repair.name}${repair.phone ? ` · ${repair.phone}` : ""}`);
  }

  return (
    <span className="relative inline-flex group">
      <span
        className={clsx(
          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          statusColors[instrument.status] ?? "bg-gray-100 text-gray-600",
          showTip && "cursor-help"
        )}
      >
        {label}
      </span>
      {showTip && tipParts.length > 0 && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-[#E0D4E8] bg-white px-2.5 py-1.5 text-[11px] font-normal normal-case tracking-normal text-lab-text shadow-md group-hover:block"
        >
          {tipParts.map((line) => (
            <span key={line} className="block leading-snug">
              {line}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
