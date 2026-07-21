import { AuditLog, Booking, Instrument, User } from "@/types";
import { DbStore } from "@/server/store";
import { canSuperviseInstruments, isInstrumentOwner } from "@/lib/roles";

/** Instruments this user is the designated manager (contact) for */
export function ownedInstrumentIds(userId: string, instruments: Instrument[]): Set<string> {
  return new Set(instruments.filter((i) => i.contactUserId === userId).map((i) => i.id));
}

/** Owner or instrument / system super admin may handle that instrument's workflow */
export function canAccessInstrumentWorkflow(
  user: Pick<User, "id" | "roles">,
  instrument: Pick<Instrument, "contactUserId"> | undefined
): boolean {
  if (!instrument) return false;
  if (canSuperviseInstruments(user.roles)) return true;
  return isInstrumentOwner(user.id, instrument.contactUserId);
}

/**
 * Resolve which instrument an audit log row is about (if any).
 * Booking rows store booking id in entityId; training/repair rows store request/ticket ids.
 */
export function instrumentIdForLog(log: AuditLog, store: DbStore): string | null {
  const id = log.entityId?.trim();
  if (!id) return null;

  if (log.entityType === "instrument") {
    if (store.instruments.some((i) => i.id === id)) return id;
    const booking = store.bookings.find((b) => b.id === id);
    if (booking?.resourceType === "instrument") return booking.resourceId;
    // details sometimes: `预约 ${resourceId}`
    const m = /^预约\s+(\S+)/.exec(log.details);
    if (m && store.instruments.some((i) => i.id === m[1])) return m[1];
    return null;
  }

  if (log.entityType === "instrument_training") {
    const req = (store.instrumentTrainingRequests ?? []).find((r) => r.id === id);
    return req?.instrumentId ?? null;
  }

  if (log.entityType === "instrument_repair") {
    const ticket = (store.instrumentRepairTickets ?? []).find((t) => t.id === id);
    return ticket?.instrumentId ?? null;
  }

  if (log.entityType === "booking" && id) {
    const booking = store.bookings.find((b) => b.id === id);
    if (booking?.resourceType === "instrument") return booking.resourceId;
  }

  return null;
}

function bookingForNotification(
  bookingId: string | undefined,
  bookings: Booking[]
): Booking | undefined {
  if (!bookingId) return undefined;
  return bookings.find((b) => b.id === bookingId);
}

/**
 * Whether this user should see a notification already addressed to them.
 * Hides wrongly fan-out instrument booking notices for managers who do not own that instrument.
 */
export function notificationVisibleToUser(
  n: DbStore["notifications"][number],
  user: Pick<User, "id" | "roles">,
  store: DbStore
): boolean {
  if (n.userId !== user.id) return false;
  if (canSuperviseInstruments(user.roles)) return true;

  const booking = bookingForNotification(n.bookingId, store.bookings);
  if (booking?.resourceType === "instrument") {
    if (booking.userId === user.id) return true;
    return ownedInstrumentIds(user.id, store.instruments).has(booking.resourceId);
  }

  return true;
}

/** Filter audit logs so instrument managers only see their instruments' ops */
export function filterLogsForUser(
  logs: AuditLog[],
  user: Pick<User, "id" | "roles">,
  store: DbStore
): AuditLog[] {
  if (canSuperviseInstruments(user.roles) || user.roles.includes("super_admin")) {
    return logs;
  }

  const owned = ownedInstrumentIds(user.id, store.instruments);
  const isInstMgr = user.roles.includes("instrument_manager");
  const isAnimalMgr =
    user.roles.includes("animal_manager") ||
    user.roles.includes("animal_facility_supervisor");

  return logs.filter((log) => {
    // Own auth / account activity
    if (log.entityType === "auth" || log.entityType === "user") {
      return log.userId === user.id;
    }

    const instId = instrumentIdForLog(log, store);
    if (instId) {
      if (!isInstMgr) return false;
      return owned.has(instId);
    }

    if (
      log.entityType === "instrument" ||
      log.entityType === "instrument_training" ||
      log.entityType === "instrument_repair"
    ) {
      // Could not resolve instrument — hide from non-supers
      return false;
    }

    if (log.entityType === "booking") {
      const booking = store.bookings.find((b) => b.id === log.entityId);
      if (!booking) return log.userId === user.id;
      if (booking.resourceType === "instrument") {
        return isInstMgr && (owned.has(booking.resourceId) || booking.userId === user.id);
      }
      // animal bookings: animal managers / own
      if (isAnimalMgr) return true;
      return booking.userId === user.id;
    }

    if (log.entityType === "notification") {
      const n = store.notifications.find((x) => x.id === log.entityId);
      if (!n) return log.userId === user.id;
      return notificationVisibleToUser({ ...n, userId: user.id }, user, store) && log.userId === user.id;
    }

    if (log.entityType === "animal" || log.entityType === "application" || log.entityType === "cage") {
      return isAnimalMgr || log.userId === user.id;
    }

    return log.userId === user.id;
  });
}
