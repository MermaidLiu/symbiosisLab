import { AuditLog, Animal, Booking, Instrument, Role } from "@/types";
import { getNotifications } from "@/lib/storage/db";
import { canManageAnimals, canManageInstruments, canProcessVeterinary, canSuperviseAnimalFacility, hasRole } from "@/lib/roles";

export type DashboardView =
  | "admin"
  | "instrument_manager"
  | "animal_facility_supervisor"
  | "animal_manager"
  | "veterinarian"
  | "research_assistant"
  | "student";

export function getDashboardView(roles: Role[]): DashboardView {
  if (hasRole(roles, "super_admin")) return "admin";
  if (roles.includes("research_assistant")) return "research_assistant";
  if (canSuperviseAnimalFacility(roles) && !canManageInstruments(roles)) {
    return "animal_facility_supervisor";
  }
  if (roles.includes("veterinarian") && !canManageAnimals(roles) && !canManageInstruments(roles)) {
    return "veterinarian";
  }
  const inst = canManageInstruments(roles);
  const animal = canManageAnimals(roles) && !canSuperviseAnimalFacility(roles);
  if (inst && !animal && !canSuperviseAnimalFacility(roles)) return "instrument_manager";
  if (animal && !inst) return "animal_manager";
  if (inst && (animal || canSuperviseAnimalFacility(roles))) return "admin";
  if (canProcessVeterinary(roles)) return "veterinarian";
  return "student";
}

function managedInstrumentIds(userId: string, instruments: Instrument[]): Set<string> {
  return new Set(instruments.filter((i) => i.contactUserId === userId).map((i) => i.id));
}

function managedAnimalIds(userId: string, animals: Animal[]): Set<string> {
  return new Set(animals.filter((a) => a.contactUserId === userId).map((a) => a.id));
}

function bookingInScope(
  booking: Booking,
  userId: string,
  instIds: Set<string>,
  aniIds: Set<string>,
  isInstMgr: boolean,
  isAnimalMgr: boolean
): boolean {
  if (booking.resourceType === "instrument" && isInstMgr && instIds.has(booking.resourceId)) return true;
  if (booking.resourceType === "animal" && isAnimalMgr && aniIds.has(booking.resourceId)) return true;
  return false;
}

function logInManagerScope(
  log: AuditLog,
  userId: string,
  bookings: Booking[],
  instIds: Set<string>,
  aniIds: Set<string>,
  isInstMgr: boolean,
  isAnimalMgr: boolean
): boolean {
  if (log.userId !== userId) return false;

  const isApproval =
    log.action === "booking_status" ||
    (log.action === "notification_handle" &&
      (log.details.includes("批准") || log.details.includes("拒绝") || log.details.includes("approve") || log.details.includes("reject")));

  if (!isApproval) return false;

  const bookingMap = new Map(bookings.map((b) => [b.id, b]));

  if (log.entityType === "booking" && log.entityId) {
    const b = bookingMap.get(log.entityId);
    return b ? bookingInScope(b, userId, instIds, aniIds, isInstMgr, isAnimalMgr) : false;
  }

  if (log.entityType === "notification" && log.entityId) {
    const n = getNotifications().find((x) => x.id === log.entityId);
    if (n?.bookingId) {
      const b = bookingMap.get(n.bookingId);
      return b ? bookingInScope(b, userId, instIds, aniIds, isInstMgr, isAnimalMgr) : false;
    }
  }

  return false;
}

export function filterDashboardLogs(
  logs: AuditLog[],
  userId: string,
  roles: Role[],
  instruments: Instrument[],
  animals: Animal[],
  bookings: Booking[],
  limit = 10
): AuditLog[] {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const view = getDashboardView(roles);
  if (view === "admin") return sorted.slice(0, limit);
  if (
    view === "student" ||
    view === "research_assistant" ||
    view === "veterinarian" ||
    view === "animal_facility_supervisor"
  )
    return [];

  const isInstMgr = canManageInstruments(roles);
  const isAnimalMgr = canManageAnimals(roles);
  const instIds = managedInstrumentIds(userId, instruments);
  const aniIds = managedAnimalIds(userId, animals);

  return sorted
    .filter((log) => logInManagerScope(log, userId, bookings, instIds, aniIds, isInstMgr, isAnimalMgr))
    .slice(0, limit);
}

export function pendingBookingsForManager(
  userId: string,
  roles: Role[],
  instruments: Instrument[],
  animals: Animal[],
  bookings: Booking[]
): Booking[] {
  const isInstMgr = canManageInstruments(roles);
  const isAnimalMgr = canManageAnimals(roles);
  const instIds = managedInstrumentIds(userId, instruments);
  const aniIds = managedAnimalIds(userId, animals);

  return bookings.filter(
    (b) =>
      b.status === "pending" &&
      bookingInScope(b, userId, instIds, aniIds, isInstMgr, isAnimalMgr)
  );
}
