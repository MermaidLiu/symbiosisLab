"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getNotifications, setCachePartial } from "@/lib/storage/db";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";
import { api } from "@/lib/api/client";
import { AppNotification } from "@/types";

export default function NotificationsPage() {
  const { t, isZh, locale } = useLocale();
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const { notifications } = await api.notifications();
        setCachePartial({ notifications });
        setItems(notifications.filter((n) => n.userId === user.id));
      } catch {
        setItems(getNotifications().filter((n) => n.userId === user.id));
      }
    })();
  }, [user]);

  if (!user) return null;

  function refresh() {
    setItems(getNotifications().filter((n) => n.userId === user!.id));
  }

  async function acknowledge(n: AppNotification) {
    try {
      const data = await api.handleNotification(n.id, "acknowledge");
      setCachePartial({ notifications: data.notifications });
      refresh();
    } catch {
      await markNotificationRead(n.id, user.id, user.name);
      refresh();
    }
    if (n.link) router.push(n.link);
  }

  const unread = items.filter((n) => !n.read).length;
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  return (
    <>
      <PageHeader
        title={t.notifications.title}
        action={
          unread > 0 ? (
            <Button
              variant="outline"
              onClick={() => {
                markAllNotificationsRead(user.id, user.name);
                refresh();
              }}
            >
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
                  <div className="flex flex-wrap justify-end gap-2">
                    {n.kind === "animal_death" && !n.handled ? (
                      <Button size="sm" variant="secondary" onClick={() => void acknowledge(n)}>
                        我已知晓
                      </Button>
                    ) : null}
                    {n.kind === "animal_death" && n.handled && n.link ? (
                      <Link href={n.link}>
                        <Button size="sm" variant="outline">
                          查看死亡详情
                        </Button>
                      </Link>
                    ) : null}
                    {n.kind !== "animal_death" && !n.read ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          markNotificationRead(n.id, user.id, user.name);
                          refresh();
                        }}
                      >
                        ✓
                      </Button>
                    ) : null}
                    {n.kind !== "animal_death" && n.link ? (
                      <Link href={n.link}>
                        <Button size="sm" variant="outline">
                          {t.common.detail}
                        </Button>
                      </Link>
                    ) : null}
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
