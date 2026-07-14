"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getNotifications } from "@/lib/storage/db";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { AppNotification } from "@/types";

export default function NotificationsPage() {
  const { t, isZh, locale } = useLocale();
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    setItems(getNotifications().filter((n) => n.userId === user.id));
  }, [user]);

  if (!user) return null;

  function refresh() {
    setItems(getNotifications().filter((n) => n.userId === user!.id));
  }

  const unread = items.filter((n) => !n.read).length;
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  return (
    <>
      <PageHeader
        title={t.notifications.title}
        action={
          unread > 0 ? (
            <Button variant="outline" onClick={() => { markAllNotificationsRead(user.id, user.name); refresh(); }}>
              {t.notifications.markAllRead}
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        {unread > 0 && (
          <p className="mb-4 text-sm text-thu">
            {unread} {t.notifications.unread}
          </p>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-lab-muted">{t.notifications.empty}</p>
        ) : (
          <div className="space-y-3">
            {items.map((n) => (
              <Card
                key={n.id}
                className={n.read ? "opacity-70" : "border-tsinghua-yellow bg-tsinghua-yellow-light/20"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-thu">{isZh ? n.title : n.titleEn}</h3>
                    <p className="mt-1 text-sm text-lab-text">{isZh ? n.message : n.messageEn}</p>
                    <p className="mt-2 text-[10px] text-lab-muted">
                      {new Date(n.createdAt).toLocaleString(localeStr)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!n.read && (
                      <Button size="sm" variant="ghost" onClick={() => { markNotificationRead(n.id, user.id, user.name); refresh(); }}>
                        ✓
                      </Button>
                    )}
                    {n.link && (
                      <Link href={n.link}>
                        <Button size="sm" variant="outline">{t.common.detail}</Button>
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
