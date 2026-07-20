import {
  AnimalPurpose,
  ANIMAL_PURPOSES,
  Cage,
  FacilityCageCell,
  ManagedAnimal,
  MouseLifecycleStatus,
  PURPOSE_LIFECYCLE,
  EuthanasiaMethod,
} from "@/types/animal-management";

export function normalizePurpose(purpose?: AnimalPurpose): AnimalPurpose {
  return purpose && ANIMAL_PURPOSES.includes(purpose) ? purpose : "blank";
}

export function emptyPurposeCounts(): Record<AnimalPurpose, number> {
  return { blank: 0, signal_processing: 0, immunity: 0, breeding: 0 };
}

export function buildFacilityCageCells(
  cages: Cage[],
  mice: ManagedAnimal[]
): FacilityCageCell[] {
  const byCage = new Map<string, ManagedAnimal[]>();
  for (const m of mice) {
    if (!m.cageId) continue;
    const list = byCage.get(m.cageId) ?? [];
    list.push(m);
    byCage.set(m.cageId, list);
  }

  return cages.map((cage) => {
    const cageMice = byCage.get(cage.id) ?? [];
    const purposeCounts = emptyPurposeCounts();
    let claimedCount = 0;
    for (const m of cageMice) {
      const p = normalizePurpose(m.purpose);
      purposeCounts[p] += 1;
      if (p !== "blank" && (m.claimantUserId || m.claimantName)) claimedCount += 1;
    }

    const present = ANIMAL_PURPOSES.filter((p) => purposeCounts[p] > 0);
    let dominantPurpose: FacilityCageCell["dominantPurpose"] = "empty";
    if (present.length === 1) dominantPurpose = present[0];
    else if (present.length > 1) dominantPurpose = "mixed";

    return {
      cage,
      mice: cageMice,
      claimedCount,
      purposeCounts,
      dominantPurpose,
    };
  });
}

export function lifecycleStepsFor(purpose?: AnimalPurpose): MouseLifecycleStatus[] {
  return PURPOSE_LIFECYCLE[normalizePurpose(purpose)];
}

export function isValidLifecycle(
  purpose: AnimalPurpose | undefined,
  status: MouseLifecycleStatus | undefined
): boolean {
  if (!status) return false;
  return lifecycleStepsFor(purpose).includes(status);
}

export function defaultLifecycle(purpose?: AnimalPurpose): MouseLifecycleStatus {
  return lifecycleStepsFor(purpose)[0] ?? "entered";
}

/** Cage colors tuned to Tsinghua purple — solid fills only, no gradients */
export const PURPOSE_CELL_COLORS: Record<
  FacilityCageCell["dominantPurpose"],
  string
> = {
  empty: "bg-[#F5EEF7] border-[#E0D4E8] text-[#6B5B75]",
  blank: "bg-[#9B8EAE] border-[#7A6D90] text-white shadow-sm",
  signal_processing: "bg-[#5BA4E8] border-[#3D86C9] text-white shadow-md",
  immunity: "bg-[#82318E] border-[#660874] text-white shadow-md",
  breeding: "bg-[#F5A623] border-[#D4890F] text-white shadow-md",
  mixed: "bg-[#C45DB5] border-[#A04496] text-white shadow-md",
};

/** Solid hex for legend chips / inline cage fills (src/lib is outside Tailwind content) */
export const PURPOSE_SWATCH: Record<FacilityCageCell["dominantPurpose"], string> = {
  empty: "#F5EEF7",
  blank: "#9B8EAE",
  signal_processing: "#5BA4E8",
  immunity: "#82318E",
  breeding: "#F5A623",
  mixed: "#C45DB5",
};

export const PURPOSE_BORDER: Record<FacilityCageCell["dominantPurpose"], string> = {
  empty: "#E0D4E8",
  blank: "#7A6D90",
  signal_processing: "#3D86C9",
  immunity: "#660874",
  breeding: "#D4890F",
  mixed: "#A04496",
};

export function cageFillStyle(purpose: FacilityCageCell["dominantPurpose"]): {
  background: string;
  borderColor: string;
  color: string;
} {
  const empty = purpose === "empty";
  return {
    background: PURPOSE_SWATCH[purpose],
    borderColor: PURPOSE_BORDER[purpose],
    color: empty ? "#6B5B75" : "#ffffff",
  };
}

/** Calendar-day difference. Prefer WSY convention: Previous date − Implantation Day. */
export function trackingDays(
  collectionAt?: string,
  lastCollectionAt?: string,
  implantAt?: string
): number | null {
  // Surgery & Recording: Tracking Days ≈ Previous date − Implantation Day
  if (implantAt && lastCollectionAt) {
    return calendarDayDiff(lastCollectionAt, implantAt);
  }
  if (collectionAt && lastCollectionAt) {
    return calendarDayDiff(collectionAt, lastCollectionAt);
  }
  return null;
}

function calendarDayDiff(aIso: string, bIso: string): number | null {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null;
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aDay - bDay) / 86_400_000);
}

/** @deprecated Prefer trackingDays — kept for any legacy callers */
export function trackingMinutes(
  collectionAt?: string,
  lastCollectionAt?: string
): number | null {
  const days = trackingDays(collectionAt, lastCollectionAt);
  return days === null ? null : days * 24 * 60;
}

export function formatTracking(minutes: number | null): string {
  if (minutes === null) return "—";
  const days = Math.round(minutes / (60 * 24));
  const sign = days < 0 ? "-" : "";
  return `${sign}${Math.abs(days)}d`;
}

/** Display tracking interval in whole days */
export function formatTrackingDays(days: number | null, unit = "d"): string {
  if (days === null) return "—";
  return `${days} ${unit}`;
}

/** @deprecated Prefer formatTrackingDays */
export function formatTrackingMinutes(minutes: number | null, unit = "min"): string {
  if (minutes === null) return "—";
  const days = Math.round(minutes / (60 * 24));
  return `${days} ${unit}`;
}

export function euthanasiaLabelKey(method?: EuthanasiaMethod): string {
  switch (method) {
    case "humane":
      return "euthanasiaHumane";
    case "perfusion":
      return "euthanasiaPerfusion";
    case "cervical":
      return "euthanasiaCervical";
    case "brain_harvest":
      return "euthanasiaBrain";
    case "other":
      return "euthanasiaOther";
    default:
      return "euthanasiaUnset";
  }
}
