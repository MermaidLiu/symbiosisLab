"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WeekCalendar } from "@/components/booking/WeekCalendar";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { getUsers } from "@/lib/storage/db";
import { canManageInstruments } from "@/lib/roles";
import { exportBookingsToCsv } from "@/lib/export";

export default function InstrumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, isZh, locale } = useLocale();
  const { user } = useAuth();
  const { instruments, bookings, createBooking } = useData();
  const inst = instruments.find((i) => i.id === id);
  const [purpose, setPurpose] = useState("");
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [msg, setMsg] = useState("");

  const contact = inst ? getUsers().find((u) => u.id === inst.contactUserId) : undefined;
  const users = getUsers();
  const resourceBookings = useMemo(
    () => (inst ? bookings.filter((b) => b.resourceType === "instrument" && b.resourceId === id) : []),
    [bookings, id, inst]
  );
  const historyBookings = useMemo(
    () =>
      [...resourceBookings].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      ),
    [resourceBookings]
  );

  if (!inst) notFound();

  const isManager = user && canManageInstruments(user.roles);
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  async function handleBook() {
    if (!inst || !user || !slot || !purpose.trim()) return;
    const hours = (slot.end.getTime() - slot.start.getTime()) / 3600000;
    if (hours < inst.minBookingHours || hours > inst.maxBookingHours) {
      setMsg(`${t.instruments.bookingRules}: ${inst.minBookingHours}–${inst.maxBookingHours} ${t.instruments.hours}`);
      return;
    }
    const result = await createBooking({
      resourceType: "instrument",
      resourceId: id,
      userId: user.id,
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      purpose,
    });
    if (result.ok) {
      setMsg(t.instruments.bookingSuccess);
      setPurpose("");
    } else {
      setMsg(t.instruments.slotTaken);
    }
  }

  function handleExportHistory() {
    exportBookingsToCsv(
      historyBookings,
      [
        t.instruments.historyUser,
        t.instruments.historyStart,
        t.instruments.historyEnd,
        t.instruments.historyPurpose,
        t.instruments.historyStatus,
      ],
      (b) => {
        const u = users.find((x) => x.id === b.userId);
        return [
          u?.name ?? b.userId,
          new Date(b.startTime).toLocaleString(localeStr),
          new Date(b.endTime).toLocaleString(localeStr),
          b.purpose,
          t.status[b.status],
        ];
      }
    );
  }

  return (
    <>
      <PageHeader
        title={isZh ? inst.name : inst.nameEn}
        action={
          <Link href="/instruments">
            <Button variant="outline">{t.common.back}</Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <Card>
              <StatusBadge status={inst.status} label={t.status[inst.status]} />
              <p className="mt-3 text-sm text-lab-text">{isZh ? inst.description : inst.descriptionEn}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-lab-muted">{t.common.location}</dt>
                  <dd className="font-medium">{inst.location}</dd>
                </div>
                <div>
                  <dt className="text-lab-muted">{t.common.contact}</dt>
                  <dd className="font-medium text-thu">
                    {contact?.name} · {inst.contactPhone}
                  </dd>
                </div>
                <div>
                  <dt className="text-lab-muted">{t.instruments.bookingRules}</dt>
                  <dd>
                    {inst.minBookingHours}–{inst.maxBookingHours} {t.instruments.hours}
                  </dd>
                </div>
                <div>
                  <dt className="text-lab-muted">{t.instruments.trainingRequired}</dt>
                  <dd className="font-medium">
                    {inst.trainingRequired ? t.instruments.trainingRequired : t.instruments.trainingNotRequired}
                  </dd>
                </div>
              </dl>
              {inst.specs.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-lab-muted">{t.instruments.specs}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {inst.specs.map((s) => (
                      <li key={s.key}>
                        <span className="text-lab-muted">{s.key}:</span> {s.value}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {inst.accessories.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-lab-muted">{t.instruments.accessories}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {inst.accessories.map((a) => (
                      <li key={a.name}>
                        {isZh ? a.name : a.nameEn}
                        <span className="ml-1 text-lab-muted">×{a.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <h3 className="mb-3 font-semibold text-thu">{t.instruments.calendar}</h3>
              <WeekCalendar
                bookings={resourceBookings}
                selectedSlot={slot}
                currentUserId={user?.id}
                onSelectSlot={(start, end) => {
                  setSlot({ start, end });
                  setMsg("");
                }}
              />
            </Card>

            {slot && (
              <Card className="border-thu-subtle bg-thu-muted/30">
                <p className="text-sm font-medium text-thu-dark">
                  {slot.start.toLocaleString(localeStr)} — {slot.end.toLocaleString(localeStr)}
                </p>
                <Textarea
                  label={t.instruments.purpose}
                  className="mt-3"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
                <div className="mt-3 flex gap-2">
                  <Button onClick={handleBook}>{t.instruments.submitBooking}</Button>
                  <Button variant="ghost" onClick={() => setSlot(null)}>{t.common.cancel}</Button>
                </div>
                {msg && <p className="mt-2 text-sm text-thu">{msg}</p>}
              </Card>
            )}

            {isManager && (
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-thu">{t.instruments.bookingHistory}</h3>
                  <Button variant="outline" size="sm" onClick={handleExportHistory}>
                    {t.instruments.downloadExcel}
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-lab-border text-lab-muted">
                        <th className="py-2 pr-3">{t.instruments.historyUser}</th>
                        <th className="py-2 pr-3">{t.instruments.historyStart}</th>
                        <th className="py-2 pr-3">{t.instruments.historyEnd}</th>
                        <th className="py-2 pr-3">{t.instruments.historyPurpose}</th>
                        <th className="py-2">{t.instruments.historyStatus}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyBookings.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-lab-muted">
                            {t.common.noResults}
                          </td>
                        </tr>
                      ) : (
                        historyBookings.map((b) => {
                          const u = users.find((x) => x.id === b.userId);
                          return (
                            <tr key={b.id} className="border-b border-lab-border/50">
                              <td className="py-2 pr-3">{u?.name}</td>
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {new Date(b.startTime).toLocaleString(localeStr)}
                              </td>
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {new Date(b.endTime).toLocaleString(localeStr)}
                              </td>
                              <td className="max-w-[160px] truncate py-2 pr-3">{b.purpose}</td>
                              <td className="py-2">
                                <StatusBadge status={b.status} label={t.status[b.status]} />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
