import { Booking, Instrument, User } from "@/types";
import { DbStore, mutateStore, uid } from "@/server/store";
import { approverRecipientIds, pushNotificationToUsers } from "@/server/notify";
import {
  canBookInstrument,
  durationHoursValid,
  normalizeInstrument,
} from "@/lib/instruments";

export function bookingOverlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

export function isActiveBooking(b: Booking): boolean {
  return b.status !== "cancelled" && b.status !== "rejected";
}

/** Active bookings (pending/approved/…) that collide with the given slot */
export function findConflictingBookings(
  store: DbStore,
  resourceType: Booking["resourceType"],
  resourceId: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Booking[] {
  return store.bookings.filter(
    (b) =>
      b.id !== excludeId &&
      b.resourceType === resourceType &&
      b.resourceId === resourceId &&
      isActiveBooking(b) &&
      bookingOverlaps(b.startTime, b.endTime, startTime, endTime)
  );
}

export type CreateBookingError =
  | "slot_taken"
  | "resource_not_found"
  | "maintenance"
  | "retired"
  | "training_required"
  | "invalid_duration";

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: CreateBookingError };

/**
 * Atomically check conflict + insert booking + queue manager notification.
 * Runs entirely inside the store write queue (single-flight).
 */
export async function createBookingAtomic(input: {
  resourceType: Booking["resourceType"];
  resourceId: string;
  userId: string;
  userName: string;
  startTime: string;
  endTime: string;
  purpose: string;
}): Promise<CreateBookingResult> {
  return mutateStore((s): CreateBookingResult => {
    const conflicts = findConflictingBookings(
      s,
      input.resourceType,
      input.resourceId,
      input.startTime,
      input.endTime
    );
    if (conflicts.length > 0) {
      return { ok: false, error: "slot_taken" };
    }

    const resource =
      input.resourceType === "instrument"
        ? s.instruments.find((i) => i.id === input.resourceId)
        : s.animals.find((a) => a.id === input.resourceId);

    if (!resource) {
      return { ok: false, error: "resource_not_found" };
    }

    if (input.resourceType === "instrument") {
      const inst = normalizeInstrument(resource as Instrument);
      const user = s.users.find((u) => u.id === input.userId) as User | undefined;
      const gate = canBookInstrument({
        instrument: inst,
        userId: input.userId,
        roles: user?.roles ?? [],
        trainedInstrumentIds: user?.trainedInstrumentIds,
      });
      if (!gate.ok) return { ok: false, error: gate.reason };

      const hours =
        (new Date(input.endTime).getTime() - new Date(input.startTime).getTime()) / 3600000;
      if (!durationHoursValid(hours, inst.minBookingHours, inst.maxBookingHours)) {
        return { ok: false, error: "invalid_duration" };
      }
    }

    const booking: Booking = {
      id: uid("bk"),
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      userId: input.userId,
      startTime: input.startTime,
      endTime: input.endTime,
      purpose: input.purpose,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    s.bookings.push(booking);

    const recipients = approverRecipientIds(s, {
      contactUserId: resource.contactUserId,
      resourceType: input.resourceType,
    });
    pushNotificationToUsers(
      s,
      recipients,
      {
        title: "新预约待审批",
        titleEn: "New booking pending",
        message: `${input.userName} 预约了 ${resource.name}`,
        messageEn: `${input.userName} booked ${resource.nameEn}`,
        link: "/bookings",
        kind: "booking_pending",
        bookingId: booking.id,
      },
      input.userId
    );

    s.logs.unshift({
      id: uid("log"),
      userId: input.userId,
      userName: input.userName,
      action: "book",
      entityType: input.resourceType,
      entityId: booking.id,
      details: `预约 ${input.resourceId}`,
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);

    return { ok: true, booking };
  });
}

export type UpdateBookingStatusResult =
  | { ok: true; booking: Booking }
  | { ok: false; error: "not_found" | "slot_taken" };

/**
 * Atomically update booking status. When approving, re-check conflicts
 * against other active bookings so two overlapping "pending" cannot both become approved.
 */
export async function updateBookingStatusAtomic(input: {
  id: string;
  status: Booking["status"];
  actorId: string;
  actorName: string;
}): Promise<UpdateBookingStatusResult> {
  return mutateStore((s): UpdateBookingStatusResult => {
    const idx = s.bookings.findIndex((b) => b.id === input.id);
    if (idx < 0) return { ok: false, error: "not_found" };

    const current = s.bookings[idx];

    if (input.status === "approved") {
      const conflicts = findConflictingBookings(
        s,
        current.resourceType,
        current.resourceId,
        current.startTime,
        current.endTime,
        current.id
      ).filter((b) => b.status === "approved");
      if (conflicts.length > 0) {
        return { ok: false, error: "slot_taken" };
      }
    }

    s.bookings[idx] = { ...current, status: input.status };
    const updated = s.bookings[idx];

    s.notifications.unshift({
      id: uid("ntf"),
      userId: current.userId,
      title: "预约状态更新",
      titleEn: "Booking status updated",
      message: `您的预约已更新为: ${input.status}`,
      messageEn: `Your booking status: ${input.status}`,
      read: false,
      link: "/bookings",
      kind: "booking_status",
      bookingId: input.id,
      handled: false,
      createdAt: new Date().toISOString(),
    });

    s.logs.unshift({
      id: uid("log"),
      userId: input.actorId,
      userName: input.actorName,
      action: "booking_status",
      entityType: "booking",
      entityId: input.id,
      details: `预约 ${input.id} → ${input.status}`,
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);

    return { ok: true, booking: updated };
  });
}
