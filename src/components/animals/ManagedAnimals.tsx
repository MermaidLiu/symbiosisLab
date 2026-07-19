"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentSelect, FluentInput, FluentRadioGroup } from "@/components/fluent/FluentField";
import { FluentModal } from "@/components/fluent/FluentModal";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { canManageAnimals, canSuperviseAnimalFacility, hasRole } from "@/lib/roles";
import { exportToCsv } from "@/lib/export";
import { api } from "@/lib/api/client";
import { getApplications, getManagedAnimals, setCachePartial } from "@/lib/storage/db";
import { formatTrackingMinutes, trackingMinutes, normalizePurpose } from "@/lib/animals/facility-board";
import {
  ManagedAnimal,
  AnimalFilterState,
  GenotypeStatusFilter,
  AnimalPurpose,
  ANIMAL_PURPOSES,
  EphysRecordStatus,
  DeathMethod,
  MouseLifecycleStatus,
  EuthanasiaMethod,
  OperationApplication,
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

/** All columns available in column settings */
const COLUMN_KEYS = [
  "id",
  "purpose",
  "ephysStatus",
  "cageEntryAt",
  "implantAt",
  "collectionAt",
  "lastCollectionAt",
  "tracking",
  "deathMethod",
  "specialExperiment",
  "status",
  "gender",
  "strain",
  "birthDate",
  "ageWeeks",
  "cageLocation",
] as const;

type ColumnKey = (typeof COLUMN_KEYS)[number];
type SortKey = ColumnKey;

const PAGE_SIZE = 10;

/** Default visible columns for the Excel-style list */
const DEFAULT_COLUMNS: ColumnKey[] = [
  "id",
  "purpose",
  "ephysStatus",
  "cageEntryAt",
  "implantAt",
  "collectionAt",
  "lastCollectionAt",
  "tracking",
  "deathMethod",
  "specialExperiment",
  "status",
];

const STATUS_TIP: Record<ManagedAnimal["status"], string> = {
  active: "bg-[#E8F5E9] text-[#2E7D32] ring-[#A5D6A7]",
  breeding: "bg-[#FFF8E1] text-[#F57F17] ring-[#FFE082]",
  quarantine: "bg-[#FFF3E0] text-[#E65100] ring-[#FFCC80]",
  reserved: "bg-[#E3F2FD] text-[#1565C0] ring-[#90CAF9]",
  deceased: "bg-[#F5F5F5] text-[#616161] ring-[#BDBDBD]",
};

const LIFECYCLE_TIP: Record<MouseLifecycleStatus, string> = {
  entered: "bg-[#F3E5F5] text-[#660874] ring-[#CE93D8]",
  electrode_implant: "bg-[#EDE7F6] text-[#5E35B1] ring-[#B39DDB]",
  signal_recording: "bg-[#E3F2FD] text-[#1565C0] ring-[#90CAF9]",
  observing: "bg-[#E0F7FA] text-[#00838F] ring-[#80DEEA]",
  euthanasia: "bg-[#FFEBEE] text-[#C62828] ring-[#EF9A9A]",
};

export function ManagedAnimals({
  embedded = false,
  technicianScopeId,
  onAnimalsChange,
}: {
  /** 嵌在负责人工作台时隐藏页头与外层滚动壳 */
  embedded?: boolean;
  /** 只显示该技术员名下动物 */
  technicianScopeId?: string;
  onAnimalsChange?: (animals: ManagedAnimal[]) => void;
} = {}) {
  const { t } = useLocale();
  const m = t.animalMgmt.managed;
  const { user } = useAuth();
  const canExport = user ? canManageAnimals(user.roles) : false;
  const canEditAnimals = canExport;
  /** 学生等非管理人员：只看可申领目录 */
  const isClaimCatalog = !canEditAnimals;
  const techScope =
    technicianScopeId ??
    (user &&
    canManageAnimals(user.roles) &&
    !canSuperviseAnimalFacility(user.roles) &&
    !hasRole(user.roles, "super_admin")
      ? user.id
      : undefined);

  function scopeList(list: ManagedAnimal[]) {
    const scoped = techScope
      ? list.filter((a) => a.technicianUserId === techScope)
      : list;
    onAnimalsChange?.(scoped);
    return scoped;
  }
  const [applying, setApplying] = useState(false);
  const [pendingClaimIds, setPendingClaimIds] = useState<Set<string>>(() => new Set());

  const [filters, setFilters] = useState<AnimalFilterState>(EMPTY_FILTER);
  const [applied, setApplied] = useState<AnimalFilterState>(EMPTY_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState("");
  const [displayMode, setDisplayMode] = useState<"list" | "grid">("list");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => new Set(DEFAULT_COLUMNS));
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [viewAnimal, setViewAnimal] = useState<ManagedAnimal | null>(null);
  const [opAction, setOpAction] = useState<"" | "record_signal" | "force_euthanasia">("");
  const [opEuthMethod, setOpEuthMethod] = useState<EuthanasiaMethod | "">("");
  const [opEuthCustom, setOpEuthCustom] = useState("");
  const [animals, setAnimals] = useState<ManagedAnimal[]>([]);
  const [vetModalOpen, setVetModalOpen] = useState(false);
  const [vetAction, setVetAction] = useState("");
  const [vetOtherNote, setVetOtherNote] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferDest, setTransferDest] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [addForm, setAddForm] = useState({
    id: "",
    gender: "male" as "male" | "female",
    strain: "",
    genotype: "",
    cageLocation: "",
    birthDate: "",
    purpose: "blank" as AnimalPurpose,
  });
  const [removing, setRemoving] = useState(false);
  const [batchMenuOpen, setBatchMenuOpen] = useState(false);
  const [batchMenuPos, setBatchMenuPos] = useState({ top: 0, left: 0 });
  const batchBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ managedAnimals }, appsRes] = await Promise.all([
          api.managedAnimals(),
          isClaimCatalog ? api.applications() : Promise.resolve(null),
        ]);
        setCachePartial({
          managedAnimals,
          ...(appsRes ? { applications: appsRes.applications } : {}),
        });
        setAnimals(scopeList(managedAnimals));
        if (appsRes) {
          setPendingClaimIds(pendingIdsFromApps(appsRes.applications));
        }
      } catch {
        setAnimals(scopeList(getManagedAnimals()));
        if (isClaimCatalog) {
          setPendingClaimIds(pendingIdsFromApps(getApplications()));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techScope, isClaimCatalog]);

  function pendingIdsFromApps(apps: OperationApplication[]) {
    const ids = new Set<string>();
    for (const app of apps) {
      if (app.type !== "custody" || app.status !== "pending_receipt") continue;
      for (const id of app.animalIds ?? []) ids.add(id);
    }
    return ids;
  }

  useEffect(() => {
    if (!batchMenuOpen) return;
    const onDocClick = () => setBatchMenuOpen(false);
    const onScroll = () => setBatchMenuOpen(false);
    const t = window.setTimeout(() => {
      document.addEventListener("click", onDocClick);
      window.addEventListener("scroll", onScroll, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [batchMenuOpen]);

  function toggleBatchMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (batchMenuOpen) {
      setBatchMenuOpen(false);
      return;
    }
    const rect = batchBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setBatchMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setBatchMenuOpen(true);
  }

  const columnLabels: Record<ColumnKey, string> = {
    id: m.colId,
    purpose: m.colPurpose,
    ephysStatus: m.colEphys,
    cageEntryAt: m.colCageEntry,
    implantAt: m.colImplant,
    collectionAt: m.colCollection,
    lastCollectionAt: m.colLastCollection,
    tracking: m.colTracking,
    deathMethod: m.colDeathMethod,
    specialExperiment: m.colSpecialExperiment,
    status: m.colStatus,
    gender: m.colGender,
    strain: m.colStrain,
    birthDate: m.colBirth,
    ageWeeks: m.colAge,
    cageLocation: m.colCage,
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
    if (isClaimCatalog) {
      rows = rows.filter((r) => {
        if (normalizePurpose(r.purpose) === "blank") return false;
        if (r.status === "deceased") return false;
        if (r.claimantUserId) return false;
        if (pendingClaimIds.has(r.id)) return false;
        return true;
      });
    }
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
      if (sortKey === "tracking") {
        const av = trackingMinutes(a.collectionAt, a.lastCollectionAt) ?? -Infinity;
        const bv = trackingMinutes(b.collectionAt, b.lastCollectionAt) ?? -Infinity;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortAsc ? cmp : -cmp;
      }
      const av = a[sortKey as keyof ManagedAnimal] ?? "";
      const bv = b[sortKey as keyof ManagedAnimal] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [animals, applied, sortKey, sortAsc, isClaimCatalog, pendingClaimIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
    setPage(1);
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
    const pageIds = paged.map((r) => r.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  async function submitCustody(ids: string[]) {
    if (ids.length === 0) {
      showToast(m.selectRows);
      return;
    }
    setApplying(true);
    try {
      const { applications: list } = await api.createApplication({
        type: "custody",
        description: `申请代管动物: ${ids.join(", ")}`,
        animalIds: ids,
      });
      setCachePartial({ applications: list });
      setPendingClaimIds(pendingIdsFromApps(list));
      setSelected(new Set());
      setViewAnimal(null);
      showToast(m.applyPending);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "blank_not_claimable") showToast(m.blankNotClaimable);
      else if (code === "already_claimed") showToast(m.alreadyClaimed);
      else if (code === "claim_pending") showToast(m.claimPendingError);
      else showToast(m.applyError);
    } finally {
      setApplying(false);
    }
  }

  function handleBatchApply() {
    void submitCustody([...selected]);
  }

  function openViewAnimal(row: ManagedAnimal) {
    setViewAnimal(row);
    setOpAction("");
    setOpEuthMethod("");
    setOpEuthCustom("");
  }

  async function submitViewOperation() {
    if (!viewAnimal) return;
    if (!opAction) {
      showToast(m.opNeedAction);
      return;
    }
    if (opAction === "force_euthanasia") {
      if (!opEuthMethod) {
        showToast(m.opNeedEuthanasiaMethod);
        return;
      }
      if (opEuthMethod === "other" && !opEuthCustom.trim()) {
        showToast(m.opNeedCustomNote);
        return;
      }
    }

    setApplying(true);
    try {
      const now = new Date().toISOString();
      let patch: Record<string, unknown>;
      if (opAction === "record_signal") {
        patch = {
          lifecycleStatus: "signal_recording",
          lastCollectionAt: viewAnimal.collectionAt || undefined,
          collectionAt: now,
          ephysStatus: viewAnimal.ephysStatus === "ephys_no_signal" ? "ephys_has_signal" : viewAnimal.ephysStatus ?? "ephys_has_signal",
        };
      } else {
        const deathMethod: DeathMethod | undefined =
          opEuthMethod === "cervical"
            ? "cervical"
            : opEuthMethod === "perfusion"
              ? "perfusion"
              : undefined;
        patch = {
          lifecycleStatus: "euthanasia",
          status: "deceased",
          euthanasiaMethod: opEuthMethod,
          euthanasiaNote: opEuthMethod === "other" ? opEuthCustom.trim() : undefined,
          deathMethod: deathMethod ?? viewAnimal.deathMethod,
        };
      }

      const res = await api.updateManagedAnimal(viewAnimal.id, patch);
      setCachePartial({ managedAnimals: res.managedAnimals });
      setAnimals(scopeList(res.managedAnimals));
      setViewAnimal(null);
      setOpAction("");
      setOpEuthMethod("");
      setOpEuthCustom("");
      showToast(opAction === "record_signal" ? m.opSuccessRecord : m.opSuccessEuthanasia);
    } catch {
      showToast(m.opError);
    } finally {
      setApplying(false);
    }
  }

  function openTransferModal() {
    if (selected.size === 0) {
      showToast(m.selectRows);
      return;
    }
    setTransferDest("");
    setTransferNote("");
    setTransferModalOpen(true);
  }

  async function submitTransfer() {
    const ids = [...selected];
    if (ids.length === 0) {
      showToast(m.selectRows);
      return;
    }
    if (!transferDest.trim()) {
      showToast(m.transferNeedDest);
      return;
    }
    const description = transferNote.trim()
      ? `转移至 ${transferDest.trim()}：${transferNote.trim()}（${ids.join(", ")}）`
      : `转移至 ${transferDest.trim()}（${ids.join(", ")}）`;
    setApplying(true);
    try {
      await api.createApplication({
        type: "transfer",
        description,
        animalIds: ids,
      });
      setSelected(new Set());
      setTransferModalOpen(false);
      setTransferDest("");
      setTransferNote("");
      showToast(m.transferSubmitted);
    } catch {
      showToast(m.applyError);
    } finally {
      setApplying(false);
    }
  }

  function purposeLabel(p?: AnimalPurpose) {
    if (p === "signal_processing") return m.purposeSignal;
    if (p === "immunity") return m.purposeImmunity;
    if (p === "breeding") return m.purposeBreeding;
    return m.purposeBlank;
  }

  function ephysLabel(s?: EphysRecordStatus) {
    if (!s) return "—";
    const map: Record<EphysRecordStatus, string> = {
      dead: m.ephysDead,
      ephys_no_signal: m.ephysNoSignal,
      ephys_has_signal: m.ephysHasSignal,
      twophoton: m.ephysTwophoton,
      immunity_mouse: m.ephysImmunity,
      poor_condition: m.ephysPoor,
      no_spike: m.ephysNoSpike,
    };
    return map[s];
  }

  function deathLabel(d?: DeathMethod) {
    if (!d) return "—";
    const map: Record<DeathMethod, string> = {
      cervical: m.deathCervical,
      perfusion: m.deathPerfusion,
      found_dead: m.deathFound,
    };
    return map[d];
  }

  function euthanasiaMethodLabel(row: ManagedAnimal) {
    if (row.euthanasiaMethod === "humane") return m.opEuthanasiaHumane;
    if (row.euthanasiaMethod === "perfusion") return m.opEuthanasiaPerfusion;
    if (row.euthanasiaMethod === "cervical") return m.opEuthanasiaCervical;
    if (row.euthanasiaMethod === "brain_harvest") return m.opEuthanasiaBrain;
    if (row.euthanasiaMethod === "other") {
      return row.euthanasiaNote?.trim() || m.opEuthanasiaCustom;
    }
    return deathLabel(row.deathMethod);
  }

  function formatTime(iso?: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function openVetModal() {
    if (selected.size === 0) {
      showToast(m.selectRows);
      return;
    }
    setVetAction("");
    setVetOtherNote("");
    setVetModalOpen(true);
  }

  async function submitVetCare() {
    const ids = [...selected];
    if (ids.length === 0) {
      showToast(m.selectRows);
      return;
    }
    if (!vetAction) {
      showToast(m.vetNeedAction);
      return;
    }
    if (vetAction === "other" && !vetOtherNote.trim()) {
      showToast(m.vetNeedInstructions);
      return;
    }
    const actionLabels: Record<string, string> = {
      euthanasia: m.vetActEuthanasia,
      perfusion: m.vetActPerfusion,
      special_care: m.vetActSpecialCare,
      no_water: m.vetActNoWater,
      no_food: m.vetActNoFood,
      other: m.vetActOther,
    };
    const instructions =
      vetAction === "other"
        ? `${actionLabels.other}: ${vetOtherNote.trim()}`
        : actionLabels[vetAction] ?? vetAction;
    setApplying(true);
    try {
      await api.createApplication({
        type: "veterinary",
        description: instructions,
        vetInstructions: instructions,
        animalIds: ids,
      });
      setSelected(new Set());
      setVetModalOpen(false);
      setVetAction("");
      setVetOtherNote("");
      showToast(m.vetSubmitted);
    } catch {
      showToast(m.applyError);
    } finally {
      setApplying(false);
    }
  }

  function openAddModal() {
    const year = new Date().getFullYear();
    const suffix = String(Math.floor(Math.random() * 90000) + 10000);
    setAddForm({
      id: `A-${year}-${suffix}`,
      gender: "male",
      strain: "",
      genotype: "",
      cageLocation: "",
      birthDate: new Date().toISOString().slice(0, 10),
      purpose: "blank",
    });
    setAddModalOpen(true);
  }

  async function submitAddAnimal() {
    if (!addForm.id.trim() || !addForm.strain.trim() || !addForm.cageLocation.trim() || !addForm.birthDate) {
      showToast(m.addNeedFields);
      return;
    }
    setApplying(true);
    try {
      const { managedAnimals } = await api.createManagedAnimal({
        id: addForm.id.trim(),
        gender: addForm.gender,
        strain: addForm.strain.trim(),
        genotype: addForm.genotype.trim() || "未知",
        cageLocation: addForm.cageLocation.trim(),
        birthDate: addForm.birthDate,
        purpose: addForm.purpose,
      });
      setCachePartial({ managedAnimals });
      setAnimals(scopeList(managedAnimals));
      setAddModalOpen(false);
      showToast(m.addSuccess);
    } catch {
      showToast(m.addError);
    } finally {
      setApplying(false);
    }
  }

  async function removeSelected() {
    if (!canEditAnimals) return;
    const ids = [...selected];
    if (ids.length === 0) {
      showToast(m.selectRows);
      return;
    }
    if (!window.confirm(m.removeConfirm.replace("{n}", String(ids.length)))) return;
    setRemoving(true);
    try {
      let list = animals;
      for (const id of ids) {
        const res = await api.deleteManagedAnimal(id);
        list = res.managedAnimals;
      }
      setCachePartial({ managedAnimals: list });
      setAnimals(scopeList(list));
      setSelected(new Set());
      showToast(m.removeSuccess);
    } catch {
      showToast(m.removeError);
    } finally {
      setRemoving(false);
    }
  }

  async function removeOne(id: string) {
    if (!canEditAnimals) return;
    if (!window.confirm(m.removeConfirm.replace("{n}", "1"))) return;
    setRemoving(true);
    try {
      const { managedAnimals } = await api.deleteManagedAnimal(id);
      setCachePartial({ managedAnimals });
      setAnimals(scopeList(managedAnimals));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (viewAnimal?.id === id) setViewAnimal(null);
      showToast(m.removeSuccess);
    } catch {
      showToast(m.removeError);
    } finally {
      setRemoving(false);
    }
  }

  function handleExport() {
    const headers = [
      m.colId,
      m.colPurpose,
      m.colEphys,
      m.colCageEntry,
      m.colImplant,
      m.colCollection,
      m.colLastCollection,
      m.colTracking,
      m.colDeathMethod,
      m.colSpecialExperiment,
      m.colStatus,
      m.colGender,
      m.colStrain,
      m.colCage,
      m.colClaimant,
      m.colTech,
    ];
    exportToCsv(
      `managed-animals-${Date.now()}.csv`,
      headers,
      filtered.map((row) => {
        const isSignal = row.purpose === "signal_processing";
        return [
          row.id,
          purposeLabel(row.purpose),
          ephysLabel(row.ephysStatus),
          formatTime(row.cageEntryAt),
          formatTime(row.implantAt),
          isSignal ? formatTime(row.collectionAt) : "—",
          isSignal ? formatTime(row.lastCollectionAt) : "—",
          isSignal
            ? formatTrackingMinutes(trackingMinutes(row.collectionAt, row.lastCollectionAt), m.trackingUnit)
            : "—",
          euthanasiaMethodLabel(row),
          row.specialExperiment?.trim() || "—",
          currentStatusLabel(row),
          genderLabel(row.gender),
          row.strain,
          row.cageLocation,
          row.claimantName ?? "未分配",
          row.technicianName ?? "未分配",
        ];
      })
    );
    showToast(m.exportDone);
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

  function lifecycleLabel(s?: MouseLifecycleStatus) {
    if (!s) return "";
    const map: Record<MouseLifecycleStatus, string> = {
      entered: t.animalMgmt.facilityBoard.lifeEntered,
      electrode_implant: t.animalMgmt.facilityBoard.lifeElectrode,
      signal_recording: t.animalMgmt.facilityBoard.lifeRecording,
      observing: t.animalMgmt.facilityBoard.lifeObserving,
      euthanasia: t.animalMgmt.facilityBoard.lifeEuthanasia,
    };
    return map[s];
  }

  function currentStatusLabel(row: ManagedAnimal) {
    return lifecycleLabel(row.lifecycleStatus) || statusLabel(row.status);
  }

  function statusTipClass(row: ManagedAnimal) {
    if (row.lifecycleStatus) return LIFECYCLE_TIP[row.lifecycleStatus];
    return STATUS_TIP[row.status];
  }

  function isSignalMouse(row: ManagedAnimal) {
    return row.purpose === "signal_processing";
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
    const signal = isSignalMouse(row);
    if (key === "gender") return genderLabel(row.gender);
    if (key === "status") return currentStatusLabel(row);
    if (key === "purpose") return purposeLabel(row.purpose);
    if (key === "ephysStatus") return ephysLabel(row.ephysStatus);
    if (key === "deathMethod") return euthanasiaMethodLabel(row);
    if (key === "cageEntryAt") return formatTime(row.cageEntryAt);
    if (key === "implantAt") return formatTime(row.implantAt);
    if (key === "collectionAt") return signal ? formatTime(row.collectionAt) : "—";
    if (key === "lastCollectionAt") return signal ? formatTime(row.lastCollectionAt) : "—";
    if (key === "tracking") {
      if (!signal) return "—";
      return formatTrackingMinutes(trackingMinutes(row.collectionAt, row.lastCollectionAt), m.trackingUnit);
    }
    if (key === "specialExperiment") return row.specialExperiment?.trim() || "—";
    return String(row[key as keyof ManagedAnimal] ?? "");
  }

  const SortTh = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="cursor-pointer whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold text-thu hover:text-thu-dark"
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
    <div className={clsx(!embedded && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
      {!embedded && (
        <PageHeader
          title={isClaimCatalog ? m.claimTitle : m.title}
          subtitle={isClaimCatalog ? m.claimSubtitle : undefined}
          action={
            canEditAnimals ? (
              <FluentButton size="sm" onClick={openAddModal}>
                + {m.addAnimal}
              </FluentButton>
            ) : undefined
          }
        />
      )}
      <div
        className={clsx(
          embedded
            ? "space-y-4"
            : "fluent-mica-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6"
        )}
      >
        {!embedded && (
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
            <FluentButton
              onClick={() => {
                setApplied({ ...filters });
                setPage(1);
              }}
            >
              {m.query}
            </FluentButton>
            <FluentButton
              variant="outline"
              onClick={() => {
                setFilters(EMPTY_FILTER);
                setApplied(EMPTY_FILTER);
                setPage(1);
              }}
            >
              {m.reset}
            </FluentButton>
          </div>
        </GlassPanel>
        )}

        {embedded && (
          <GlassPanel className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <FluentInput
                label={m.animalId}
                value={filters.animalId}
                onChange={(e) => setFilters({ ...filters, animalId: e.target.value })}
                className="min-w-[160px] flex-1"
              />
              <FluentButton
                onClick={() => {
                  setApplied({ ...filters });
                  setPage(1);
                }}
              >
                {m.query}
              </FluentButton>
              <FluentButton
                variant="outline"
                onClick={() => {
                  setFilters(EMPTY_FILTER);
                  setApplied(EMPTY_FILTER);
                  setPage(1);
                }}
              >
                {m.reset}
              </FluentButton>
            </div>
          </GlassPanel>
        )}

        {isClaimCatalog && !embedded && (
          <GlassPanel className="mb-4 bg-[#F7F1FA]/80">
            <p className="text-sm text-lab-text">{m.claimHint}</p>
          </GlassPanel>
        )}

        <GlassPanel className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {isClaimCatalog ? (
                <FluentButton
                  size="sm"
                  disabled={applying || selected.size === 0}
                  onClick={handleBatchApply}
                >
                  {m.claimSelected}
                  {selected.size > 0 ? ` (${selected.size})` : ""}
                </FluentButton>
              ) : (
                <>
                  <FluentButton variant="secondary" size="sm" onClick={openVetModal}>
                    {m.vetCare}
                  </FluentButton>
                  <div className="relative">
                    <FluentButton
                      ref={batchBtnRef}
                      variant="secondary"
                      size="sm"
                      disabled={applying || removing}
                      onClick={toggleBatchMenu}
                    >
                      {m.batchOps} ▾
                    </FluentButton>
                    {batchMenuOpen &&
                      typeof document !== "undefined" &&
                      createPortal(
                        <div
                          className="fluent-glass fixed z-[200] min-w-[148px] overflow-hidden py-1 shadow-fluent-lg"
                          style={{ top: batchMenuPos.top, left: batchMenuPos.left }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left text-xs text-lab-text hover:bg-white/60 hover:text-thu"
                            disabled={applying}
                            onClick={() => {
                              setBatchMenuOpen(false);
                              handleBatchApply();
                            }}
                          >
                            {m.batchApply}
                          </button>
                          {canEditAnimals && (
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-xs text-lab-text hover:bg-white/60 hover:text-red-600"
                              disabled={removing}
                              onClick={() => {
                                setBatchMenuOpen(false);
                                void removeSelected();
                              }}
                            >
                              {m.batchDelete}
                            </button>
                          )}
                        </div>,
                        document.body
                      )}
                  </div>
                  <FluentButton variant="outline" size="sm" onClick={openTransferModal}>
                    {m.transfer}
                  </FluentButton>
                </>
              )}
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
              <table className="w-full min-w-[1280px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E0D4E8] bg-[#F3EAF6]">
                    <th className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={paged.length > 0 && paged.every((r) => selected.has(r.id))}
                        onChange={toggleAll}
                        className="accent-thu"
                      />
                    </th>
                    {COLUMN_KEYS.filter((k) => visibleColumns.has(k)).map((key) =>
                      key === "purpose" || key === "specialExperiment" ? (
                        <th
                          key={key}
                          className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold text-thu"
                        >
                          {columnLabels[key]}
                        </th>
                      ) : (
                        <SortTh key={key} col={key} label={columnLabels[key]} />
                      )
                    )}
                    <th className="sticky right-0 bg-[#F3EAF6] px-3 py-2.5 text-left text-[11px] font-semibold text-thu">
                      {m.colActions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row, idx) => {
                    const zebra = idx % 2 === 0 ? "bg-white" : "bg-[#F7F1FA]";
                    return (
                      <tr
                        key={row.id}
                        className={clsx(
                          "border-b border-[#EDE4F2] transition-colors hover:bg-[#EFE4F5]",
                          zebra
                        )}
                      >
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} className="accent-thu" />
                        </td>
                        {COLUMN_KEYS.filter((k) => visibleColumns.has(k)).map((key) => (
                          <td
                            key={key}
                            className={clsx(
                              "whitespace-nowrap px-3 py-2 text-xs text-lab-text",
                              key === "id" && "font-mono font-medium text-thu"
                            )}
                          >
                            {key === "status" ? (
                              <span
                                className={clsx(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                                  statusTipClass(row)
                                )}
                              >
                                {currentStatusLabel(row)}
                              </span>
                            ) : key === "purpose" ? (
                              <span className="font-medium">{cellValue(row, key)}</span>
                            ) : (
                              cellValue(row, key)
                            )}
                          </td>
                        ))}
                        <td className={clsx("sticky right-0 px-3 py-2", zebra)}>
                          <div className="flex flex-nowrap items-center gap-1">
                            <FluentButton variant="ghost" size="sm" onClick={() => openViewAnimal(row)}>
                              {m.view}
                            </FluentButton>
                            {canEditAnimals && (
                              <FluentButton
                                variant="ghost"
                                size="sm"
                                className="!text-red-600 hover:!bg-red-50/70"
                                disabled={removing}
                                onClick={() => void removeOne(row.id)}
                              >
                                {t.common.delete}
                              </FluentButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paged.map((row) => (
              <GlassPanel key={row.id} className="flex flex-col">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id)} className="accent-thu" />
                    <span className="font-mono text-sm font-semibold text-thu">{row.id}</span>
                  </label>
                  <span
                    className={clsx(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                      statusTipClass(row)
                    )}
                  >
                    {currentStatusLabel(row)}
                  </span>
                </div>
                <dl className="flex-1 space-y-1 text-xs">
                  <div><span className="text-lab-muted">{m.colPurpose}: </span>{purposeLabel(row.purpose)}</div>
                  <div><span className="text-lab-muted">{m.colEphys}: </span>{ephysLabel(row.ephysStatus)}</div>
                  <div><span className="text-lab-muted">{m.colCageEntry}: </span>{formatTime(row.cageEntryAt)}</div>
                  <div><span className="text-lab-muted">{m.colImplant}: </span>{formatTime(row.implantAt)}</div>
                  <div><span className="text-lab-muted">{m.colCage}: </span>{row.cageLocation}</div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  <FluentButton variant="ghost" size="sm" onClick={() => openViewAnimal(row)}>
                    {m.view}
                  </FluentButton>
                  {canEditAnimals && (
                    <FluentButton
                      variant="ghost"
                      size="sm"
                      className="!text-red-600 hover:!bg-red-50/70"
                      disabled={removing}
                      onClick={() => void removeOne(row.id)}
                    >
                      {t.common.delete}
                    </FluentButton>
                  )}
                </div>
              </GlassPanel>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E0D4E8] bg-white/60 px-4 py-2.5">
            <p className="text-xs text-lab-muted">
              {m.pageInfo
                .replace("{total}", String(filtered.length))
                .replace("{page}", String(safePage))
                .replace("{pages}", String(totalPages))
                .replace("{size}", String(PAGE_SIZE))}
            </p>
            <div className="flex items-center gap-2">
              <FluentButton
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {m.pagePrev}
              </FluentButton>
              <span className="min-w-[4.5rem] text-center text-xs font-medium text-thu">
                {safePage} / {totalPages}
              </span>
              <FluentButton
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {m.pageNext}
              </FluentButton>
            </div>
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
        onClose={() => {
          setViewAnimal(null);
          setOpAction("");
          setOpEuthMethod("");
          setOpEuthCustom("");
        }}
        footer={
          viewAnimal ? (
            <div className="flex justify-end gap-2">
              <FluentButton
                variant="outline"
                onClick={() => {
                  setViewAnimal(null);
                  setOpAction("");
                  setOpEuthMethod("");
                  setOpEuthCustom("");
                }}
              >
                {t.common.cancel}
              </FluentButton>
              {isClaimCatalog ? (
                <FluentButton
                  disabled={applying}
                  onClick={() => void submitCustody([viewAnimal.id])}
                >
                  {m.claim}
                </FluentButton>
              ) : canEditAnimals ? (
                <FluentButton disabled={applying} onClick={() => void submitViewOperation()}>
                  {m.opConfirm}
                </FluentButton>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {viewAnimal && (
          <div className="space-y-4">
            <dl>
              <DetailRow label={m.colId} value={viewAnimal.id} />
              <DetailRow label={m.colPurpose} value={purposeLabel(viewAnimal.purpose)} />
              <DetailRow label={m.colStatus} value={currentStatusLabel(viewAnimal)} />
              <DetailRow label={m.colEphys} value={ephysLabel(viewAnimal.ephysStatus)} />
              <DetailRow label={m.colCageEntry} value={formatTime(viewAnimal.cageEntryAt)} />
              <DetailRow label={m.colImplant} value={formatTime(viewAnimal.implantAt)} />
              <DetailRow
                label={m.colCollection}
                value={isSignalMouse(viewAnimal) ? formatTime(viewAnimal.collectionAt) : "—"}
              />
              <DetailRow
                label={m.colLastCollection}
                value={isSignalMouse(viewAnimal) ? formatTime(viewAnimal.lastCollectionAt) : "—"}
              />
              <DetailRow
                label={m.colTracking}
                value={
                  isSignalMouse(viewAnimal)
                    ? formatTrackingMinutes(
                        trackingMinutes(viewAnimal.collectionAt, viewAnimal.lastCollectionAt),
                        m.trackingUnit
                      )
                    : "—"
                }
              />
              <DetailRow label={m.colDeathMethod} value={euthanasiaMethodLabel(viewAnimal)} />
              <DetailRow label={m.colSpecialExperiment} value={viewAnimal.specialExperiment?.trim() || "—"} />
              <DetailRow label={m.colGender} value={genderLabel(viewAnimal.gender)} />
              <DetailRow label={m.colStrain} value={viewAnimal.strain} />
              <DetailRow label={m.colCage} value={viewAnimal.cageLocation} />
            </dl>

            {!isClaimCatalog && canEditAnimals && (
            <div className="rounded-lg border border-[#E0D4E8] bg-[#F7F1FA]/60 px-3 py-3">
              <FluentRadioGroup
                label={m.opAction}
                name="managedOpAction"
                value={opAction}
                onChange={(v) => {
                  setOpAction(v as "" | "record_signal" | "force_euthanasia");
                  if (v !== "force_euthanasia") {
                    setOpEuthMethod("");
                    setOpEuthCustom("");
                  }
                }}
                options={[
                  { value: "record_signal", label: m.opRecordSignal },
                  { value: "force_euthanasia", label: m.opForceEuthanasia },
                ]}
              />
              {opAction === "force_euthanasia" && (
                <div className="mt-3 border-t border-[#E0D4E8] pt-3">
                  <FluentRadioGroup
                    label={m.opEuthanasiaMethod}
                    name="managedOpEuthMethod"
                    value={opEuthMethod}
                    onChange={(v) => setOpEuthMethod(v as EuthanasiaMethod)}
                    options={[
                      { value: "humane", label: m.opEuthanasiaHumane },
                      { value: "perfusion", label: m.opEuthanasiaPerfusion },
                      { value: "cervical", label: m.opEuthanasiaCervical },
                      { value: "brain_harvest", label: m.opEuthanasiaBrain },
                      { value: "other", label: m.opEuthanasiaCustom },
                    ]}
                  />
                  {opEuthMethod === "other" && (
                    <input
                      className="fluent-input mt-2 w-full rounded-lg px-3 py-2 text-sm"
                      value={opEuthCustom}
                      onChange={(e) => setOpEuthCustom(e.target.value)}
                      placeholder={m.opEuthanasiaCustomPlaceholder}
                    />
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </FluentModal>

      <FluentModal
        open={vetModalOpen}
        title={m.vetCare}
        onClose={() => setVetModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setVetModalOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={applying} onClick={() => void submitVetCare()}>
              {m.vetSubmit}
            </FluentButton>
          </div>
        }
      >
        <p className="mb-3 text-xs text-lab-muted">
          {m.vetSelected.replace("{n}", String(selected.size))}
        </p>
        <p className="mb-3 font-mono text-[11px] text-lab-muted">{[...selected].join(", ")}</p>
        <FluentRadioGroup
          label={m.vetInstructions}
          name="vetAction"
          value={vetAction}
          onChange={setVetAction}
          options={[
            { value: "euthanasia", label: m.vetActEuthanasia },
            { value: "perfusion", label: m.vetActPerfusion },
            { value: "special_care", label: m.vetActSpecialCare },
            { value: "no_water", label: m.vetActNoWater },
            { value: "no_food", label: m.vetActNoFood },
            { value: "other", label: m.vetActOther },
          ]}
        />
        {vetAction === "other" && (
          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-medium text-lab-muted">{m.vetOtherNote}</label>
            <textarea
              className="fluent-input w-full rounded-lg px-3 py-2 text-sm shadow-sm"
              rows={3}
              value={vetOtherNote}
              onChange={(e) => setVetOtherNote(e.target.value)}
              placeholder={m.vetInstructionsPlaceholder}
            />
          </div>
        )}
      </FluentModal>

      <FluentModal
        open={transferModalOpen}
        title={m.transfer}
        onClose={() => setTransferModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setTransferModalOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={applying} onClick={() => void submitTransfer()}>
              {m.transferSubmit}
            </FluentButton>
          </div>
        }
      >
        <p className="mb-3 text-xs text-lab-muted">
          {m.vetSelected.replace("{n}", String(selected.size))}
        </p>
        <p className="mb-3 font-mono text-[11px] text-lab-muted">{[...selected].join(", ")}</p>
        <FluentInput
          label={m.transferDest}
          value={transferDest}
          onChange={(e) => setTransferDest(e.target.value)}
          placeholder={m.transferDestPlaceholder}
          className="mb-3"
        />
        <label className="mb-1 block text-[11px] font-medium text-lab-muted">{m.transferNote}</label>
        <textarea
          className="fluent-input w-full rounded-lg px-3 py-2 text-sm shadow-sm"
          rows={3}
          value={transferNote}
          onChange={(e) => setTransferNote(e.target.value)}
          placeholder={m.transferNotePlaceholder}
        />
      </FluentModal>

      <FluentModal
        open={addModalOpen}
        title={m.addAnimal}
        onClose={() => setAddModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <FluentButton variant="outline" onClick={() => setAddModalOpen(false)}>
              {t.common.cancel}
            </FluentButton>
            <FluentButton disabled={applying} onClick={() => void submitAddAnimal()}>
              {t.common.save}
            </FluentButton>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FluentInput
            label={m.colId}
            value={addForm.id}
            onChange={(e) => setAddForm({ ...addForm, id: e.target.value })}
          />
          <FluentSelect
            label={m.gender}
            value={addForm.gender}
            onChange={(e) => setAddForm({ ...addForm, gender: e.target.value as "male" | "female" })}
          >
            <option value="male">{m.genderMale}</option>
            <option value="female">{m.genderFemale}</option>
          </FluentSelect>
          <FluentInput
            label={m.colStrain}
            value={addForm.strain}
            onChange={(e) => setAddForm({ ...addForm, strain: e.target.value })}
          />
          <FluentInput
            label={m.colGenotype}
            value={addForm.genotype}
            onChange={(e) => setAddForm({ ...addForm, genotype: e.target.value })}
          />
          <FluentInput
            label={m.colCage}
            value={addForm.cageLocation}
            onChange={(e) => setAddForm({ ...addForm, cageLocation: e.target.value })}
          />
          <FluentInput
            label={m.colBirth}
            type="date"
            value={addForm.birthDate}
            onChange={(e) => setAddForm({ ...addForm, birthDate: e.target.value })}
          />
          <FluentSelect
            label={m.colPurpose}
            value={addForm.purpose}
            onChange={(e) => setAddForm({ ...addForm, purpose: e.target.value as AnimalPurpose })}
            className="sm:col-span-2"
          >
            {ANIMAL_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {purposeLabel(p)}
              </option>
            ))}
          </FluentSelect>
        </div>
      </FluentModal>
    </div>
  );
}
