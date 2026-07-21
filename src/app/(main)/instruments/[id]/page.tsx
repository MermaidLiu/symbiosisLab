"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea, Select, Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WeekCalendar } from "@/components/booking/WeekCalendar";
import { InstrumentFormModal } from "@/components/instruments/InstrumentFormModal";
import { InstrumentStatusBadge } from "@/components/instruments/InstrumentStatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { api } from "@/lib/api/client";
import { getUsers, setCachePartial } from "@/lib/storage/db";
import {
  canManageInstruments,
  canSuperviseInstruments,
  isInstrumentOwner,
} from "@/lib/roles";
import { exportBookingsToCsv } from "@/lib/export";
import {
  canBookInstrument,
  deriveInstrumentDisplayStatus,
  durationHoursValid,
  instrumentImageUrl,
  normalizeInstrument,
  userHasInstrumentTraining,
} from "@/lib/instruments";
import { InstrumentContactStep } from "@/types";
import {
  InstrumentRepairTicket,
  InstrumentTrainingRequest,
} from "@/types/instrument-ops";

const STEP_LABEL: Record<
  InstrumentContactStep,
  "contactApproval" | "contactTraining" | "contactOperations" | "contactRepair"
> = {
  approval: "contactApproval",
  training: "contactTraining",
  operations: "contactOperations",
  repair: "contactRepair",
};

