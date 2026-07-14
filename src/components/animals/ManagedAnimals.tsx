"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentSelect, FluentInput, FluentRadioGroup } from "@/components/fluent/FluentField";
import { FluentModal } from "@/components/fluent/FluentModal";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useAnimalCart } from "@/context/AnimalCartContext";
import { canManageAnimals } from "@/lib/roles";
import { exportToCsv } from "@/lib/export";
import { api } from "@/lib/api/client";
import { getManagedAnimals, setCachePartial } from "@/lib/storage/db";
import {
  ManagedAnimal,
  AnimalFilterState,
  GenotypeStatusFilter,
} from "@/types/animal-management";

const EMPTY_FILTER: AnimalFilterState = {
  strain: "",
  genotype: "",
  strainType: "",
  gender: "",
  status: "",
  generation: "",
  weaningStatus: "",
  genotypeStatus: "all",
  animalId: "",
};

const COLUMN_KEYS = [
  "id",
  "gender",
  "strain",
  "genotype",
  "sireId",
  "sireGenotype",
  "damId",
  "damGenotype",
  "birthDate",
  "ageWeeks",
  "cageLocation",
  "status",
] as const;

type ColumnKey = (typeof COLUMN_KEYS)[number];
type SortKey = ColumnKey;

export function ManagedAnimals() {
  const { t } = useLocale();
  const m = t.animalMgmt.managed;
  const { user } = useAuth();
  const { addItems } = useAnimalCart();
  const canExport = user ? canManageAnimals(user.roles) : false;

  const [filters, setFilters] = useState<AnimalFilterState>(EMPTY_FILTER);
  const [applied, setApplied] = useState<AnimalFilterState>(EMPTY_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortAsc, setSortAsc] = useState(true);
  const [toast, setToast] = useState("");
  const [displayMode, setDisplayMode] = useState<"list" | "grid">("list");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => new Set(COLUMN_KEYS));
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [viewAnimal, setViewAnimal] = useState<ManagedAnimal | null>(null);
  const [animals, setAnimals] = useState<ManagedAnimal[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { managedAnimals } = await api.managedAnimals();
        setCachePartial({ managedAnimals });
        setAnimals(managedAnimals);
      } catch {
        setAnimals(getManagedAnimals());
      }
    })();
  }, []);

  const columnLabels: Record<ColumnKey, string> = {
    id: m.colId,
    gender: m.colGender,
    strain: m.colStrain,
    genotype: m.colGenotype,
    sireId: m.colSireId,
    sireGenotype: m.colSireGeno,
    damId: m.colDamId,
    damGenotype: m.colDamGeno,
    birthDate: m.colBirth,
    ageWeeks: m.colAge,
    cageLocation: m.colCage,
    status: m.colStatus,
  };

  const strains = useMemo(
    () => [...new Set(animals.map((a) => a.strain))],
    [animals]
  );
  const genotypes = useMemo(
    () => [...new Set(animals.map((a) => a.genotype))],
    [animals]
  );

  const filtered = useMemo(() => {
    let rows = [...animals];
    const f = applied;
    if (f.strain) rows = rows.filter((r) => r.strain === f.strain);
    if (f.genotype) rows = rows.filter((r) => r.genotype === f.genotype);
    if (f.strainType === "contains_public") rows = rows.filter((r) => r.strainType === "public");
    if (f.strainType === "excludes_public") rows = rows.filter((r) => r.strainType === "private");
    if (f.gender === "male") rows = rows.filter((r) => r.gender === "male");
    if (f.gender === "female") rows = rows.filter((r) => r.gender === "female");
    if (f.status) rows = rows.filter((r) => r.status === f.status);
    if (f.generation) rows = rows.filter((r) => r.generation === Number(f.generation));
    if (f.weaningStatus === "weaned") rows = rows.filter((r) => r.weaningStatus === "weaned");
    if (f.weaningStatus === "not_weaned") rows = rows.filter((r) => r.weaningStatus === "not_weaned");
    if (f.genotypeStatus === "identified") rows = rows.filter((r) => r.genotypeStatus === "identified");
    if (f.genotypeStatus === "unidentified") rows = rows.filter((r) => r.genotypeStatus === "unidentified");
    if (f.animalId) rows = rows.filter((r) => r.id.toLowerCase().includes(f.animalId.toLowerCase()));

    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [animals, applied, sortKey, sortAsc]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  function handleBatchCart() {
    if (selected.size === 0) {
      showToast(m.selectRows);
      return;
    }
    addItems([...selected]);
    showToast(m.addedToCart);
  }

  function handleApplyCustody(animal: ManagedAnimal) {
    addItems([animal.id]);
    showToast(m.applySuccess);
    setViewAnimal(null);
  }

  function handleExport() {
    const visible = COLUMN_KEYS.filter((k) => visibleColumns.has(k));
    exportToCsv(
      `managed-animals-${Date.now()}.csv`,
      visible.map((k) => columnLabels[k]),
      filtered.map((row) =>
        visible.map((k) => {
          if (k === "gender") return genderLabel(row.gender);
          if (k === "status") return statusLabel(row.status);
          return String(row[k]);
        })
      )
    );
  }

  function handleRefresh() {
    setApplied({ ...applied });
    showToast(m.refresh);
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function statusLabel(s: ManagedAnimal["status"]) {
    const map = {
      active: m.statusActive,
      breeding: m.statusBreeding,
      quarantine: m.statusQuarantine,
      reserved: m.statusReserved,
      deceased: m.statusDeceased,
    };
    return map[s];
  }

  function genderLabel(g: "male" | "female") {
    return g === "male" ? m.genderMale : m.genderFemale;
  }

  function weaningLabel(w: ManagedAnimal["weaningStatus"]) {
    return w === "weaned" ? m.weaned : m.notWeaned;
  }

  function genotypeStatusLabel(g: ManagedAnimal["genotypeStatus"]) {
    return g === "identified" ? m.genotypeIdentified : m.genotypeUnidentified;
  }

  function strainTypeLabel(s: ManagedAnimal["strainType"]) {
    return s === "public" ? m.containsPublic : m.excludesPublic;
  }

  function cellValue(row: ManagedAnimal, key: ColumnKey): string {
    if (key === "gender") return genderLabel(row.gender);
    if (key === "status") return statusLabel(row.status);
    return String(row[key]);
  }

  const SortTh = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="cursor-pointer whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-lab-muted hover:text-thu"
      onClick={() => toggleSort(col)}
    >
      {label} {sortKey === col ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  const DetailRow = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex gap-2 border-b border-white/30 py-2 text-sm last:border-0">
      <dt className="w-28 shrink-0 text-lab-muted">{label}</dt>
      <dd className="font-medium text-lab-text">{value}</dd>
    </div>
  );

  return (
    <>
      <PageHeader title={m.title} />
      <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 md:p-6">
        <GlassPanel className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <FluentSelect label={m.strain} value={filters.strain} onChange={(e) => setFilters({ ...filters, strain: e.target.value })}>
              <option value="">{t.common.all}</option>
              {strains.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FluentSelect>
            <FluentSelect label={m.genotype} value={filters.genotype} onChange={(e) => setFilters({ ...filters, genotype: e.target.value })}>
              <option value="">{t.common.all}</option>
              {genotypes.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </FluentSelect>
            <FluentSelect label={m.strainType} value={filters.strainType} onChange={(e) => setFilters({ ...filters, strainType: e.target.value })}>
              <option value="">{t.common.all}</option>
              <option value="contains_public">{m.containsPublic}</option>
              <option value="excludes_public">{m.excludesPublic}</option>
            </FluentSelect>
            <FluentSelect label={m.gender} value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
              <option value="">{t.common.all}</option>
              <option value="male">{m.genderMale}</option>
              <option value="female">{m.genderFemale}</option>
            </FluentSelect>
            <FluentSelect label={m.animalStatus} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">{t.common.all}</option>
              <option value="active">{m.statusActive}</option>
              <option value="breeding">{m.statusBreeding}</option>
              <option value="quarantine">{m.statusQuarantine}</option>
              <option value="reserved">{m.statusReserved}</option>
            </FluentSelect>
            <FluentInput
              label={m.generation}
              type="number"
              min={0}
              value={filters.generation}
              onChange={(e) => setFilters({ ...filters, generation: e.target.value })}
            />
            <FluentSelect label={m.weaningStatus} value={filters.weaningStatus} onChange={(e) => setFilters({ ...filters, weaningStatus: e.target.value })}>
              <option value="">{t.common.all}</option>
              <option value="weaned">{m.weaned}</option>
              <option value="not_weaned">{m.notWeaned}</option>
            </FluentSelect>
            <FluentRadioGroup
              label={m.genotypeStatus}
              name="genotypeStatus"
              value={filters.genotypeStatus}
              onChange={(v) => setFilters({ ...filters, genotypeStatus: v as GenotypeStatusFilter })}
              options={[
                { value: "all", label: m.genotypeAll },
                { value: "unidentified", label: m.genotypeUnidentified },
                { value: "identified", label: m.genotypeIdentified },
              ]}
            />
            <FluentInput label={m.animalId} value={filters.animalId} onChange={(e) => setFilters({ ...filters, animalId: e.target.value })} />
          </div>
          <div className="mt-4 flex gap-2">
            <FluentButton onClick={() => setApplied({ ...filters })}>{m.query}</FluentButton>
            <FluentButton variant="outline" onClick={() => { setFilters(EMPTY_FILTER); setApplied(EMPTY_FILTER); }}>
              {m.reset}
            </FluentButton>
          </div>
        </GlassPanel>

        <GlassPanel className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <FluentButton variant="secondary" size="sm">{m.vetCare}</FluentButton>
              <FluentButton variant="secondary" size="sm" onClick={handleBatchCart}>{m.batchCart}</FluentButton>
              <FluentButton variant="outline" size="sm">{m.transfer} ▾</FluentButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FluentSelect className="w-auto min-w-[100px]" value="mice">
                <option value="mice">{m.mice}</option>
              </FluentSelect>
              <div className="fluent-segment flex rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setDisplayMode("list")}
                  className={clsx(
                    "rounded-md px-2 py-1 text-xs transition-colors",
                    displayMode === "list" ? "bg-white/80 text-thu shadow-sm" : "text-lab-muted hover:text-thu"
                  )}
                >
                  {m.list}
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode("grid")}
                  className={clsx(
                    "rounded-md px-2 py-1 text-xs transition-colors",
                    displayMode === "grid" ? "bg-white/80 text-thu shadow-sm" : "text-lab-muted hover:text-thu"
                  )}
                >
                  {m.grid}
                </button>
              </div>
              {canExport && (
                <FluentButton variant="ghost" size="sm" onClick={handleExport}>
                  {m.exportExcel}
                </FluentButton>
              )}
              <FluentButton variant="ghost" size="sm" onClick={handleRefresh}>
                {m.refresh}
              </FluentButton>
              {displayMode === "list" && (
                <FluentButton variant="ghost" size="sm" onClick={() => setColumnModalOpen(true)}>
                  {m.columnSettings}
                </FluentButton>
              )}
            </div>
          </div>
          {toast && <p className="mt-2 text-xs text-thu">{toast}</p>}
        </GlassPanel>

        {displayMode === "list" ? (
          <GlassPanel padding={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b border-white/30 bg-white/30">
                  <tr>
                    <th className="px-3 py-2.5">
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="accent-thu" />
                    </th>
                    {COLUMN_KEYS.filter((k) => visibleColumns.has(k)).map((key) =>
                      key === "sireId" || key === "damId" || key === "sireGenotype" || key === "damGenotype" ? (
                        <th key={key} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase text-lab-muted">
                          {columnLabels[key]}
                        </th>
                      ) : (
                        <SortTh key={key} col={key} label={columnLabels[key]} />
                      )
                    )}
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase text-lab-muted">{m.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-white/20 transition-colors hover:bg-white/40">
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} className="accent-thu" />
                      </td>
                      {COLUMN_KEYS.filter((k) => visibleColumns.has(k)).map((key) => (
                        <td
                          key={key}
                          className={clsx(
                            "px-3 py-2 text-xs",
                            (key === "id" || key === "sireId" || key === "damId") && "font-mono",
                            key === "id" && "text-thu",
                            (key === "sireId" || key === "damId") && "text-[10px] text-lab-muted",
                            (key === "sireGenotype" || key === "damGenotype") && "text-[10px]"
                          )}
                        >
                          {key === "status" ? (
                            <span className="fluent-badge rounded-full px-2 py-0.5 text-[10px]">{statusLabel(row.status)}</span>
                          ) : (
                            cellValue(row, key)
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <FluentButton variant="ghost" size="sm" onClick={() => setViewAnimal(row)}>
                          {m.view}
                        </FluentButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((row) => (
              <GlassPanel key={row.id} className="flex flex-col">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} className="accent-thu" />
                    <span className="font-mono text-sm font-semibold text-thu">{row.id}</span>
                  </label>
                  <span className="fluent-badge rounded-full px-2 py-0.5 text-[10px]">{statusLabel(row.status)}</span>
                </div>
                <dl className="flex-1 space-y-1 text-xs">
                  <div><span className="text-lab-muted">{m.colGender}: </span>{genderLabel(row.gender)}</div>
                  <div><span className="text-lab-muted">{m.colStrain}: </span>{row.strain}</div>
                  <div><span className="text-lab-muted">{m.colGenotype}: </span>{row.genotype}</div>
                  <div><span className="text-lab-muted">{m.colCage}: </span>{row.cageLocation}</div>
                  <div><span className="text-lab-muted">{m.colAge}: </span>{row.ageWeeks}</div>
                </dl>
                <FluentButton variant="ghost" size="sm" className="mt-3 self-start" onClick={() => setViewAnimal(row)}>
                  {m.view}
                </FluentButton>
              </GlassPanel>
            ))}
          </div>
        )}
      </div>

      <FluentModal
        open={columnModalOpen}
        title={m.columnSettingsTitle}
        onClose={() => setColumnModalOpen(false)}
        footer={
          <div className="flex justify-end">
            <FluentButton onClick={() => setColumnModalOpen(false)}>{t.common.save}</FluentButton>
          </div>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {COLUMN_KEYS.map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/40">
              <input
                type="checkbox"
                checked={visibleColumns.has(key)}
                onChange={() => toggleColumn(key)}
                className="accent-thu"
              />
              {columnLabels[key]}
            </label>
          ))}
        </div>
      </FluentModal>

      <FluentModal
        open={!!viewAnimal}
        title={m.viewDetail}
        size="lg"
        onClose={() => setViewAnimal(null)}
        footer={
          viewAnimal ? (
            <div className="flex justify-end gap-2">
              <FluentButton variant="outline" onClick={() => setViewAnimal(null)}>{t.common.cancel}</FluentButton>
              <FluentButton onClick={() => handleApplyCustody(viewAnimal)}>{m.applyCustody}</FluentButton>
            </div>
          ) : undefined
        }
      >
        {viewAnimal && (
          <dl>
            <DetailRow label={m.colId} value={viewAnimal.id} />
            <DetailRow label={m.colGender} value={genderLabel(viewAnimal.gender)} />
            <DetailRow label={m.colStrain} value={viewAnimal.strain} />
            <DetailRow label={m.colGenotype} value={viewAnimal.genotype} />
            <DetailRow label={m.colSireId} value={viewAnimal.sireId} />
            <DetailRow label={m.colSireGeno} value={viewAnimal.sireGenotype} />
            <DetailRow label={m.colDamId} value={viewAnimal.damId} />
            <DetailRow label={m.colDamGeno} value={viewAnimal.damGenotype} />
            <DetailRow label={m.colBirth} value={viewAnimal.birthDate} />
            <DetailRow label={m.colAge} value={viewAnimal.ageWeeks} />
            <DetailRow label={m.colCage} value={viewAnimal.cageLocation} />
            <DetailRow label={m.colStatus} value={statusLabel(viewAnimal.status)} />
            <DetailRow label={m.generationLabel} value={viewAnimal.generation} />
            <DetailRow label={m.weaningLabel} value={weaningLabel(viewAnimal.weaningStatus)} />
            <DetailRow label={m.genotypeStatusLabel} value={genotypeStatusLabel(viewAnimal.genotypeStatus)} />
            <DetailRow label={m.strainTypeLabel} value={strainTypeLabel(viewAnimal.strainType)} />
          </dl>
        )}
      </FluentModal>
    </>
  );
}
