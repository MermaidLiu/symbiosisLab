"use client";

import { use, useState } from "react";
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

export default function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, isZh, locale } = useLocale();
  const { user } = useAuth();
  const { animals, bookings, createBooking } = useData();
  const ani = animals.find((a) => a.id === id);
  const [purpose, setPurpose] = useState("");
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [msg, setMsg] = useState("");

  if (!ani) notFound();

  const contact = getUsers().find((u) => u.id === ani.contactUserId);
  const resourceBookings = bookings.filter((b) => b.resourceType === "animal" && b.resourceId === id);
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const sexLabel = { male: t.animals.male, female: t.animals.female, unknown: t.animals.unknown }[ani.sex];

  async function handleBook() {
    if (!user || !slot || !purpose.trim()) return;
    const result = await createBooking({
      resourceType: "animal",
      resourceId: id,
      userId: user.id,
      startTime: slot.start.toISOString(),
      endTime: slot.end.toISOString(),
      purpose,
    });
    setMsg(result.ok ? t.instruments.bookingSuccess : t.instruments.slotTaken);
    if (result.ok) {
      setSlot(null);
      setPurpose("");
    }
  }

  return (
    <>
      <PageHeader
        title={isZh ? ani.name : ani.nameEn}
        action={<Link href="/animals/managed"><Button variant="outline">{t.common.back}</Button></Link>}
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <StatusBadge status={ani.status} label={t.status[ani.status]} />
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-lab-muted">{t.animals.species}</dt><dd>{isZh ? ani.species : ani.speciesEn}</dd></div>
              <div><dt className="text-lab-muted">{t.animals.strain}</dt><dd>{ani.strain}</dd></div>
              <div><dt className="text-lab-muted">{t.animals.sex}</dt><dd>{sexLabel}</dd></div>
              <div><dt className="text-lab-muted">{t.common.location}</dt><dd>{ani.location}</dd></div>
              <div><dt className="text-lab-muted">{t.common.contact}</dt><dd className="text-thu">{contact?.name} · {ani.contactPhone}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-lab-text">{isZh ? ani.notes : ani.notesEn}</p>
          </Card>
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <h3 className="mb-3 font-semibold text-thu">{t.instruments.calendar}</h3>
              <WeekCalendar
                bookings={resourceBookings}
                selectedSlot={slot}
                currentUserId={user?.id}
                onSelectSlot={(s, e) => setSlot({ start: s, end: e })}
              />
            </Card>
            {slot && (
              <Card className="border-thu-subtle bg-thu-muted/30">
                <p className="text-sm font-medium text-thu-dark">{slot.start.toLocaleString(localeStr)} — {slot.end.toLocaleString(localeStr)}</p>
                <Textarea label={t.instruments.purpose} className="mt-3" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
                <Button className="mt-3" onClick={handleBook}>{t.animals.bookNow}</Button>
                {msg && <p className="mt-2 text-sm text-thu">{msg}</p>}
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