export default function InstrumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, isZh, locale } = useLocale();
  const { user, refreshUser } = useAuth();
  const { instruments, bookings, createBooking, refresh } = useData();
  const raw = instruments.find((i) => i.id === id);
  const inst = raw ? normalizeInstrument(raw) : null;
  const [purpose, setPurpose] = useState("");
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [msg, setMsg] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [trainUserId, setTrainUserId] = useState("");
  const [trainMsg, setTrainMsg] = useState("");
  const [usersVersion, setUsersVersion] = useState(0);
  const [trainingReqs, setTrainingReqs] = useState<InstrumentTrainingRequest[]>([]);
  const [repairTickets, setRepairTickets] = useState<InstrumentRepairTicket[]>([]);
  const [trainNote, setTrainNote] = useState("");
  const [repairDesc, setRepairDesc] = useState("");
  const [repairEta, setRepairEta] = useState("");
  const [opsMsg, setOpsMsg] = useState("");

  const users = useMemo(() => {
    void usersVersion;
    return getUsers();
  }, [usersVersion]);

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

  useEffect(() => {
    (async () => {
      try {
        const [tr, rp] = await Promise.all([
          api.instrumentTrainingRequests({ instrumentId: id }),
          api.instrumentRepairs({ instrumentId: id }),
        ]);
        setTrainingReqs(tr.requests);
        setRepairTickets(rp.tickets);
      } catch {
        /* ignore */
      }
    })();
  }, [id]);

  if (!inst) notFound();

  const isManager = user ? canManageInstruments(user.roles) : false;
  const isSuper = user ? canSuperviseInstruments(user.roles) : false;
  const isOwner = user ? isInstrumentOwner(user.id, inst.contactUserId) : false;
  const canHandleOps = Boolean(isSuper || isOwner);
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";
  const img = instrumentImageUrl(inst.imageId);
  const trained = userHasInstrumentTraining(user?.trainedInstrumentIds, inst.id);
  const bookGate = user
    ? canBookInstrument({
        instrument: inst,
        userId: user.id,
        roles: user.roles,
        trainedInstrumentIds: user.trainedInstrumentIds,
      })
    : { ok: false as const, reason: "training_required" as const };

  const trainedUsers = users.filter((u) =>
    userHasInstrumentTraining(u.trainedInstrumentIds, inst.id)
  );

  const myPendingTraining = trainingReqs.find(
    (r) =>
      r.applicantUserId === user?.id &&
      (r.status === "pending" || r.status === "approved")
  );

  const displayStatus = deriveInstrumentDisplayStatus(
    inst,
    bookings,
    trainingReqs.filter((r) => r.status === "pending" || r.status === "approved").length
  );

  const opsLabel =
    displayStatus === "idle"
      ? t.dashboard.student.opsIdle
      : displayStatus === "in_use"
        ? t.dashboard.student.opsInUse
        : displayStatus === "training"
          ? t.dashboard.student.opsTraining
          : displayStatus === "maintenance"
            ? t.dashboard.student.opsMaintenance
            : t.dashboard.student.opsRetired;

  async function handleBook() {
    if (!inst || !user || !slot || !purpose.trim()) return;
    if (!bookGate.ok) {
      if (bookGate.reason === "maintenance") setMsg(t.instruments.bookingBlockedMaintenance);
      else if (bookGate.reason === "retired") setMsg(t.instruments.bookingBlockedRetired);
      else setMsg(t.instruments.bookingBlockedTraining);
      return;
    }
    const hours = (slot.end.getTime() - slot.start.getTime()) / 3600000;
    if (!durationHoursValid(hours, inst.minBookingHours, inst.maxBookingHours)) {
      setMsg(
        `${t.instruments.bookingRules}: ${inst.minBookingHours}–${inst.maxBookingHours} ${t.instruments.hours}`
      );
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
      setSlot(null);
    } else if (result.error === "maintenance") {
      setMsg(t.instruments.bookingBlockedMaintenance);
    } else if (result.error === "training_required") {
      setMsg(t.instruments.bookingBlockedTraining);
    } else if (result.error === "invalid_duration") {
      setMsg(t.instruments.bookingInvalidDuration);
    } else if (result.error === "retired") {
      setMsg(t.instruments.bookingBlockedRetired);
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

  async function handleGrantTraining() {
    if (!trainUserId) return;
    try {
      const { user: updated } = await api.setInstrumentTraining(id, trainUserId, "grant");
      const all = getUsers().map((u) => (u.id === updated.id ? { ...u, ...updated } : u));
      setCachePartial({ users: all });
      setUsersVersion((v) => v + 1);
      setTrainMsg(t.instruments.grantTrainingOk);
      if (user?.id === updated.id) await refreshUser();
    } catch {
      setTrainMsg(t.instruments.importFail);
    }
  }

  async function handleApplyTraining() {
    try {
      const { requests } = await api.createTrainingRequest({
        instrumentId: id,
        note: trainNote,
      });
      setTrainingReqs(requests.filter((r) => r.instrumentId === id));
      setOpsMsg(t.instruments.applyTrainingOk);
      setTrainNote("");
    } catch {
      setOpsMsg(t.instruments.applyTrainingFail);
    }
  }

  async function handleTrainingAction(
    reqId: string,
    action: "approve" | "authorize" | "reject"
  ) {
    try {
      const { requests } = await api.updateTrainingRequest({ id: reqId, action });
      setTrainingReqs(requests.filter((r) => r.instrumentId === id));
      setOpsMsg(t.instruments.grantTrainingOk);
      await refreshUser();
      setUsersVersion((v) => v + 1);
    } catch {
      setOpsMsg(t.instruments.applyTrainingFail);
    }
  }

  async function handleReportRepair() {
    if (!repairDesc.trim()) return;
    try {
      const res = await api.createRepairTicket({
        instrumentId: id,
        description: repairDesc.trim(),
      });
      setRepairTickets(res.tickets.filter((x) => x.instrumentId === id));
      setCachePartial({ instruments: res.instruments });
      await refresh();
      setOpsMsg(t.instruments.reportRepairOk);
      setRepairDesc("");
    } catch {
      setOpsMsg(t.instruments.applyTrainingFail);
    }
  }

  async function handleRepairAction(
    ticketId: string,
    action: "acknowledge" | "escalate" | "resolve"
  ) {
    try {
      const res = await api.updateRepairTicket({
        id: ticketId,
        action,
        eta: repairEta ? new Date(repairEta).toISOString() : undefined,
        note: repairDesc || undefined,
      });
      setRepairTickets(res.tickets.filter((x) => x.instrumentId === id));
      setCachePartial({ instruments: res.instruments });
      await refresh();
      setOpsMsg(t.instruments.grantTrainingOk);
      setRepairDesc("");
      setRepairEta("");
    } catch {
      setOpsMsg(t.instruments.applyTrainingFail);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={isZh ? inst.name : inst.nameEn}
        action={
          <div className="flex flex-wrap gap-2">
            {isManager && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                {t.instruments.edit}
              </Button>
            )}
            <Link href="/instruments">
              <Button variant="outline">{t.common.back}</Button>
            </Link>
          </div>
        }
      />
      <div className="fluent-mica-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <Card>
              {img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img} alt="" className="mb-3 h-44 w-full rounded-lg object-cover" />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <InstrumentStatusBadge instrument={inst} />
                <span className="rounded-full bg-thu/10 px-2 py-0.5 text-[10px] font-medium text-thu">
                  {t.instruments.displayStatus}: {opsLabel}
                </span>
              </div>
              <p className="mt-2 text-xs text-lab-muted">
                {t.instruments.owner}:{" "}
                <span className="font-medium text-thu">
                  {users.find((u) => u.id === inst.contactUserId)?.name ?? "—"}
                </span>
              </p>
              <p className="mt-3 text-sm text-lab-text">
                {isZh ? inst.description : inst.descriptionEn}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-lab-muted">{t.common.location}</dt>
                  <dd className="font-medium">{inst.location}</dd>
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
                    {inst.trainingRequired
                      ? t.instruments.trainingRequired
                      : t.instruments.trainingNotRequired}
                    {inst.trainingRequired && user && (
                      <span className="ml-2 text-xs text-lab-muted">
                        (
                        {trained || isManager
                          ? t.instruments.trainingDone
                          : t.instruments.trainingMissing}
                        )
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <p className="text-xs font-medium text-lab-muted">{t.instruments.contactSteps}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {(inst.contacts ?? []).map((c) => (
                    <li key={c.step} className="rounded-lg bg-white/50 px-2 py-1.5">
                      <span className="text-[11px] text-lab-muted">
                        {t.instruments[STEP_LABEL[c.step]]}
                      </span>
                      <p className="font-medium text-thu">
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

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

            {isManager && inst.trainingRequired && (
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-thu">{t.instruments.grantTraining}</h3>
                <Select
                  label={t.instruments.grantTrainingUser}
                  value={trainUserId}
                  onChange={(e) => setTrainUserId(e.target.value)}
                >
                  <option value="">—</option>
                  {users
                    .filter((u) => u.roles.includes("user"))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {userHasInstrumentTraining(u.trainedInstrumentIds, inst.id)
                          ? ` ✓`
                          : ""}
                      </option>
                    ))}
                </Select>
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={!trainUserId}
                  onClick={() => void handleGrantTraining()}
                >
                  {t.instruments.grantTraining}
                </Button>
                {trainMsg && <p className="mt-2 text-xs text-thu">{trainMsg}</p>}
                {trainedUsers.length > 0 && (
                  <p className="mt-3 text-xs text-lab-muted">
                    {t.instruments.trainedUsers}: {trainedUsers.map((u) => u.name).join("、")}
                  </p>
                )}
              </Card>
            )}

            {user && inst.trainingRequired && !trained && !isManager && (
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-thu">{t.instruments.applyTraining}</h3>
                <p className="mb-2 text-xs text-lab-muted">{t.instruments.applyTrainingHint}</p>
                {myPendingTraining ? (
                  <p className="text-sm text-thu">{t.instruments.applyTrainingPending}</p>
                ) : (
                  <>
                    <Textarea
                      label={t.instruments.applyTrainingNote}
                      value={trainNote}
                      onChange={(e) => setTrainNote(e.target.value)}
                    />
                    <Button className="mt-2" size="sm" onClick={() => void handleApplyTraining()}>
                      {t.instruments.applyTraining}
                    </Button>
                  </>
                )}
              </Card>
            )}

            {user && (
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-thu">{t.instruments.reportRepair}</h3>
                <p className="mb-2 text-xs text-lab-muted">{t.instruments.reportRepairHint}</p>
                <Textarea
                  label={t.instruments.reportRepair}
                  value={repairDesc}
                  onChange={(e) => setRepairDesc(e.target.value)}
                />
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  disabled={!repairDesc.trim()}
                  onClick={() => void handleReportRepair()}
                >
                  {t.instruments.reportRepair}
                </Button>
              </Card>
            )}

            {canHandleOps && trainingReqs.some((r) => r.status === "pending" || r.status === "approved") && (
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-thu">{t.instruments.trainingRequests}</h3>
                <ul className="space-y-2">
                  {trainingReqs
                    .filter((r) => r.status === "pending" || r.status === "approved")
                    .map((r) => (
                      <li key={r.id} className="rounded-lg border border-[#E0D4E8] bg-white/50 p-2 text-xs">
                        <p className="font-medium text-thu">
                          {r.applicantName} · {r.status}
                        </p>
                        {r.note && <p className="mt-1 text-lab-muted">{r.note}</p>}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.status === "pending" && (
                            <Button size="sm" variant="outline" onClick={() => void handleTrainingAction(r.id, "approve")}>
                              {t.instruments.approveTraining}
                            </Button>
                          )}
                          <Button size="sm" onClick={() => void handleTrainingAction(r.id, "authorize")}>
                            {t.instruments.authorizeTraining}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void handleTrainingAction(r.id, "reject")}>
                            {t.instruments.rejectTraining}
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              </Card>
            )}

            {canHandleOps && repairTickets.some((r) => r.status !== "resolved" && r.status !== "cancelled") && (
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-thu">{t.instruments.repairOpenTickets}</h3>
                <Input
                  label={t.instruments.repairEta}
                  type="datetime-local"
                  value={repairEta}
                  onChange={(e) => setRepairEta(e.target.value)}
                />
                <ul className="mt-2 space-y-2">
                  {repairTickets
                    .filter((r) => r.status !== "resolved" && r.status !== "cancelled")
                    .map((r) => (
                      <li key={r.id} className="rounded-lg border border-[#E0D4E8] bg-white/50 p-2 text-xs">
                        <p className="font-medium text-thu">
                          {r.reporterName} · {r.status}
                        </p>
                        <p className="mt-1 text-lab-muted">{r.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button size="sm" onClick={() => void handleRepairAction(r.id, "acknowledge")}>
                            {t.instruments.repairAck}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void handleRepairAction(r.id, "escalate")}>
                            {t.instruments.repairEscalate}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void handleRepairAction(r.id, "resolve")}>
                            {t.instruments.repairResolve}
                          </Button>
                        </div>
                      </li>
                    ))}
                </ul>
              </Card>
            )}

            {opsMsg && <p className="text-xs text-thu">{opsMsg}</p>}
          </div>

          <div className="space-y-4 lg:col-span-2">
            {!bookGate.ok && (
              <Card className="border-amber-200 bg-amber-50/60">
                <p className="text-sm text-amber-900">
                  {bookGate.reason === "maintenance"
                    ? t.instruments.bookingBlockedMaintenance
                    : bookGate.reason === "retired"
                      ? t.instruments.bookingBlockedRetired
                      : t.instruments.bookingBlockedTraining}
                </p>
              </Card>
            )}

            <Card>
              <h3 className="mb-3 font-semibold text-thu">{t.instruments.calendar}</h3>
              <WeekCalendar
                bookings={resourceBookings}
                selectedSlot={slot}
                currentUserId={user?.id}
                onSelectSlot={(start, end) => {
                  if (!bookGate.ok) {
                    setSlot(null);
                    if (bookGate.reason === "maintenance") {
                      setMsg(t.instruments.bookingBlockedMaintenance);
                    } else if (bookGate.reason === "retired") {
                      setMsg(t.instruments.bookingBlockedRetired);
                    } else {
                      setMsg(t.instruments.bookingBlockedTraining);
                    }
                    return;
                  }
                  setSlot({ start, end });
                  setMsg("");
                }}
              />
            </Card>

            {slot && bookGate.ok && (
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
                  <Button onClick={() => void handleBook()}>{t.instruments.submitBooking}</Button>
                  <Button variant="ghost" onClick={() => setSlot(null)}>
                    {t.common.cancel}
                  </Button>
                </div>
                {msg && <p className="mt-2 text-sm text-thu">{msg}</p>}
              </Card>
            )}
            {msg && !slot && <p className="text-sm text-thu">{msg}</p>}

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
                              <td className="whitespace-nowrap py-2 pr-3">
                                {new Date(b.startTime).toLocaleString(localeStr)}
                              </td>
                              <td className="whitespace-nowrap py-2 pr-3">
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

      <InstrumentFormModal
        open={editOpen}
        instrument={inst}
        onClose={() => {
          setEditOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}
