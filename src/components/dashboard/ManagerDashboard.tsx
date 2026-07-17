"use client";

import Link from "next/link";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { getLogs, getUsers } from "@/lib/storage/db";
import {
  DashboardView,
  filterDashboardLogs,
  pendingBookingsForManager,
} from "@/lib/dashboard";
import { canManageAnimals, canManageInstruments } from "@/lib/roles";

interface ManagerDashboardProps {
  view: Exclude<
    DashboardView,
    "student" | "research_assistant" | "veterinarian" | "animal_facility_supervisor"
  >;
}

export function ManagerDashboard({ view }: ManagerDashboardProps) {
  const { t, isZh, locale } = useLocale();
  const d = t.dashboard;
  const { user } = useAuth();
  const { instruments, animals, bookings } = useData();
  const users = getUsers();
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  if (!user) return null;

  const isAdmin = view === "admin";
  const isInst = isAdmin || canManageInstruments(user.roles);
  const isAnimal = isAdmin || canManageAnimals(user.roles);

  const myInstruments = isInst
    ? isAdmin
      ? instruments
      : instruments.filter((i) => i.contactUserId === user.id)
    : [];
  const myAnimals = isAnimal
    ? isAdmin
      ? animals
      : animals.filter((a) => a.contactUserId === user.id)
    : [];

  const pending = isAdmin
    ? bookings.filter((b) => b.status === "pending")
    : pendingBookingsForManager(user.id, user.roles, instruments, animals, bookings);

  const recentLogs = isAdmin
    ? getLogs().slice(0, 10)
    : filterDashboardLogs(getLogs(), user.id, user.roles, instruments, animals, bookings, 10);

  const stats = [
    ...(isInst
      ? [{ label: d.myInstruments, value: myInstruments.length, href: "/instruments", accent: "text-thu" }]
      : []),
    ...(isAnimal
      ? [{ label: d.myAnimals, value: myAnimals.length, href: "/animals/managed", accent: "text-indigo-700" }]
      : []),
    { label: d.pendingBookings, value: pending.length, href: "/bookings", accent: "text-amber-700" },
    {
      label: d.myApprovalLogs,
      value: recentLogs.length,
      href: "/logs",
      accent: "text-emerald-700",
    },
  ];

  function resourceName(booking: (typeof bookings)[0]) {
    if (booking.resourceType === "instrument") {
      const inst = instruments.find((i) => i.id === booking.resourceId);
      return inst ? (isZh ? inst.name : inst.nameEn) : booking.resourceId;
    }
    const ani = animals.find((a) => a.id === booking.resourceId);
    return ani ? (isZh ? ani.name : ani.nameEn) : booking.resourceId;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <GlassPanel className="mb-6 bg-gradient-to-r from-thu/10 via-white/50 to-indigo-100/40">
        <p className="text-sm text-lab-muted">{d.welcome}</p>
        <h2 className="mt-1 text-2xl font-bold text-thu">{user.name}</h2>
        <p className="mt-2 text-sm text-lab-text">
          {isAdmin ? d.adminHint : isInst ? d.instrumentMgrHint : d.animalMgrHint}
        </p>
      </GlassPanel>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
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
            <h3 className="font-semibold text-thu">{d.pendingApprovals}</h3>
            <Link href="/bookings" className="text-xs text-thu hover:underline">{d.viewAll}</Link>
          </div>
          <div className="space-y-2">
            {pending.length === 0 ? (
              <p className="text-sm text-lab-muted">{d.noPending}</p>
            ) : (
              pending.slice(0, 6).map((b) => {
                const applicant = users.find((u) => u.id === b.userId);
                return (
                  <Link
                    key={b.id}
                    href="/bookings"
                    className="flex items-center justify-between rounded-lg border border-white/40 bg-white/30 px-3 py-2.5 text-sm transition-colors hover:bg-white/50"
                  >
                    <div>
                      <p className="font-medium text-lab-text">{resourceName(b)}</p>
                      <p className="text-xs text-lab-muted">
                        {applicant?.name} · {new Date(b.startTime).toLocaleString(localeStr)}
                      </p>
                    </div>
                    <StatusBadge status={b.status} label={t.status[b.status]} />
                  </Link>
                );
              })
            )}
          </div>
        </GlassPanel>

        <GlassPanel>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-thu">
              {isAdmin ? d.recentLogs : d.myApprovalLogs}
            </h3>
            <Link href="/logs" className="text-xs text-thu hover:underline">{d.viewAll}</Link>
          </div>
          <div className="space-y-2">
            {recentLogs.length === 0 ? (
              <p className="text-sm text-lab-muted">{d.noLogs}</p>
            ) : (
              recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex justify-between gap-3 border-b border-white/30 pb-2 text-xs last:border-0"
                >
                  <span className="text-lab-text">{log.details}</span>
                  <span className="shrink-0 text-lab-muted">
                    {new Date(log.timestamp).toLocaleString(localeStr)}
                  </span>
                </div>
              ))
            )}
          </div>
        </GlassPanel>

        {isInst && myInstruments.length > 0 && (
          <GlassPanel className="lg:col-span-2">
            <h3 className="mb-4 font-semibold text-thu">{d.myInstrumentsTitle}</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {myInstruments.slice(0, 6).map((inst) => (
                <Link
                  key={inst.id}
                  href={`/instruments/${inst.id}`}
                  className="rounded-lg border border-white/40 bg-white/30 px-3 py-2 transition-colors hover:bg-white/50"
                >
                  <p className="text-sm font-medium text-lab-text">{isZh ? inst.name : inst.nameEn}</p>
                  <p className="text-xs text-lab-muted">{inst.location}</p>
                </Link>
              ))}
            </div>
          </GlassPanel>
        )}
      </div>
    </div>
  );
}
