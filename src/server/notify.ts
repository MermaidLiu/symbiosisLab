import { Role, User } from "@/types";
import { DbStore, uid } from "@/server/store";
import { canManageAnimals, canManageInstruments, canProcessVeterinary } from "@/lib/roles";

/** Unique recipient user ids for a pending approval notification */
export function approverRecipientIds(
  store: DbStore,
  opts: {
    contactUserId?: string;
    resourceType?: "instrument" | "animal" | "custody" | "application" | "veterinary";
  }
): string[] {
  const ids = new Set<string>();
  if (opts.contactUserId) ids.add(opts.contactUserId);

  for (const u of store.users) {
    if (u.roles.includes("super_admin")) {
      ids.add(u.id);
      continue;
    }
    if (opts.resourceType === "instrument" && canManageInstruments(u.roles)) {
      ids.add(u.id);
    }
    if (
      (opts.resourceType === "animal" || opts.resourceType === "custody") &&
      canManageAnimals(u.roles)
    ) {
      ids.add(u.id);
    }
    if (opts.resourceType === "application" && canManageAnimals(u.roles)) {
      ids.add(u.id);
    }
    if (opts.resourceType === "veterinary" && canProcessVeterinary(u.roles)) {
      ids.add(u.id);
    }
  }

  return [...ids];
}

export function pushNotificationToUsers(
  store: DbStore,
  userIds: string[],
  payload: {
    title: string;
    titleEn: string;
    message: string;
    messageEn: string;
    link?: string;
    kind?: "info" | "booking_pending" | "booking_status" | "application_status" | "application_pending";
    bookingId?: string;
    applicationId?: string;
  },
  excludeUserId?: string
): void {
  const now = new Date().toISOString();
  for (const userId of userIds) {
    if (excludeUserId && userId === excludeUserId) continue;
    store.notifications.unshift({
      id: uid("ntf"),
      userId,
      title: payload.title,
      titleEn: payload.titleEn,
      message: payload.message,
      messageEn: payload.messageEn,
      read: false,
      link: payload.link,
      kind: payload.kind ?? "info",
      bookingId: payload.bookingId,
      applicationId: payload.applicationId,
      handled: false,
      createdAt: now,
    });
  }
}

export function userHasRole(user: User, role: Role): boolean {
  return user.roles.includes(role) || user.roles.includes("super_admin");
}
