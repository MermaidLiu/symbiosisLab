"use client";

import Link from "next/link";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { getCages, getManagedAnimals } from "@/lib/storage/db";

export function StudentDashboard() {
  const { t, isZh, locale } = useLocale();
  const d = t.dashboard;
  const { user } = useAuth();
  const { instruments, animals, bookings } = useData();
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";
  const managedAnimals = getManagedAnimals();
  const cages = getCages();

  const availableInstruments = instruments.filter((i) => i.status === "available");
  const maintenanceInstruments = instruments.filter((i) => i.status === "maintenance");
  const trainingRequired = availableInstruments.filter((i) => i.trainingRequired);
  const myBookings = bookings.filter((b) => b.userId === user?.id);
  const myPending = myBookings.filter((b) => b.status === "pending");
  const myApproved = myBookings.filter((b) => b.status === "approved");
  const vacantCages = cages.filter((c) => c.status === "vacant").length;
  const activeManaged = managedAnimals.filter((a) => a.status === "active").length;

  const speciesMap = animals.reduce<Record<string, number>>((acc, a) => {
    const key = isZh ? a.species : a.speciesEn;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const upcoming = myBookings
    .filter((b) => b.status === "approved" || b.status === "pending")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <GlassPanel className="mb-6 bg-gradient-to-r from-thu/10 via-white/50 to-tsinghua-yellow/10">
        <p className="text-sm text-lab-muted">{d.welcome}</p>
        <h2 className="mt-1 text-2xl font-bold text-thu">{user?.name}</h2>
        <p className="mt-2 text-sm text-lab-text">{d.studentHint}</p>
      </GlassPanel>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: d.availableInstruments, value: availableInstruments.length, href: "/instruments", accent: "text-thu" },
          { label: d.managedAnimals, value: activeManaged, href: "/animals/managed", accent: "text-indigo-700" },
          { label: d.vacantCages, value: vacantCages, href: "/animals/cages", accent: "text-emerald-700" },
          { label: d.myBookings, value: myBookings.length, href: "/bookings", accent: "text-amber-700" },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <GlassPanel className="transition-all hover:-translate-y-0.5 hover:shadow-fluent-lg">
              <p className="text-xs text-lab-muted">{stat.label}</p>
              <p className={`mt-1 text-3xl font-bold ${stat.accent}`}>{stat.value}</p>
            </GlassPanel>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-thu">{d.availableInstrumentsTitle}</h3>
            <Link href="/instruments" className="text-xs text-thu hover:underline">{d.viewAll}</Link>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="fluent-badge rounded-full px-2 py-0.5">{d.noTraining}: {availableInstruments.length - trainingRequired.length}</span>
            <span className="fluent-badge rounded-full px-2 py-0.5">{d.needsTraining}: {trainingRequired.length}</span>
            <span className="fluent-badge rounded-full px-2 py-0.5">{d.maintenance}: {maintenanceInstruments.length}</span>
          </div>
          <div className="space-y-2">
            {availableInstruments.length === 0 ? (
              <p className="text-sm text-lab-muted">{t.common.noResults}</p>
            ) : (
              availableInstruments.slice(0, 6).map((inst) => (
                <Link
                  key={inst.id}
                  href={`/instruments/${inst.id}`}
                  className="flex items-center justify-between rounded-lg border border-white/40 bg-white/30 px-3 py-2.5 text-sm transition-colors hover:bg-white/50"
                >
                  <div>
                    <p className="font-medium text-lab-text">{isZh ? inst.name : inst.nameEn}</p>
                    <p className="text-xs text-lab-muted">{inst.location}</p>
                  </div>
                  {inst.trainingRequired && (
                    <span className="text-[10px] text-thu">{t.instruments.trainingRequired}</span>
                  )}
                </Link>
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel>
          <h3 className="mb-4 font-semibold text-thu">{d.animalOverview}</h3>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/35 p-3">
              <p className="text-xs text-lab-muted">{d.animalColonies}</p>
              <p className="text-2xl font-bold text-thu">{animals.length}</p>
            </div>
            <div className="rounded-lg bg-white/35 p-3">
              <p className="text-xs text-lab-muted">{d.managedAnimals}</p>
              <p className="text-2xl font-bold text-indigo-700">{managedAnimals.length}</p>
            </div>
          </div>
          <p className="mb-2 text-xs font-medium text-lab-muted">{d.speciesBreakdown}</p>
          <div className="space-y-2">
            {Object.entries(speciesMap).map(([species, count]) => (
              <div key={species} className="flex items-center justify-between rounded-lg bg-white/30 px-3 py-2 text-sm">
                <span>{species}</span>
                <span className="font-semibold text-thu">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/animals/managed" className="fluent-badge rounded-full px-3 py-1 text-xs hover:bg-white/70">{d.browseManaged}</Link>
            <Link href="/animals/cages" className="fluent-badge rounded-full px-3 py-1 text-xs hover:bg-white/70">{d.browseCages}</Link>
            <Link href="/animals/applications" className="fluent-badge rounded-full px-3 py-1 text-xs hover:bg-white/70">{d.newApplication}</Link>
          </div>
        </GlassPanel>

        <GlassPanel>
          <h3 className="mb-4 font-semibold text-thu">{d.myBookingStatus}</h3>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-amber-50/60 p-2">
              <p className="text-lg font-bold text-amber-700">{myPending.length}</p>
              <p className="text-[10px] text-lab-muted">{t.status.pending}</p>
            </div>
            <div className="rounded-lg bg-emerald-50/60 p-2">
              <p className="text-lg font-bold text-emerald-700">{myApproved.length}</p>
              <p className="text-[10px] text-lab-muted">{t.status.approved}</p>
            </div>
            <div className="rounded-lg bg-white/40 p-2">
              <p className="text-lg font-bold text-thu">{myBookings.length}</p>
              <p className="text-[10px] text-lab-muted">{d.total}</p>
            </div>
          </div>
          <div className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-lab-muted">{d.noUpcoming}</p>
            ) : (
              upcoming.map((b) => {
                const inst = instruments.find((i) => i.id === b.resourceId);
                const ani = animals.find((a) => a.id === b.resourceId);
                const name = inst ? (isZh ? inst.name : inst.nameEn) : ani ? (isZh ? ani.name : ani.nameEn) : b.resourceId;
                return (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border border-white/40 bg-white/30 px-3 py-2 text-xs">
                    <div>
                      <p className="font-medium text-lab-text">{name}</p>
                      <p className="text-lab-muted">
                        {new Date(b.startTime).toLocaleString(localeStr)} — {new Date(b.endTime).toLocaleString(localeStr)}
                      </p>
                    </div>
                    <StatusBadge status={b.status} label={t.status[b.status]} />
                  </div>
                );
              })
            )}
          </div>
          <Link href="/bookings" className="mt-3 inline-block text-xs text-thu hover:underline">{d.viewAllBookings}</Link>
        </GlassPanel>

        <GlassPanel>
          <h3 className="mb-4 font-semibold text-thu">{d.quickStart}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { href: "/instruments", label: d.bookInstrument, desc: d.bookInstrumentDesc },
              { href: "/animals/managed", label: d.applyCustody, desc: d.applyCustodyDesc },
              { href: "/animals/applications", label: d.newApplication, desc: d.newApplicationDesc },
              { href: "/bookings", label: d.viewAllBookings, desc: d.viewBookingsDesc },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-white/40 bg-white/30 p-3 transition-all hover:bg-white/55 hover:shadow-sm"
              >
                <p className="text-sm font-medium text-thu">{item.label}</p>
                <p className="mt-1 text-xs text-lab-muted">{item.desc}</p>
              </Link>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
