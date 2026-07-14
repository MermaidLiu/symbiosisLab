"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { canManageInstruments, canManageAnimals } from "@/lib/roles";
import { getUsers } from "@/lib/storage/db";

export default function BookingsPage() {
  const { t, isZh, locale } = useLocale();
  const { user } = useAuth();
  const { bookings, instruments, animals, updateBookingStatus } = useData();
  const users = getUsers();
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  if (!user) return null;

  const mine = bookings.filter((b) => b.userId === user.id);
  const pending = bookings.filter((b) => {
    if (b.status !== "pending") return false;
    if (user.roles.includes("super_admin")) return true;
    const inst = instruments.find((i) => i.id === b.resourceId && b.resourceType === "instrument");
    const ani = animals.find((a) => a.id === b.resourceId && b.resourceType === "animal");
    return inst?.contactUserId === user.id || ani?.contactUserId === user.id;
  });

  function resourceName(b: (typeof bookings)[0]) {
    if (b.resourceType === "instrument") {
      const i = instruments.find((x) => x.id === b.resourceId);
      return i ? (isZh ? i.name : i.nameEn) : b.resourceId;
    }
    const a = animals.find((x) => x.id === b.resourceId);
    return a ? (isZh ? a.name : a.nameEn) : b.resourceId;
  }

  function renderTable(items: typeof bookings, showActions: boolean) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-lab-border text-xs text-lab-muted">
              <th className="py-2 pr-4">{t.bookings.resource}</th>
              <th className="py-2 pr-4">{t.bookings.time}</th>
              <th className="py-2 pr-4">{t.bookings.purpose}</th>
              <th className="py-2 pr-4">{t.common.status}</th>
              {showActions && <th className="py-2">{t.common.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((b) => {
              const booker = users.find((u) => u.id === b.userId);
              return (
                <tr key={b.id} className="border-b border-lab-border/50">
                  <td className="py-3 pr-4 font-medium text-thu">{resourceName(b)}</td>
                  <td className="py-3 pr-4 text-xs text-lab-muted">
                    {new Date(b.startTime).toLocaleString(localeStr)}
                    <br />
                    {new Date(b.endTime).toLocaleString(localeStr)}
                  </td>
                  <td className="py-3 pr-4 text-xs">{b.purpose}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={b.status} label={t.status[b.status]} />
                    {showActions && booker && (
                      <p className="mt-1 text-[10px] text-lab-muted">{booker.name}</p>
                    )}
                  </td>
                  {showActions && (
                    <td className="py-3 space-x-1">
                      <Button size="sm" variant="secondary" onClick={() => updateBookingStatus(b.id, "approved")}>
                        {t.bookings.approve}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateBookingStatus(b.id, "rejected")}>
                        {t.bookings.reject}
                      </Button>
                    </td>
                  )}
                  {!showActions && b.status === "pending" && (
                    <td className="py-3">
                      <Button size="sm" variant="ghost" onClick={() => updateBookingStatus(b.id, "cancelled")}>
                        {t.bookings.cancel}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const canApprove =
    user.roles.includes("super_admin") ||
    canManageInstruments(user.roles) ||
    canManageAnimals(user.roles);

  return (
    <>
      <PageHeader title={t.bookings.title} subtitle={t.bookings.subtitle} />
      <div className="flex-1 overflow-y-auto space-y-6 p-6">
        <Card>
          <h3 className="mb-3 font-semibold text-thu">{t.bookings.mine}</h3>
          {mine.length === 0 ? <p className="text-sm text-lab-muted">{t.common.noResults}</p> : renderTable(mine, false)}
        </Card>
        {canApprove && pending.length > 0 && (
          <Card>
            <h3 className="mb-3 font-semibold text-tsinghua-yellow-dark">{t.bookings.pending}</h3>
            {renderTable(pending, true)}
          </Card>
        )}
      </div>
    </>
  );
}
