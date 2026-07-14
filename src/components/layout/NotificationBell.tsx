"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getNotifications, setCachePartial, hydrateFromApi } from "@/lib/storage/db";
import { handleNotification, unreadCount } from "@/lib/notifications";
import { api } from "@/lib/api/client";
import { AppNotification } from "@/types";
import { Button } from "@/components/ui/Button";

export function NotificationBell() {
  const { user } = useAuth();
  const { refresh: refreshData } = useData();
  const { t, isZh, locale } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { notifications } = await api.notifications();
      setCachePartial({ notifications });
      setItems(
        notifications
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 20)
      );
      tick((n) => n + 1);
    } catch {
      setItems(
        getNotifications()
          .filter((n) => n.userId === user.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 20)
      );
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!user) return null;

  const unread = unreadCount(user.id);
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  async function onHandle(
    n: AppNotification,
    action: "read" | "approve" | "reject" | "open"
  ) {
    await handleNotification(user!.id, user!.name, n.id, action === "open" ? "open" : action, isZh ? n.title : n.titleEn);
    if (action === "approve" || action === "reject") {
      await hydrateFromApi();
      await refreshData();
    }
    if (action === "open" && n.link) router.push(n.link);
    await refresh();
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="relative rounded-lg p-2 text-thu hover:bg-thu-muted"
        aria-label={t.notifications.title}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-tsinghua-yellow px-1 text-[10px] font-bold text-thu-dark">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-lab-border bg-white shadow-lg">
          <div className="border-b border-lab-border px-4 py-2.5">
            <p className="text-sm font-semibold text-thu">{t.notifications.title}</p>
            {unread > 0 && (
              <p className="text-[10px] text-lab-muted">
                {unread} {t.notifications.unread}
              </p>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-lab-muted">{t.notifications.empty}</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={clsx(
                    "border-b border-lab-border/50 px-4 py-3 last:border-0",
                    !n.read && "bg-tsinghua-yellow-light/30"
                  )}
                >
                  <p className="text-xs font-medium text-thu">{isZh ? n.title : n.titleEn}</p>
                  <p className="mt-0.5 text-[11px] text-lab-text">{isZh ? n.message : n.messageEn}</p>
                  <p className="mt-1 text-[10px] text-lab-muted">
                    {new Date(n.createdAt).toLocaleString(localeStr)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {n.kind === "booking_pending" && n.bookingId && !n.handled && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => onHandle(n, "approve")}>
                          {t.bookings.approve}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onHandle(n, "reject")}>
                          {t.bookings.reject}
                        </Button>
                      </>
                    )}
                    {n.link && (
                      <Button size="sm" variant="ghost" onClick={() => onHandle(n, "open")}>
                        {t.notifications.handle}
                      </Button>
                    )}
                    {!n.link && n.kind !== "booking_pending" && !n.read && (
                      <Button size="sm" variant="ghost" onClick={() => onHandle(n, "read")}>
                        {t.notifications.markRead}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-lab-border px-4 py-2 text-center">
            <Link href="/notifications" className="text-[11px] text-thu hover:underline">
              {t.notifications.viewAll}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
