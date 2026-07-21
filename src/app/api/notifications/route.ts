import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { updateBookingStatusAtomic } from "@/server/booking";
import { notificationVisibleToUser } from "@/server/instrument-scope";

function notificationsForUser(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const store = getStore();
  return store.notifications.filter((n) => notificationVisibleToUser(n, user, store));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ notifications: notificationsForUser(user) });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "read");
  const notificationId = body.id ? String(body.id) : null;

  if (action === "mark_all_read") {
    const store = getStore();
    const visible = store.notifications.filter((n) => notificationVisibleToUser(n, user, store));
    const visibleIds = new Set(visible.map((n) => n.id));
    const unread = visible.filter((n) => !n.read);
    await mutateStore((s) => {
      s.notifications = s.notifications.map((n) =>
        visibleIds.has(n.id) ? { ...n, read: true } : n
      );
    });
    for (const n of unread) {
      await appendAuditLog({
        userId: user.id,
        userName: user.name,
        action: "notification_handle",
        entityType: "notification",
        entityId: n.id,
        details: `全部标为已读: ${n.title}`,
      });
    }
    return jsonOk({
      notifications: notificationsForUser(user),
    });
  }

  if (!notificationId) return jsonError("invalid_body", 400);

  const store = getStore();
  const target = store.notifications.find((n) => n.id === notificationId && n.userId === user.id);
  if (!target) return jsonError("not_found", 404);
  if (!notificationVisibleToUser(target, user, store)) return jsonError("forbidden", 403);

  // Approve/reject first — if slot conflict, do not mark notification handled
  if ((action === "approve" || action === "reject") && target.bookingId) {
    const status = action === "approve" ? "approved" : "rejected";
    const bookingResult = await updateBookingStatusAtomic({
      id: target.bookingId,
      status,
      actorId: user.id,
      actorName: user.name,
    });
    if (!bookingResult.ok) {
      const code = bookingResult.error === "slot_taken" ? 409 : 404;
      return jsonError(bookingResult.error, code);
    }
  }

  await mutateStore((s) => {
    s.notifications = s.notifications.map((n) => {
      if (n.id !== notificationId || n.userId !== user.id) return n;
      return {
        ...n,
        read: true,
        handled: action === "approve" || action === "reject" ? true : n.handled,
      };
    });
    // After approve/reject, clear pending actions for the same booking/application for everyone
    if ((action === "approve" || action === "reject") && (target.bookingId || target.applicationId)) {
      s.notifications = s.notifications.map((n) => {
        const sameBooking = Boolean(target.bookingId && n.bookingId === target.bookingId);
        const sameApp = Boolean(target.applicationId && n.applicationId === target.applicationId);
        if (!sameBooking && !sameApp) return n;
        return { ...n, handled: true, read: n.userId === user.id ? true : n.read };
      });
    }
  });

  const actionLabels: Record<string, string> = {
    open: "打开通知",
    approve: "批准预约",
    reject: "拒绝预约",
    read: "标记已读",
  };

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "notification_handle",
    entityType: "notification",
    entityId: notificationId,
    details: `${actionLabels[action] ?? action}: ${target.title}`,
  });

  return jsonOk({
    notifications: notificationsForUser(user),
    bookings: getStore().bookings,
  });
}
