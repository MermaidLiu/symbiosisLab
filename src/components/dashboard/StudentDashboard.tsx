"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentModal } from "@/components/fluent/FluentModal";
import { FluentSelect, FluentInput } from "@/components/fluent/FluentField";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { api } from "@/lib/api/client";
import { getApplications, getManagedAnimals, setCachePartial } from "@/lib/storage/db";
import { formatTrackingDays, trackingDays } from "@/lib/animals/facility-board";
import {
  ManagedAnimal,
  OperationApplication,
} from "@/types/animal-management";
import {
  deriveInstrumentDisplayStatus,
  instrumentImageUrl,
  normalizeInstrument,
} from "@/lib/instruments";

const RECORDING_STATUS_TIP: Record<
  NonNullable<ManagedAnimal["recordingStatus"]>,
  string
> = {
  living: "bg-[#E8F5E9] text-[#2E7D32] ring-[#A5D6A7]",
  dead: "bg-[#FFEBEE] text-[#C62828] ring-[#EF9A9A]",
  waiting: "bg-[#FFF8E1] text-[#F57F17] ring-[#FFE082]",
  optotagging: "bg-[#EDE7F6] text-[#5E35B1] ring-[#B39DDB]",
};

function buildMonthGrid(monthStart: Date): (string | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDateOnly(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function StudentDashboard() {
  const { t, isZh, locale } = useLocale();
  const d = t.dashboard;
  const s = t.dashboard.student;
  const m = t.animalMgmt.managed;
  const f = t.animalMgmt.facilityBoard;
  const { user } = useAuth();
  const { instruments, bookings } = useData();
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const [applications, setApplications] = useState<OperationApplication[]>([]);
  const [managed, setManaged] = useState<ManagedAnimal[]>([]);
  const [bookingsOpen, setBookingsOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [idFilter, setIdFilter] = useState("");
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calDay, setCalDay] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState(false);

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

  const activeBookings = useMemo(
    () =>
      myBookings
        .filter((b) => b.status === "approved" || b.status === "pending")
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [myBookings]
  );

  const myManagedInstruments = useMemo(
    () =>
      instruments
        .filter((i) => i.contactUserId === user?.id)
        .map((i) => normalizeInstrument(i)),
    [instruments, user?.id]
  );

  const [trainingPendingByInst, setTrainingPendingByInst] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user || myManagedInstruments.length === 0) return;
    (async () => {
      try {
        const { requests } = await api.instrumentTrainingRequests();
        const counts: Record<string, number> = {};
        for (const r of requests) {
          if (r.status !== "pending" && r.status !== "approved") continue;
          counts[r.instrumentId] = (counts[r.instrumentId] ?? 0) + 1;
        }
        setTrainingPendingByInst(counts);
      } catch {
        setTrainingPendingByInst({});
      }
    })();
  }, [user, myManagedInstruments.length]);

  function opsStatusLabel(code: string) {
    if (code === "idle") return s.opsIdle;
    if (code === "in_use") return s.opsInUse;
    if (code === "training") return s.opsTraining;
    if (code === "maintenance") return s.opsMaintenance;
    if (code === "retired") return s.opsRetired;
    return code;
  }

  const bookedInstrumentCount = useMemo(() => {
    const ids = new Set(
      activeBookings
        .filter((b) => b.resourceType === "instrument")
        .map((b) => b.resourceId)
    );
    return ids.size;
  }, [activeBookings]);

  const myApps = useMemo(
    () => applications.filter((app) => app.applicantUserId === user?.id),
    [applications, user?.id]
  );

  const myAnimals = useMemo(
    () => managed.filter((x) => x.claimantUserId === user?.id),
    [managed, user?.id]
  );

  const filteredAnimals = useMemo(() => {
    let rows = [...myAnimals];
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.recordingStatus === statusFilter);
    }
    const q = idFilter.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.id.toLowerCase().includes(q));
    // Most recent first (next collection / implant / id)
    rows.sort((a, b) => {
      const ta = new Date(a.nextCollectionAt || a.lastCollectionAt || a.implantAt || 0).getTime();
      const tb = new Date(b.nextCollectionAt || b.lastCollectionAt || b.implantAt || 0).getTime();
      return tb - ta;
    });
    return rows;
  }, [myAnimals, statusFilter, idFilter]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const bookingDates = useMemo(() => {
    const set = new Set<string>();
    for (const b of myBookings) {
      if (b.status === "cancelled" || b.status === "rejected") continue;
      const start = new Date(b.startTime);
      if (Number.isNaN(start.getTime())) continue;
      set.add(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
      );
    }
    return set;
  }, [myBookings]);

  const calCells = useMemo(() => buildMonthGrid(calMonth), [calMonth]);

  const dayBookings = useMemo(() => {
    if (!calDay) return [];
    return myBookings
      .filter((b) => {
        if (b.status === "cancelled" || b.status === "rejected") return false;
        const start = new Date(b.startTime);
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
        return key === calDay;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [myBookings, calDay]);

  function resourceName(booking: (typeof bookings)[0]) {
    const inst = instruments.find((i) => i.id === booking.resourceId);
    if (inst) return isZh ? inst.name : inst.nameEn;
    return booking.resourceId;
  }

  function recordingLabel(rs?: ManagedAnimal["recordingStatus"]) {
    if (!rs) return "—";
    return m.recordingStatus[rs] ?? rs;
  }

  const summaryCards = [
    {
      href: "/instruments",
      label: s.bookInstruments,
      desc: s.bookInstrumentsDesc,
      count: bookedInstrumentCount,
      unit: s.unitInstruments,
    },
    {
      href: "/animals/managed",
      label: s.managedAnimals,
      desc: s.managedAnimalsDesc,
      count: myAnimals.length,
      unit: s.unitAnimals,
    },
    {
      href: "/animals/applications",
      label: s.myApplications,
      desc: s.myApplicationsDesc,
      count: myApps.length,
      unit: s.unitApps,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title={d.title} subtitle={s.subtitle} />
      <div className="fluent-mica-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {/* Top counts */}
            <div className="grid gap-3 sm:grid-cols-3">
              {summaryCards.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-[#E0D4E8] bg-white/55 p-3 transition hover:bg-white/80 hover:shadow-sm"
                >
                  <p className="text-sm font-semibold text-thu">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums text-thu">
                    {item.count}
                    <span className="ml-1 text-sm font-medium text-lab-muted">{item.unit}</span>
                  </p>
                  <p className="mt-1 text-xs text-lab-muted">{item.desc}</p>
                </Link>
              ))}
            </div>

            {/* Collapsible: instruments I manage */}
            <GlassPanel>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setBookingsOpen((v) => !v)}
              >
                <div>
                  <h3 className="text-sm font-semibold text-thu">{s.myBookingsTitle}</h3>
                  <p className="mt-0.5 text-[11px] text-lab-muted">
                    {s.bookingsCollapseHint.replace("{n}", String(myManagedInstruments.length))}
                  </p>
                </div>
                <span className="text-lab-muted">{bookingsOpen ? "▾" : "▸"}</span>
              </button>

              {bookingsOpen && (
                <div className="mt-3">
                  {myManagedInstruments.length === 0 ? (
                    <p className="text-sm text-lab-muted">{s.noManagedInstruments}</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {myManagedInstruments.map((inst) => {
                        const display = deriveInstrumentDisplayStatus(
                          inst,
                          bookings,
                          trainingPendingByInst[inst.id] ?? 0
                        );
                        const img = instrumentImageUrl(inst.imageId);
                        return (
                          <Link
                            key={inst.id}
                            href={`/instruments/${encodeURIComponent(inst.id)}`}
                            className="rounded-lg border border-[#E0D4E8] bg-white/60 p-3 transition hover:bg-white/90"
                          >
                            <div className="flex items-start gap-2">
                              {img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={img}
                                  alt=""
                                  className="h-12 w-12 shrink-0 rounded-md object-cover"
                                />
                              ) : (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#F3EAF7] text-[10px] text-lab-muted">
                                  —
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-sm font-semibold text-thu">
                                    {isZh ? inst.name : inst.nameEn}
                                  </p>
                                  <span className="shrink-0 rounded-full bg-thu/10 px-2 py-0.5 text-[10px] font-medium text-thu">
                                    {opsStatusLabel(display)}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-[11px] text-lab-muted">
                                  {inst.model} · {inst.location}
                                </p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>

            {/* Managed animals list + simple filters */}
            <GlassPanel>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-thu">{s.myAnimalsTitle}</h3>
                <Link href="/animals/managed" className="text-xs text-thu hover:underline">
                  {s.goManaged}
                </Link>
              </div>
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <FluentSelect
                  className="min-w-[140px]"
                  label={m.colRecordingStatus}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">{s.filterAllStatus}</option>
                  <option value="living">{m.recordingStatus.living}</option>
                  <option value="waiting">{m.recordingStatus.waiting}</option>
                  <option value="optotagging">{m.recordingStatus.optotagging}</option>
                  <option value="dead">{m.recordingStatus.dead}</option>
                </FluentSelect>
                <FluentInput
                  className="min-w-[160px] flex-1"
                  label={m.colId}
                  value={idFilter}
                  onChange={(e) => setIdFilter(e.target.value)}
                  placeholder={s.filterIdPlaceholder}
                />
              </div>

              {filteredAnimals.length === 0 ? (
                <p className="text-sm text-lab-muted">{s.noMyAnimals}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#E0D4E8] text-[11px] text-lab-muted">
                        <th className="px-2 py-2 font-semibold">{m.colRecordingStatus}</th>
                        <th className="px-2 py-2 font-semibold">{m.colId}</th>
                        <th className="px-2 py-2 font-semibold">{m.colImplant}</th>
                        <th className="px-2 py-2 font-semibold">{m.colTracking}</th>
                        <th className="px-2 py-2 font-semibold">{m.colTrackingStage}</th>
                        <th className="px-2 py-2 font-semibold">{m.colNextDate}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAnimals.slice(0, 10).map((row, idx) => (
                        <tr
                          key={row.id}
                          className={clsx(
                            "border-b border-[#EDE4F2]",
                            idx % 2 === 0 ? "bg-white" : "bg-[#F7F1FA]"
                          )}
                        >
                          <td className="px-2 py-2">
                            <span
                              className={clsx(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                                row.recordingStatus
                                  ? RECORDING_STATUS_TIP[row.recordingStatus]
                                  : "bg-[#F5F5F5] text-[#616161] ring-[#BDBDBD]"
                              )}
                            >
                              {recordingLabel(row.recordingStatus)}
                            </span>
                          </td>
                          <td className="px-2 py-2 font-mono text-xs text-thu">{row.id}</td>
                          <td className="px-2 py-2 text-xs">{formatDateOnly(row.implantAt)}</td>
                          <td className="px-2 py-2 text-xs">
                            {formatTrackingDays(
                              trackingDays(row.collectionAt, row.lastCollectionAt, row.implantAt),
                              m.trackingUnit
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs">{row.trackingStage ?? "—"}</td>
                          <td className="px-2 py-2 text-xs">{formatDateOnly(row.nextCollectionAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredAnimals.length > 10 ? (
                    <p className="mt-2 text-[11px] text-lab-muted">
                      {s.animalsListMore.replace("{n}", String(filteredAnimals.length - 10))}
                    </p>
                  ) : null}
                </div>
              )}
            </GlassPanel>
          </div>

          {/* Right calendar */}
          <div className="space-y-4">
            <GlassPanel>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-thu">{s.calendar}</p>
                <div className="flex items-center gap-1">
                  <FluentButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const now = new Date();
                      setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    }}
                  >
                    {f.calendarToday}
                  </FluentButton>
                  <FluentButton
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))
                    }
                  >
                    ‹
                  </FluentButton>
                  <FluentButton
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))
                    }
                  >
                    ›
                  </FluentButton>
                </div>
              </div>
              <p className="mb-2 text-center text-xs font-medium text-lab-text">
                {calMonth.getFullYear()}-{String(calMonth.getMonth() + 1).padStart(2, "0")}
              </p>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-lab-muted">
                {(isZh
                  ? ["一", "二", "三", "四", "五", "六", "日"]
                  : ["M", "T", "W", "T", "F", "S", "S"]
                ).map((label, i) => (
                  <div key={`${label}-${i}`} className="py-1 font-medium">
                    {label}
                  </div>
                ))}
                {calCells.map((cell, i) =>
                  cell ? (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => {
                        setCalDay(cell);
                        setDayOpen(true);
                      }}
                      className={clsx(
                        "relative flex flex-col items-center rounded-md px-0.5 pb-1 pt-0.5 text-[11px] transition hover:bg-thu/10",
                        cell === todayStr && "font-semibold text-thu"
                      )}
                    >
                      <span
                        className={clsx(
                          "flex h-7 w-7 items-center justify-center rounded-full",
                          cell === todayStr && "bg-thu/10 ring-2 ring-thu"
                        )}
                      >
                        {Number(cell.slice(-2))}
                      </span>
                      <span
                        className={clsx(
                          "mt-0.5 h-1.5 w-1.5 rounded-full",
                          bookingDates.has(cell) ? "bg-thu" : "bg-transparent"
                        )}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <div key={`e-${i}`} />
                  )
                )}
              </div>
              <p className="mt-2 text-[10px] text-lab-muted">{s.calendarHint}</p>
            </GlassPanel>

            <Link
              href="/bookings"
              className="block rounded-xl border border-[#E0D4E8] bg-white/55 p-3 transition hover:bg-white/80 hover:shadow-sm"
            >
              <p className="text-sm font-semibold text-thu">{s.myBookingsLink}</p>
              <p className="mt-1 text-xs text-lab-muted">{s.viewBookingsDesc}</p>
            </Link>
          </div>
        </div>
      </div>

      <FluentModal
        open={dayOpen}
        title={calDay ? s.dayBookingsTitle.replace("{d}", calDay) : s.calendar}
        onClose={() => setDayOpen(false)}
        footer={
          <FluentButton variant="outline" onClick={() => setDayOpen(false)}>
            {t.common.close}
          </FluentButton>
        }
      >
        {dayBookings.length === 0 ? (
          <p className="text-sm text-lab-muted">{s.noDayBookings}</p>
        ) : (
          <ul className="space-y-2">
            {dayBookings.map((b) => (
              <li
                key={b.id}
                className="rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-sm"
              >
                <p className="font-medium text-thu">{resourceName(b)}</p>
                <p className="text-xs text-lab-muted">
                  {new Date(b.startTime).toLocaleTimeString(localeStr, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  –{" "}
                  {new Date(b.endTime).toLocaleTimeString(localeStr, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <StatusBadge status={b.status} label={t.status[b.status]} />
              </li>
            ))}
          </ul>
        )}
      </FluentModal>
    </div>
  );
}
