"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentModal } from "@/components/fluent/FluentModal";
import { FluentSelect } from "@/components/fluent/FluentField";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { canSuperviseAnimalFacility, canManageAnimals, hasRole } from "@/lib/roles";
import { api, PublicUser } from "@/lib/api/client";
import {
  PURPOSE_SWATCH,
  cageFillStyle,
  euthanasiaLabelKey,
  lifecycleStepsFor,
  normalizePurpose,
} from "@/lib/animals/facility-board";
import { TodoList } from "@/components/ra/TodoList";
import {
  AnimalDayActivity,
  AnimalPurpose,
  ANIMAL_PURPOSES,
  FacilityCageCell,
  ManagedAnimal,
  MouseLifecycleStatus,
} from "@/types/animal-management";

type BoardMode = "workbench" | "board";

export function FacilityCageBoard({ mode = "board" }: { mode?: BoardMode }) {
  const { t } = useLocale();
  const f = t.animalMgmt.facilityBoard;
  const { user } = useAuth();
  const allowed = user
    ? canSuperviseAnimalFacility(user.roles) || canManageAnimals(user.roles)
    : false;
  const canOperate = user
    ? hasRole(user.roles, "super_admin") || canSuperviseAnimalFacility(user.roles)
    : false;
  const isWorkbench = mode === "workbench";

  const [cells, setCells] = useState<FacilityCageCell[]>([]);
  const [activities, setActivities] = useState<AnimalDayActivity[]>([]);
  const [staff, setStaff] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<FacilityCageCell | null>(null);
  const [detailMouse, setDetailMouse] = useState<ManagedAnimal | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [calDay, setCalDay] = useState<string | null>(null);
  const [dayLogOpen, setDayLogOpen] = useState(false);
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");
  const [addCageOpen, setAddCageOpen] = useState(false);
  const [newRack, setNewRack] = useState("Rack A");
  const [newNumber, setNewNumber] = useState("");
  const [newCapacity, setNewCapacity] = useState("5");
  const [newStrain, setNewStrain] = useState("C57BL/6J");
  const [newCageType, setNewCageType] = useState<"standard" | "breeding">("standard");
  const [addCageMsg, setAddCageMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const data = await api.facilityBoard();
    setCells(data.cells);
    setActivities(data.activities ?? []);
    setStaff(data.staff ?? []);
    if (selected) {
      const next = data.cells.find((c) => c.cage.id === selected.cage.id) ?? null;
      setSelected(next);
      if (detailMouse && next) {
        setDetailMouse(next.mice.find((m) => m.id === detailMouse.id) ?? null);
      }
    }
  }

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await reload();
        setError("");
      } catch {
        setError(f.loadError);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const racks = useMemo(() => {
    const map = new Map<string, FacilityCageCell[]>();
    for (const cell of cells) {
      const list = map.get(cell.cage.rack) ?? [];
      list.push(cell);
      map.set(cell.cage.rack, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.cage.number.localeCompare(b.cage.number, "en"));
    }
    return map;
  }, [cells]);

  const existingRacks = useMemo(() => {
    const set = new Set<string>();
    for (const c of cells) set.add(c.cage.rack);
    return [...set].sort((a, b) => a.localeCompare(b, "en"));
  }, [cells]);

  const summary = useMemo(() => {
    let mice = 0;
    let claimed = 0;
    const purposes = { blank: 0, signal_processing: 0, immunity: 0, breeding: 0 };
    for (const c of cells) {
      mice += c.mice.length;
      claimed += c.claimedCount;
      for (const p of Object.keys(purposes) as AnimalPurpose[]) {
        purposes[p] += c.purposeCounts[p];
      }
    }
    return { mice, claimed, purposes, cages: cells.length };
  }, [cells]);

  const dayEvents = useMemo(() => {
    if (!calDay) return [];
    return activities
      .filter((a) => a.date === calDay)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [activities, calDay]);

  const activityDates = useMemo(() => new Set(activities.map((a) => a.date)), [activities]);

  const calCells = useMemo(() => buildMonthGrid(calMonth), [calMonth]);

  const claimants = useMemo(
    () => staff.filter((u) => u.roles.includes("user") || u.roles.includes("research_assistant")),
    [staff]
  );
  const technicians = useMemo(
    () =>
      staff.filter(
        (u) =>
          u.roles.includes("animal_manager") ||
          u.roles.includes("animal_facility_supervisor") ||
          u.roles.includes("super_admin")
      ),
    [staff]
  );

  function purposeLabel(p: AnimalPurpose | "mixed" | "empty") {
    if (p === "empty") return f.purposeEmpty;
    if (p === "mixed") return f.purposeMixed;
    if (p === "signal_processing") return f.purposeSignal;
    if (p === "immunity") return f.purposeImmunity;
    if (p === "breeding") return f.purposeBreeding;
    return f.purposeBlank;
  }

  function lifecycleLabel(s?: MouseLifecycleStatus) {
    const map: Record<MouseLifecycleStatus, string> = {
      entered: f.lifeEntered,
      electrode_implant: f.lifeElectrode,
      signal_recording: f.lifeRecording,
      observing: f.lifeObserving,
      euthanasia: f.lifeEuthanasia,
    };
    return s ? map[s] : "—";
  }

  function euthanasiaLabel(mouse: ManagedAnimal) {
    const key = euthanasiaLabelKey(mouse.euthanasiaMethod) as keyof typeof f;
    return (f[key] as string) ?? f.euthanasiaUnset;
  }

  async function patchMouse(id: string, data: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await api.updateManagedAnimal(id, data);
      setCells(res.cells);
      setActivities(res.activities ?? []);
      if (selected) {
        const next = res.cells.find((c) => c.cage.id === selected.cage.id) ?? null;
        setSelected(next);
        if (detailMouse) {
          setDetailMouse(res.animal.id === detailMouse.id ? res.animal : next?.mice.find((m) => m.id === detailMouse.id) ?? null);
        }
      }
      setEditingField(null);
    } finally {
      setSaving(false);
    }
  }

  async function submitUpload() {
    setUploadMsg("");
    setSaving(true);
    try {
      const res = await api.batchUploadManagedAnimals({ csv: csvText });
      if (res.created) {
        setCells(res.cells);
        setActivities(res.activities ?? []);
        setUploadMsg(f.uploadOk.replace("{n}", String(res.created)));
        setCsvText("");
      } else {
        setUploadMsg(res.errors.join("；") || f.uploadFail);
      }
    } catch {
      setUploadMsg(f.uploadFail);
    } finally {
      setSaving(false);
    }
  }

  async function submitAddCage() {
    setAddCageMsg("");
    const number = newNumber.trim();
    if (!number) return;
    setSaving(true);
    try {
      const res = await api.createCage({
        number,
        rack: newRack.trim() || "Rack A",
        capacity: Number(newCapacity) || 5,
        strain: newStrain.trim() || "—",
        cageType: newCageType,
      });
      setCells(res.cells);
      setAddCageMsg(f.addCageOk.replace("{n}", res.cage.number));
      setNewNumber("");
      setAddCageOpen(false);
    } catch (err) {
      const code = (err as { code?: string; message?: string })?.code
        ?? (err as Error)?.message
        ?? "";
      setAddCageMsg(code.includes("duplicate") ? f.addCageDuplicate : f.addCageFail);
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <PageHeader title={isWorkbench ? t.dashboard.title : f.title} />
        <div className="fluent-mica-bg flex-1 p-6 text-sm text-lab-muted">{f.forbidden}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={isWorkbench ? t.dashboard.title : f.title}
        subtitle={isWorkbench ? f.workbenchSubtitle : f.subtitle}
        action={
          canOperate ? (
            <div className="flex items-center gap-2">
              <FluentButton
                size="sm"
                onClick={() => {
                  setAddCageMsg("");
                  setAddCageOpen(true);
                }}
              >
                {f.addCage}
              </FluentButton>
              <FluentButton size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                {f.batchUpload}
              </FluentButton>
            </div>
          ) : undefined
        }
      />
      <div className="fluent-mica-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6">
        {isWorkbench && (
          <div className="mb-5 space-y-4">
            <GlassPanel padding={false} className="overflow-hidden">
              <div className="border-b border-white/40 bg-white/35 px-4 py-2.5">
                <p className="text-xs text-lab-muted">{f.hint}</p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-white/30 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label={f.statCages} value={summary.cages} />
                <Stat label={f.statMice} value={summary.mice} />
                <Stat label={f.statClaimed} value={summary.claimed} />
                <Stat label={f.purposeSignal} value={summary.purposes.signal_processing} accent="text-[#5BA4E8]" />
                <Stat label={f.purposeImmunity} value={summary.purposes.immunity} accent="text-[#82318E]" />
                <Stat label={f.purposeBreeding} value={summary.purposes.breeding} accent="text-[#F5A623]" />
              </div>
            </GlassPanel>

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <TodoList compact />

              <GlassPanel>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-thu">{f.calendar}</p>
                  <div className="flex items-center gap-1">
                    <FluentButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const d = new Date();
                        setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      }}
                    >
                      {f.calendarToday}
                    </FluentButton>
                    <FluentButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                    >
                      ‹
                    </FluentButton>
                    <FluentButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                    >
                      ›
                    </FluentButton>
                  </div>
                </div>
                <p className="mb-2 text-center text-xs font-medium text-lab-text">
                  {calMonth.getFullYear()}-{String(calMonth.getMonth() + 1).padStart(2, "0")}
                </p>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-lab-muted">
                  {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                    <div key={d} className="py-1 font-medium">
                      {d}
                    </div>
                  ))}
                  {calCells.map((cell, i) =>
                    cell ? (
                      <button
                        key={cell}
                        type="button"
                        onClick={() => {
                          setCalDay(cell);
                          setDayLogOpen(true);
                        }}
                        className={clsx(
                          "relative flex flex-col items-center rounded-md px-0.5 pb-1 pt-0.5 text-[11px] transition hover:bg-thu/10",
                          cell === todayStr && "font-semibold text-thu"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex h-7 w-7 items-center justify-center rounded-full",
                            cell === todayStr && "bg-thu/10 ring-2 ring-thu"
                          )}
                        >
                          {Number(cell.slice(-2))}
                        </span>
                        <span
                          className={clsx(
                            "mt-0.5 h-1.5 w-1.5 rounded-full",
                            activityDates.has(cell) ? "bg-thu" : "bg-transparent"
                          )}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      <div key={`e-${i}`} className="h-9" />
                    )
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-lab-muted">{f.calendarHint}</p>
              </GlassPanel>
            </div>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-xs font-semibold text-lab-muted">{f.legend}</p>
          <div className="flex flex-wrap gap-1.5">
            {(["blank", "signal_processing", "immunity", "breeding", "mixed", "empty"] as const).map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E0D4E8] bg-white/80 px-2 py-1 text-[11px] font-medium text-[#323130]"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: PURPOSE_SWATCH[p] }}
                />
                {purposeLabel(p)}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <GlassPanel>
            <p className="text-sm text-lab-muted">{t.common.loading}</p>
          </GlassPanel>
        ) : error ? (
          <GlassPanel>
            <p className="text-sm text-red-600">{error}</p>
          </GlassPanel>
        ) : (
          <div className="space-y-6">
            {[...racks.entries()].map(([rack, rackCells]) => (
              <GlassPanel key={rack} padding={false} className="overflow-hidden">
                <div className="border-b border-white/30 bg-white/40 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-thu">{rack}</h2>
                </div>
                <div className="overflow-x-auto p-3">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr>
                        {rackCells.map((cell) => (
                          <th
                            key={cell.cage.id}
                            className="border border-[#C8C6C4] bg-[#F3F2F1] px-2 py-1.5 text-center text-[11px] font-semibold text-[#323130]"
                          >
                            {cell.cage.number}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {rackCells.map((cell) => (
                          <td key={cell.cage.id} className="border border-[#C8C6C4] p-1 align-top">
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(cell);
                                setDetailMouse(null);
                                setEditMode(false);
                                setEditingField(null);
                              }}
                              style={cageFillStyle(cell.dominantPurpose)}
                              className={clsx(
                                "flex min-h-[118px] w-full flex-col rounded-md border-2 px-2 py-2 text-left shadow-sm transition hover:brightness-110",
                                selected?.cage.id === cell.cage.id && "ring-2 ring-offset-1 ring-[#323130]"
                              )}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="text-xs font-bold">{cell.cage.number}</span>
                                <span className="text-[10px] opacity-90">
                                  {cell.mice.length}/{cell.cage.capacity}
                                </span>
                              </div>
                              {cell.mice.length === 0 ? (
                                <p className="mt-3 text-[10px] opacity-80">{f.emptyCage}</p>
                              ) : (
                                <>
                                  <p className="mt-1 text-[11px] font-semibold">{purposeLabel(cell.dominantPurpose)}</p>
                                  <p className="mt-0.5 text-[10px] opacity-95">
                                    {f.claimedShort.replace("{n}", String(cell.claimedCount))}
                                  </p>
                                  <div className="mt-1 flex flex-wrap gap-0.5">
                                    {(["signal_processing", "immunity", "breeding", "blank"] as AnimalPurpose[]).map(
                                      (p) =>
                                        cell.purposeCounts[p] > 0 ? (
                                          <span
                                            key={p}
                                            className="rounded bg-black/15 px-1 text-[9px] font-medium"
                                          >
                                            {purposeLabel(p).replace("鼠", "")}
                                            {cell.purposeCounts[p]}
                                          </span>
                                        ) : null
                                    )}
                                  </div>
                                  <p className="mt-auto pt-1 text-[9px] opacity-90">
                                    {cell.cage.technicianName ?? "—"}
                                  </p>
                                </>
                              )}
                            </button>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </GlassPanel>
            ))}
          </div>
        )}
      </div>

      <FluentModal
        open={dayLogOpen && !!calDay}
        title={calDay ? f.dayLogTitle.replace("{d}", calDay) : f.calendar}
        size="lg"
        onClose={() => setDayLogOpen(false)}
        footer={
          <div className="flex justify-end">
            <FluentButton variant="outline" onClick={() => setDayLogOpen(false)}>
              {f.dayLogClose}
            </FluentButton>
          </div>
        }
      >
        {dayEvents.length === 0 ? (
          <p className="text-sm text-lab-muted">{f.noDayEvents}</p>
        ) : (
          <ol className="relative space-y-0 border-l-2 border-thu/25 pl-4">
            {dayEvents.map((ev) => (
              <li key={ev.id} className="relative pb-4 last:pb-0">
                <span className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-thu" />
                <div className="rounded-lg border border-white/50 bg-white/50 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <time className="text-xs font-semibold text-thu">
                      {new Date(ev.timestamp).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </time>
                    <span className="text-[11px] text-lab-muted">
                      {f.dayLogActor} · {ev.userName}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-lab-text">{ev.details}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-lab-muted">
                    {ev.animalId && (
                      <span className="rounded bg-thu/10 px-1.5 py-0.5 text-thu">
                        {f.dayLogAnimal} {ev.animalId}
                      </span>
                    )}
                    {ev.cageId && (
                      <span className="rounded bg-black/5 px-1.5 py-0.5">
                        {f.dayLogCage}{" "}
                        {cells.find((c) => c.cage.id === ev.cageId)?.cage.number ?? ev.cageId}
                      </span>
                    )}
                    {ev.action && (
                      <span className="rounded bg-black/5 px-1.5 py-0.5">{ev.action}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </FluentModal>

      <FluentModal
        open={!!selected}
        title={selected ? `${selected.cage.rack} · ${selected.cage.number}` : f.cageDetail}
        size="lg"
        onClose={() => {
          setSelected(null);
          setDetailMouse(null);
          setEditMode(false);
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {canOperate && (
              <FluentButton
                variant={editMode ? "primary" : "secondary"}
                onClick={() => {
                  setEditMode((v) => !v);
                  setEditingField(null);
                }}
              >
                {editMode ? f.editDone : f.operate}
              </FluentButton>
            )}
            <FluentButton variant="outline" onClick={() => setSelected(null)}>
              {t.common.close}
            </FluentButton>
          </div>
        }
      >
        {selected && (
          <div className="space-y-4">
            {editMode && (
              <p className="rounded-lg bg-[#FFF4CE] px-3 py-2 text-xs text-[#835C00]">{f.editHint}</p>
            )}
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <Info label={f.colTech} value={selected.cage.technicianName ?? "—"} />
              <Info label={f.colOccupancy} value={`${selected.mice.length} / ${selected.cage.capacity}`} />
              <Info label={f.colClaimed} value={String(selected.claimedCount)} />
              <Info label={f.colPurposeMix} value={purposeLabel(selected.dominantPurpose)} />
            </div>

            {selected.mice.length === 0 ? (
              <p className="text-sm text-lab-muted">{f.emptyCage}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/40">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-white/40 text-[10px] uppercase text-lab-muted">
                    <tr>
                      <th className="px-2 py-2">{f.colId}</th>
                      <th className="px-2 py-2">{f.colPurpose}</th>
                      <th className="px-2 py-2">{f.colLifecycle}</th>
                      <th className="px-2 py-2">{f.colClaimant}</th>
                      <th className="px-2 py-2">{f.colTech}</th>
                      <th className="px-2 py-2">{f.colActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.mice.map((m) => (
                      <tr key={m.id} className="border-t border-white/30">
                        <td className="px-2 py-2 font-mono text-thu">{m.id}</td>
                        <td
                          className="px-2 py-2"
                          onDoubleClick={() => editMode && setEditingField(`${m.id}:purpose`)}
                        >
                          {editMode && editingField === `${m.id}:purpose` ? (
                            <select
                              className="fluent-input rounded px-1 py-0.5 text-xs"
                              value={normalizePurpose(m.purpose)}
                              disabled={saving}
                              onChange={(e) => void patchMouse(m.id, { purpose: e.target.value })}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                            >
                              {ANIMAL_PURPOSES.map((p) => (
                                <option key={p} value={p}>
                                  {purposeLabel(p)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={editMode ? "cursor-text underline decoration-dotted" : undefined}>
                              {purposeLabel(normalizePurpose(m.purpose))}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-2 py-2"
                          onDoubleClick={() => editMode && setEditingField(`${m.id}:life`)}
                        >
                          {editMode && editingField === `${m.id}:life` ? (
                            <select
                              className="fluent-input rounded px-1 py-0.5 text-xs"
                              value={m.lifecycleStatus ?? "entered"}
                              disabled={saving}
                              onChange={(e) => void patchMouse(m.id, { lifecycleStatus: e.target.value })}
                              onBlur={() => setEditingField(null)}
                              autoFocus
                            >
                              {lifecycleStepsFor(m.purpose).map((s) => (
                                <option key={s} value={s}>
                                  {lifecycleLabel(s)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={editMode ? "cursor-text underline decoration-dotted" : undefined}>
                              {lifecycleLabel(m.lifecycleStatus)}
                              {m.lifecycleStatus === "euthanasia" && (
                                <span className="ml-1 text-lab-muted">({euthanasiaLabel(m)})</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-2 py-2"
                          onDoubleClick={() => editMode && setEditingField(`${m.id}:claimant`)}
                        >
                          {editMode && editingField === `${m.id}:claimant` ? (
                            <select
                              className="fluent-input rounded px-1 py-0.5 text-xs"
                              value={m.claimantUserId ?? "unassigned"}
                              disabled={saving}
                              onChange={(e) =>
                                void patchMouse(m.id, { claimantUserId: e.target.value })
                              }
                              onBlur={() => setEditingField(null)}
                              autoFocus
                            >
                              <option value="unassigned">{f.unassigned}</option>
                              {claimants.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={editMode ? "cursor-text underline decoration-dotted" : undefined}>
                              {normalizePurpose(m.purpose) === "blank"
                                ? f.noClaimant
                                : m.claimantName ?? f.unassigned}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-2 py-2"
                          onDoubleClick={() => editMode && setEditingField(`${m.id}:tech`)}
                        >
                          {editMode && editingField === `${m.id}:tech` ? (
                            <select
                              className="fluent-input rounded px-1 py-0.5 text-xs"
                              value={m.technicianUserId ?? "unassigned"}
                              disabled={saving}
                              onChange={(e) =>
                                void patchMouse(m.id, { technicianUserId: e.target.value })
                              }
                              onBlur={() => setEditingField(null)}
                              autoFocus
                            >
                              <option value="unassigned">{f.unassigned}</option>
                              {technicians.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={editMode ? "cursor-text underline decoration-dotted" : undefined}>
                              {m.technicianName ?? selected.cage.technicianName ?? f.unassigned}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <FluentButton variant="ghost" size="sm" onClick={() => setDetailMouse(m)}>
                            {f.viewMouse}
                          </FluentButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </FluentModal>

      <FluentModal
        open={!!detailMouse}
        title={detailMouse?.id ?? f.mouseDetail}
        onClose={() => setDetailMouse(null)}
        footer={
          <div className="flex justify-end">
            <FluentButton variant="outline" onClick={() => setDetailMouse(null)}>
              {t.common.close}
            </FluentButton>
          </div>
        }
      >
        {detailMouse && (
          <div className="space-y-3 text-sm">
            <Info label={f.colPurpose} value={purposeLabel(normalizePurpose(detailMouse.purpose))} />
            <Info label={f.colLifecycle} value={lifecycleLabel(detailMouse.lifecycleStatus)} />
            <div>
              <p className="mb-1 text-[11px] font-medium text-lab-muted">{f.lifecyclePath}</p>
              <ol className="flex flex-wrap gap-1.5">
                {lifecycleStepsFor(detailMouse.purpose).map((step) => (
                  <li
                    key={step}
                    className={clsx(
                      "rounded-full border px-2 py-0.5 text-[10px]",
                      detailMouse.lifecycleStatus === step
                        ? "border-thu bg-thu/10 font-semibold text-thu"
                        : "border-white/50 bg-white/40 text-lab-muted"
                    )}
                  >
                    {lifecycleLabel(step)}
                  </li>
                ))}
              </ol>
            </div>
            {detailMouse.lifecycleStatus === "euthanasia" && (
              <Info label={f.colEuthanasia} value={euthanasiaLabel(detailMouse)} />
            )}
            <Info
              label={f.colClaimant}
              value={
                normalizePurpose(detailMouse.purpose) === "blank"
                  ? f.noClaimant
                  : detailMouse.claimantName ?? f.unassigned
              }
            />
            <Info label={f.colTech} value={detailMouse.technicianName ?? "—"} />
            <Info label={f.colStrain} value={detailMouse.strain} />
            <Info
              label={f.colGender}
              value={detailMouse.gender === "male" ? f.genderMale : f.genderFemale}
            />
            <Info label={f.colAge} value={String(detailMouse.ageWeeks)} />
          </div>
        )}
      </FluentModal>

      <FluentModal
        open={uploadOpen}
        title={f.batchUpload}
        size="lg"
        onClose={() => setUploadOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setUploadOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={saving || !csvText.trim()} onClick={() => void submitUpload()}>
              {f.uploadSubmit}
            </FluentButton>
          </div>
        }
      >
        <p className="mb-2 text-xs text-lab-muted">{f.uploadHint}</p>
        <pre className="mb-3 overflow-x-auto rounded-lg bg-white/50 p-2 text-[10px] text-lab-muted">
          {f.uploadTemplate}
        </pre>
        <textarea
          className="fluent-input min-h-[160px] w-full rounded-lg px-3 py-2 font-mono text-xs shadow-sm"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={f.uploadPlaceholder}
        />
        {uploadMsg && <p className="mt-2 text-xs text-thu">{uploadMsg}</p>}
      </FluentModal>

      <FluentModal
        open={addCageOpen}
        title={f.addCage}
        onClose={() => setAddCageOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setAddCageOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton
              disabled={saving || !newNumber.trim()}
              onClick={() => void submitAddCage()}
            >
              {f.addCageSubmit}
            </FluentButton>
          </div>
        }
      >
        <p className="mb-3 text-xs text-lab-muted">{f.addCageHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block text-lab-muted">{f.fieldRack}</span>
            <input
              list="facility-rack-options"
              className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
              value={newRack}
              onChange={(e) => setNewRack(e.target.value)}
              placeholder={f.rackPlaceholder}
            />
            <datalist id="facility-rack-options">
              {existingRacks.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-lab-muted">{f.fieldNumber}</span>
            <input
              className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder={f.numberPlaceholder}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-lab-muted">{f.fieldCapacity}</span>
            <input
              type="number"
              min={1}
              className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
              value={newCapacity}
              onChange={(e) => setNewCapacity(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-lab-muted">{f.fieldCageType}</span>
            <FluentSelect
              value={newCageType}
              onChange={(e) => setNewCageType(e.target.value as "standard" | "breeding")}
            >
              <option value="standard">{t.animalMgmt.cages.standard}</option>
              <option value="breeding">{t.animalMgmt.cages.breedingCage}</option>
            </FluentSelect>
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="mb-1 block text-lab-muted">{f.fieldStrain}</span>
            <input
              className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
              value={newStrain}
              onChange={(e) => setNewStrain(e.target.value)}
            />
          </label>
        </div>
        {addCageMsg && <p className="mt-2 text-xs text-thu">{addCageMsg}</p>}
      </FluentModal>
    </div>
  );
}

function buildMonthGrid(monthStart: Date): (string | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startPad = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="bg-white/55 px-3 py-3 text-center sm:text-left">
      <p className="text-[10px] text-lab-muted">{label}</p>
      <p className={clsx("mt-0.5 text-xl font-semibold tabular-nums", accent ?? "text-thu")}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 border-b border-white/30 py-1.5 last:border-0">
      <dt className="w-28 shrink-0 text-[11px] text-lab-muted">{label}</dt>
      <dd className="font-medium text-lab-text">{value}</dd>
    </div>
  );
}
