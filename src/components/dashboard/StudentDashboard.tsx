"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { api } from "@/lib/api/client";
import { getApplications, getManagedAnimals, setCachePartial } from "@/lib/storage/db";
import { normalizePurpose } from "@/lib/animals/facility-board";
import {
  ApplicationWorkflowStatus,
  ManagedAnimal,
  OperationApplication,
} from "@/types/animal-management";

const APP_STATUS_TIP: Record<ApplicationWorkflowStatus, string> = {
  pending_receipt: "bg-[#FFF8E1] text-[#F57F17] ring-[#FFE082]",
  received: "bg-[#E3F2FD] text-[#1565C0] ring-[#90CAF9]",
  awaiting_conditions: "bg-[#F3E5F5] text-[#7B1FA2] ring-[#CE93D8]",
  completed: "bg-[#E8F5E9] text-[#2E7D32] ring-[#A5D6A7]",
  rejected: "bg-[#FFEBEE] text-[#C62828] ring-[#EF9A9A]",
};

export function StudentDashboard() {
  const { t, isZh, locale } = useLocale();
  const d = t.dashboard;
  const s = t.dashboard.student;
  const m = t.animalMgmt.managed;
  const a = t.animalMgmt.applications;
  const { user } = useAuth();
  const { instruments, bookings } = useData();
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const [applications, setApplications] = useState<OperationApplication[]>([]);
  const [managed, setManaged] = useState<ManagedAnimal[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [appsRes, animalsRes] = await Promise.all([
          api.applications(),
          api.managedAnimals(),
        ]);
        setCachePartial({
          applications: appsRes.applications,
          managedAnimals: animalsRes.managedAnimals,
        });
        setApplications(appsRes.applications);
        setManaged(animalsRes.managedAnimals);
      } catch {
        setApplications(getApplications());
        setManaged(getManagedAnimals());
      }
    })();
  }, []);

  const myBookings = useMemo(
    () => bookings.filter((b) => b.userId === user?.id),
    [bookings, user?.id]
  );
  const myPendingBookings = myBookings.filter((b) => b.status === "pending");
  const myApprovedBookings = myBookings.filter((b) => b.status === "approved");

  const myApps = useMemo(
    () => applications.filter((app) => app.applicantUserId === user?.id),
    [applications, user?.id]
  );
  const myCustody = useMemo(
    () => myApps.filter((app) => app.type === "custody"),
    [myApps]
  );
  const myPendingClaims = myCustody.filter((app) => app.status === "pending_receipt");
  const myCompletedClaims = myCustody.filter((app) => app.status === "completed");

  const myAnimals = useMemo(
    () => managed.filter((x) => x.claimantUserId === user?.id),
    [managed, user?.id]
  );

  const claimableCount = useMemo(
    () =>
      managed.filter((x) => {
        const purpose = normalizePurpose(x.purpose);
        if (purpose === "blank") return false;
        if (x.claimantUserId && x.claimantUserId !== user?.id) return false;
        if (x.status === "deceased") return false;
        const pending = applications.some(
          (app) =>
            app.type === "custody" &&
            app.status === "pending_receipt" &&
            app.animalIds?.includes(x.id)
        );
        return !pending;
      }).length,
    [managed, applications, user?.id]
  );

  const upcoming = useMemo(
    () =>
      myBookings
        .filter((b) => b.status === "approved" || b.status === "pending")
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 6),
    [myBookings]
  );

  const recentClaims = useMemo(
    () =>
      [...myCustody]
        .sort((a, b) => b.applicationTime.localeCompare(a.applicationTime))
        .slice(0, 6),
    [myCustody]
  );

  function purposeLabel(p?: ManagedAnimal["purpose"]) {
    const purpose = normalizePurpose(p);
    if (purpose === "signal_processing") return m.purposeSignal;
    if (purpose === "immunity") return m.purposeImmunity;
    if (purpose === "breeding") return m.purposeBreeding;
    return m.purposeBlank;
  }

  function appStatusLabel(status: ApplicationWorkflowStatus) {
    const map: Record<ApplicationWorkflowStatus, string> = {
      pending_receipt: a.tabPending,
      received: a.tabReceived,
      awaiting_conditions: a.tabAwaiting,
      completed: a.tabCompleted,
      rejected: a.tabRejected,
    };
    return map[status];
  }

  function resourceName(booking: (typeof bookings)[0]) {
    const inst = instruments.find((i) => i.id === booking.resourceId);
    if (inst) return isZh ? inst.name : inst.nameEn;
    return booking.resourceId;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title={d.title} subtitle={s.subtitle} />
      <div className="fluent-mica-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6">
        <GlassPanel className="mb-5 bg-gradient-to-r from-thu/10 via-white/50 to-tsinghua-yellow/10">
          <p className="text-sm text-lab-muted">{d.welcome}</p>
          <h2 className="mt-1 text-2xl font-bold text-thu">{user?.name}</h2>
          <p className="mt-2 text-sm text-lab-text">{s.hint}</p>
        </GlassPanel>

        <GlassPanel padding={false} className="mb-5 overflow-hidden">
          <div className="grid grid-cols-2 gap-px bg-white/30 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={s.statPendingBookings} value={myPendingBookings.length} accent="text-amber-700" />
            <Stat label={s.statApprovedBookings} value={myApprovedBookings.length} accent="text-emerald-700" />
            <Stat label={s.statPendingClaims} value={myPendingClaims.length} accent="text-[#F57F17]" />
            <Stat label={s.statMyAnimals} value={myAnimals.length} accent="text-[#82318E]" />
            <Stat label={s.statClaimable} value={claimableCount} accent="text-[#5BA4E8]" />
            <Stat label={s.statDoneClaims} value={myCompletedClaims.length} accent="text-thu" />
          </div>
        </GlassPanel>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/instruments", label: d.bookInstrument, desc: d.bookInstrumentDesc },
            { href: "/animals/managed", label: s.claimAnimals, desc: s.claimAnimalsDesc },
            { href: "/bookings", label: d.viewAllBookings, desc: d.viewBookingsDesc },
            { href: "/animals/applications", label: s.myApplications, desc: s.myApplicationsDesc },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-[#E0D4E8] bg-white/55 p-3 transition hover:bg-white/80 hover:shadow-sm"
            >
              <p className="text-sm font-semibold text-thu">{item.label}</p>
              <p className="mt-1 text-xs text-lab-muted">{item.desc}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassPanel>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-thu">{s.myBookingsTitle}</h3>
              <Link href="/bookings" className="text-xs text-thu hover:underline">
                {d.viewAll}
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-lab-muted">{d.noUpcoming}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/40 bg-white/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-lab-text">{resourceName(b)}</p>
                      <p className="text-[11px] text-lab-muted">
                        {new Date(b.startTime).toLocaleString(localeStr, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {new Date(b.endTime).toLocaleString(localeStr, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <StatusBadge status={b.status} label={t.status[b.status]} />
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-thu">{s.myClaimsTitle}</h3>
              <Link href="/animals/applications" className="text-xs text-thu hover:underline">
                {d.viewAll}
              </Link>
            </div>
            {recentClaims.length === 0 ? (
              <p className="text-sm text-lab-muted">{s.noClaims}</p>
            ) : (
              <ul className="space-y-2">
                {recentClaims.map((app) => (
                  <li
                    key={app.id}
                    className="rounded-lg border border-white/40 bg-white/40 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-thu">{app.id}</p>
                        <p className="mt-0.5 truncate text-xs text-lab-text">{app.description}</p>
                        <p className="mt-0.5 text-[11px] text-lab-muted">
                          {new Date(app.applicationTime).toLocaleString(localeStr)}
                          {app.animalIds?.length
                            ? ` · ${app.animalIds.length} ${s.animalsUnit}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                          APP_STATUS_TIP[app.status]
                        )}
                      >
                        {appStatusLabel(app.status)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassPanel>

          <GlassPanel className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-thu">{s.myAnimalsTitle}</h3>
              <Link href="/animals/managed" className="text-xs text-thu hover:underline">
                {s.goClaim}
              </Link>
            </div>
            {myAnimals.length === 0 ? (
              <p className="text-sm text-lab-muted">{s.noMyAnimals}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E0D4E8] text-[11px] text-lab-muted">
                      <th className="px-2 py-2 font-semibold">{m.colId}</th>
                      <th className="px-2 py-2 font-semibold">{m.colPurpose}</th>
                      <th className="px-2 py-2 font-semibold">{m.colCage}</th>
                      <th className="px-2 py-2 font-semibold">{m.colStatus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myAnimals.slice(0, 8).map((row, idx) => (
                      <tr
                        key={row.id}
                        className={clsx(
                          "border-b border-[#EDE4F2]",
                          idx % 2 === 0 ? "bg-white" : "bg-[#F7F1FA]"
                        )}
                      >
                        <td className="px-2 py-2 font-mono text-xs text-thu">{row.id}</td>
                        <td className="px-2 py-2 text-xs">{purposeLabel(row.purpose)}</td>
                        <td className="px-2 py-2 text-xs">{row.cageLocation}</td>
                        <td className="px-2 py-2 text-xs">
                          {row.status === "active"
                            ? m.statusActive
                            : row.status === "deceased"
                              ? m.statusDeceased
                              : row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="bg-white/55 px-3 py-3 text-center sm:text-left">
      <p className="text-[10px] text-lab-muted">{label}</p>
      <p className={clsx("mt-0.5 text-xl font-semibold tabular-nums", accent ?? "text-thu")}>
        {value}
      </p>
    </div>
  );
}
