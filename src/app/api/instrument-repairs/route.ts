import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { canManageInstruments, canSuperviseInstruments, isInstrumentOwner } from "@/lib/roles";
import { displayName } from "@/lib/users";
import { InstrumentRepairTicket } from "@/types/instrument-ops";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const instrumentId = url.searchParams.get("instrumentId") || undefined;
  const escalated = url.searchParams.get("escalated") === "1";
  const list = getStore().instrumentRepairTickets ?? [];

  let filtered = list;
  if (mine) {
    filtered = list.filter((r) => r.reporterUserId === user.id);
  } else if (instrumentId) {
    filtered = list.filter((r) => r.instrumentId === instrumentId);
  } else if (escalated || canSuperviseInstruments(user.roles)) {
    if (escalated) {
      filtered = list.filter((r) => r.status === "escalated");
    } else if (!canSuperviseInstruments(user.roles)) {
      const owned = new Set(
        getStore()
          .instruments.filter((i) => i.contactUserId === user.id)
          .map((i) => i.id)
      );
      filtered = list.filter((r) => owned.has(r.instrumentId) || r.status === "escalated");
    }
  } else {
    const owned = new Set(
      getStore()
        .instruments.filter((i) => i.contactUserId === user.id)
        .map((i) => i.id)
    );
    filtered = list.filter((r) => owned.has(r.instrumentId));
  }

  return jsonOk({ tickets: filtered });
}

/** User reports instrument repair */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const instrumentId = String(body.instrumentId ?? "").trim();
  const description = String(body.description ?? "").trim();
  if (!instrumentId || !description) return jsonError("invalid_body", 400);

  const store = getStore();
  const instrument = store.instruments.find((i) => i.id === instrumentId);
  if (!instrument) return jsonError("not_found", 404);

  const now = new Date().toISOString();
  const ticket: InstrumentRepairTicket = {
    id: uid("irp"),
    instrumentId,
    instrumentName: instrument.name,
    reporterUserId: user.id,
    reporterName: displayName(user),
    description,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  await mutateStore((s) => {
    if (!Array.isArray(s.instrumentRepairTickets)) s.instrumentRepairTickets = [];
    s.instrumentRepairTickets = [ticket, ...s.instrumentRepairTickets];
    // Mark instrument under maintenance
    s.instruments = s.instruments.map((i) =>
      i.id === instrumentId
        ? {
            ...i,
            status: "maintenance" as const,
            maintenanceNote: description,
            updatedAt: now,
          }
        : i
    );
    if (instrument.contactUserId) {
      s.notifications.unshift({
        id: uid("ntf"),
        userId: instrument.contactUserId,
        title: "仪器报修",
        titleEn: "Instrument repair reported",
        message: `${displayName(user)} 报修 ${instrument.name}：${description}`,
        messageEn: `${displayName(user)} reported repair on ${instrument.name}: ${description}`,
        read: false,
        link: `/instruments/${encodeURIComponent(instrumentId)}`,
        kind: "instrument_repair",
        instrumentId,
        repairTicketId: ticket.id,
        handled: false,
        createdAt: now,
      });
    }
  });

  await appendAuditLog({
    userId: user.id,
    userName: displayName(user),
    action: "repair_report",
    entityType: "instrument",
    entityId: instrumentId,
    details: `报修 ${instrument.name}：${description}`,
  });

  return jsonOk(
    {
      ticket,
      tickets: getStore().instrumentRepairTickets,
      instruments: getStore().instruments,
    },
    { status: 201 }
  );
}

