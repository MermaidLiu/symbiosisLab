"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentSelect } from "@/components/fluent/FluentField";
import { useLocale } from "@/components/providers/LocaleProvider";
import { api } from "@/lib/api/client";
import { getCages, setCachePartial } from "@/lib/storage/db";
import { Cage, CageStatus } from "@/types/animal-management";

const STATUS_COLORS: Record<CageStatus, string> = {
  unavailable: "bg-gray-500 border-gray-600",
  selected: "bg-[#FA8072] border-[#e86b5f]",
  vacant: "bg-emerald-500 border-emerald-600",
  male_confirmed: "bg-sky-500 border-sky-600",
  female_confirmed: "bg-pink-400 border-pink-500",
  breeding: "bg-amber-500 border-amber-600",
  unidentified: "bg-purple-500 border-purple-600",
};

export function CageManagement() {
  const { t } = useLocale();
  const c = t.animalMgmt.cages;

  const [cages, setCages] = useState<Cage[]>([]);
  const [strainFilter, setStrainFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showInfo, setShowInfo] = useState(true);
  const [showQty, setShowQty] = useState(true);
  const [showTag, setShowTag] = useState(true);
  const [showHealth, setShowHealth] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { cages: list } = await api.cages();
        setCachePartial({ cages: list });
        setCages(list);
      } catch {
        setCages(getCages());
      }
    })();
  }, []);

  const legend: { status: CageStatus; label: string; color: string }[] = [
    { status: "unavailable", label: c.unavailable, color: STATUS_COLORS.unavailable },
    { status: "selected", label: c.selected, color: STATUS_COLORS.selected },
    { status: "vacant", label: c.vacant, color: STATUS_COLORS.vacant },
    { status: "male_confirmed", label: c.maleConfirmed, color: STATUS_COLORS.male_confirmed },
    { status: "female_confirmed", label: c.femaleConfirmed, color: STATUS_COLORS.female_confirmed },
    { status: "breeding", label: c.statusBreeding, color: STATUS_COLORS.breeding },
    { status: "unidentified", label: c.unidentified, color: STATUS_COLORS.unidentified },
  ];

  const filtered = useMemo(() => {
    let rows = [...cages];
    if (strainFilter) rows = rows.filter((r) => r.strain === strainFilter);
    if (typeFilter) rows = rows.filter((r) => r.cageType === typeFilter);
    return rows;
  }, [cages, strainFilter, typeFilter]);

  const racks = useMemo(() => {
    const map = new Map<string, Cage[]>();
    filtered.forEach((cage) => {
      const list = map.get(cage.rack) ?? [];
      list.push(cage);
      map.set(cage.rack, list);
    });
    return map;
  }, [filtered]);

  const strains = [...new Set(cages.map((x) => x.strain).filter((s) => s !== "—"))];

  return (
    <>
      <PageHeader title={c.title} />
      <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 md:p-6">
        <GlassPanel className="mb-4">
          <div className="flex flex-wrap items-end gap-4">
            <FluentSelect label={c.strain} value={strainFilter} onChange={(e) => setStrainFilter(e.target.value)} className="min-w-[140px]">
              <option value="">{t.common.all}</option>
              {strains.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FluentSelect>
            <FluentSelect label={c.cageType} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[140px]">
              <option value="">{t.common.all}</option>
              <option value="standard">{c.standard}</option>
              <option value="breeding">{c.breedingCage}</option>
            </FluentSelect>
            <div className="flex flex-wrap gap-3 pb-1">
              {[
                { key: "info", label: c.showAnimalInfo, checked: showInfo, set: setShowInfo },
                { key: "qty", label: c.showQuantity, checked: showQty, set: setShowQty },
                { key: "tag", label: c.showUserTag, checked: showTag, set: setShowTag },
                { key: "health", label: c.showHealth, checked: showHealth, set: setShowHealth },
              ].map((item) => (
                <label key={item.key} className="flex cursor-pointer items-center gap-1.5 text-xs text-lab-text">
                  <input type="checkbox" checked={item.checked} onChange={(e) => item.set(e.target.checked)} className="accent-thu rounded" />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="mb-4">
          <p className="mb-2 text-xs font-semibold text-lab-muted">{c.legend}</p>
          <div className="flex flex-wrap gap-2">
            {legend.map((item) => (
              <span
                key={item.status}
                className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium text-white shadow-sm", item.color)}
              >
                {item.label}
              </span>
            ))}
          </div>
        </GlassPanel>

        {filtered.length === 0 ? (
          <GlassPanel className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-lab-muted">{c.noCages}</p>
          </GlassPanel>
        ) : (
          <div className="space-y-6">
            {[...racks.entries()].map(([rack, rackCages]) => (
              <GlassPanel key={rack}>
                <h3 className="mb-3 text-sm font-semibold text-thu">{rack}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {rackCages.map((cage) => (
                    <div
                      key={cage.id}
                      className={clsx(
                        "fluent-cage-card group cursor-pointer rounded-xl border-2 p-3 transition-all hover:scale-[1.02] hover:shadow-fluent-lg",
                        STATUS_COLORS[cage.status],
                        "text-white"
                      )}
                    >
                      <p className="text-sm font-bold">{cage.number}</p>
                      {showQty && (
                        <p className="mt-1 text-xs opacity-90">
                          {cage.occupied}/{cage.capacity}
                        </p>
                      )}
                      {showInfo && cage.strain !== "—" && (
                        <p className="mt-1 truncate text-[10px] opacity-80">{cage.strain}</p>
                      )}
                      {showTag && cage.userTag && (
                        <p className="mt-0.5 truncate text-[10px] opacity-75">{cage.userTag}</p>
                      )}
                      {showHealth && cage.healthStatus && (
                        <p className="mt-0.5 text-[10px] opacity-75">{cage.healthStatus}</p>
                      )}
                    </div>
                  ))}
                </div>
              </GlassPanel>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
