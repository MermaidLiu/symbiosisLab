import { api } from "@/lib/api/client";
import { getNotifications, setCachePartial } from "@/lib/storage/db";
import { AppNotification } from "@/types";

export async function handleNotification(
  _userId: string,
  _userName: string,
  notificationId: string,
  action: "open" | "approve" | "reject" | "read",
  _notificationTitle: string
): Promise<void> {
  const data = await api.handleNotification(notificationId, action);
  setCachePartial({
    notifications: data.notifications,
    ...(data.bookings ? { bookings: data.bookings } : {}),
  });
}

export async function markNotificationRead(
  id: string,
  userId: string,
  userName: string
): Promise<void> {
  await handleNotification(userId, userName, id, "read", id);
}

export async function markAllNotificationsRead(
  _userId: string,
  _userName: string
): Promise<void> {
  const data = await api.markAllNotificationsRead();
  setCachePartial({ notifications: data.notifications });
}

export function unreadCount(userId: string): number {
  return getNotifications().filter((n) => n.userId === userId && !n.read).length;
}

/** @deprecated Server creates notifications; kept for type compatibility */
export function pushNotification(_input: unknown): AppNotification {
  throw new Error("pushNotification is server-side only");
}