/**
 * Manager: acknowledge (with ETA) | escalate | resolve
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageInstruments(user.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim(); // acknowledge | escalate | resolve
  const eta = body.eta ? String(body.eta) : undefined;
  const note = String(body.note ?? "").trim();
  if (!id || !["acknowledge", "escalate", "resolve"].includes(action)) {
    return jsonError("invalid_body", 400);
  }

  let updated: InstrumentRepairTicket | null = null;
  let forbidden = false;

  await mutateStore((s) => {
    if (!Array.isArray(s.instrumentRepairTickets)) s.instrumentRepairTickets = [];
    const idx = s.instrumentRepairTickets.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const cur = s.instrumentRepairTickets[idx];
    const inst = s.instruments.find((i) => i.id === cur.instrumentId);
    const isOwner = inst && isInstrumentOwner(user.id, inst.contactUserId);
    const isSuper = canSuperviseInstruments(user.roles);
    if (!isSuper && !isOwner && cur.status !== "escalated") {
      forbidden = true;
      return;
    }

    const now = new Date().toISOString();
    const next = { ...cur, updatedAt: now, managerUserId: user.id, managerName: displayName(user) };

    if (action === "acknowledge") {
      next.status = "acknowledged";
      next.eta = eta || next.eta;
      next.managerNote = note || next.managerNote;
      if (inst) {
        s.instruments = s.instruments.map((i) =>
          i.id === inst.id
            ? {
                ...i,
                status: "maintenance" as const,
                maintenanceUntil: next.eta,
                maintenanceNote: next.managerNote || i.maintenanceNote,
                updatedAt: now,
              }
            : i
        );
      }
    } else if (action === "escalate") {
      next.status = "escalated";
      next.escalatedNote = note;
      const supers = s.users.filter(
        (u) =>
          u.roles.includes("instrument_super_admin") || u.roles.includes("super_admin")
      );
      for (const su of supers) {
        s.notifications.unshift({
          id: uid("ntf"),
          userId: su.id,
          title: "仪器报修升级",
          titleEn: "Instrument repair escalated",
          message: `${displayName(user)} 升级报修 ${cur.instrumentName}：${note || cur.description}`,
          messageEn: `${displayName(user)} escalated repair on ${cur.instrumentName}`,
          read: false,
          link: `/instruments/${encodeURIComponent(cur.instrumentId)}`,
          kind: "instrument_repair",
          instrumentId: cur.instrumentId,
          repairTicketId: cur.id,
          handled: false,
          createdAt: now,
        });
      }
    } else {
      next.status = "resolved";
      next.managerNote = note || next.managerNote;
      if (inst) {
        s.instruments = s.instruments.map((i) =>
          i.id === inst.id
            ? {
                ...i,
                status: "available" as const,
                maintenanceUntil: undefined,
                maintenanceNote: undefined,
                updatedAt: now,
              }
            : i
        );
      }
    }

    s.instrumentRepairTickets[idx] = next;
    updated = next;

    s.notifications.unshift({
      id: uid("ntf"),
      userId: cur.reporterUserId,
      title:
        action === "resolve"
          ? "仪器已修复"
          : action === "escalate"
            ? "报修已升级至总管理员"
            : "报修已受理",
      titleEn:
        action === "resolve"
          ? "Instrument repaired"
          : action === "escalate"
            ? "Repair escalated"
            : "Repair acknowledged",
      message:
        action === "acknowledge" && next.eta
          ? `${displayName(user)} 已受理报修，预计 ${next.eta.slice(0, 16).replace("T", " ")} 修好`
          : `${displayName(user)} 更新了 ${cur.instrumentName} 的报修状态`,
      messageEn: `${displayName(user)} updated repair status for ${cur.instrumentName}`,
      read: false,
      link: `/instruments/${encodeURIComponent(cur.instrumentId)}`,
      kind: "instrument_repair",
      instrumentId: cur.instrumentId,
      repairTicketId: cur.id,
      handled: false,
      createdAt: now,
    });
  });

  if (forbidden) return jsonError("forbidden", 403);
  if (!updated) return jsonError("not_found", 404);

  await appendAuditLog({
    userId: user.id,
    userName: displayName(user),
    action: `repair_${action}`,
    entityType: "instrument_repair",
    entityId: id,
    details: `${action} repair ${id}${eta ? ` eta=${eta}` : ""}${note ? ` ${note}` : ""}`,
  });

  return jsonOk({
    ticket: updated,
    tickets: getStore().instrumentRepairTickets,
    instruments: getStore().instruments,
  });
}
