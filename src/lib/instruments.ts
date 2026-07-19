import {
  Instrument,
  InstrumentContactStep,
  InstrumentStepContact,
} from "@/types";

export const BOOKING_HOURS_FLOOR = 0.5;
export const BOOKING_HOURS_CEILING = 24;

export const INSTRUMENT_CONTACT_STEPS: InstrumentContactStep[] = [
  "approval",
  "training",
  "operations",
  "repair",
];

export function clampBookingHours(min: number, max: number): { min: number; max: number } {
  let lo = Number.isFinite(min) ? min : BOOKING_HOURS_FLOOR;
  let hi = Number.isFinite(max) ? max : BOOKING_HOURS_CEILING;
  lo = Math.max(BOOKING_HOURS_FLOOR, Math.min(BOOKING_HOURS_CEILING, lo));
  hi = Math.max(BOOKING_HOURS_FLOOR, Math.min(BOOKING_HOURS_CEILING, hi));
  if (lo > hi) [lo, hi] = [hi, lo];
  // Snap to 0.5h grid
  lo = Math.round(lo * 2) / 2;
  hi = Math.round(hi * 2) / 2;
  return { min: lo, max: hi };
}

export function defaultInstrumentContacts(
  name: string,
  phone: string,
  userId?: string
): InstrumentStepContact[] {
  return INSTRUMENT_CONTACT_STEPS.map((step) => ({
    step,
    name: name || "—",
    phone: phone || "",
    userId,
  }));
}

export function normalizeInstrumentContacts(
  contacts: InstrumentStepContact[] | undefined,
  fallbackName: string,
  fallbackPhone: string,
  fallbackUserId?: string
): InstrumentStepContact[] {
  const byStep = new Map((contacts ?? []).map((c) => [c.step, c]));
  return INSTRUMENT_CONTACT_STEPS.map((step) => {
    const existing = byStep.get(step);
    if (existing) {
      return {
        step,
        name: existing.name?.trim() || fallbackName || "—",
        phone: existing.phone?.trim() || fallbackPhone || "",
        userId: existing.userId || fallbackUserId,
      };
    }
    return {
      step,
      name: fallbackName || "—",
      phone: fallbackPhone || "",
      userId: fallbackUserId,
    };
  });
}

export function normalizeInstrument(raw: Instrument): Instrument {
  const hours = clampBookingHours(raw.minBookingHours, raw.maxBookingHours);
  const contacts = normalizeInstrumentContacts(
    raw.contacts,
    raw.contacts?.[0]?.name ?? "",
    raw.contactPhone,
    raw.contactUserId
  );
  // Prefer approval contact for legacy fields
  const approval = contacts.find((c) => c.step === "approval");
  return {
    ...raw,
    accessories: raw.accessories ?? [],
    trainingRequired: Boolean(raw.trainingRequired),
    minBookingHours: hours.min,
    maxBookingHours: hours.max,
    contacts,
    contactPhone: approval?.phone || raw.contactPhone || "",
    contactUserId: approval?.userId || raw.contactUserId,
    imageId: raw.imageId,
    maintenanceUntil: raw.maintenanceUntil,
    maintenanceNote: raw.maintenanceNote,
  };
}

export function instrumentImageUrl(imageId?: string): string | null {
  if (!imageId) return null;
  return `/api/instruments/images/${encodeURIComponent(imageId)}`;
}

export function userHasInstrumentTraining(
  trainedInstrumentIds: string[] | undefined,
  instrumentId: string
): boolean {
  return (trainedInstrumentIds ?? []).includes(instrumentId);
}

export function canBookInstrument(opts: {
  instrument: Instrument;
  userId: string;
  roles: string[];
  trainedInstrumentIds?: string[];
}): { ok: true } | { ok: false; reason: "maintenance" | "retired" | "training_required" } {
  const { instrument, roles, trainedInstrumentIds } = opts;
  if (instrument.status === "retired") return { ok: false, reason: "retired" };
  if (instrument.status === "maintenance") return { ok: false, reason: "maintenance" };
  const bypass =
    roles.includes("instrument_manager") || roles.includes("super_admin");
  if (
    instrument.trainingRequired &&
    !bypass &&
    !userHasInstrumentTraining(trainedInstrumentIds, instrument.id)
  ) {
    return { ok: false, reason: "training_required" };
  }
  return { ok: true };
}

export function durationHoursValid(
  hours: number,
  minBookingHours: number,
  maxBookingHours: number
): boolean {
  const { min, max } = clampBookingHours(minBookingHours, maxBookingHours);
  const snapped = Math.round(hours * 2) / 2;
  return snapped >= min - 1e-9 && snapped <= max + 1e-9;
}
