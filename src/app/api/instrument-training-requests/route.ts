import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { canManageInstruments, canSuperviseInstruments, isInstrumentOwner } from "@/lib/roles";
import { displayName } from "@/lib/users";
import { InstrumentTrainingRequest } from "@/types/instrument-ops";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const instrumentId = url.searchParams.get("instrumentId") || undefined;
  const list = getStore().instrumentTrainingRequests ?? [];

  let filtered = list;
  if (mine) {
    filtered = list.filter((r) => r.applicantUserId === user.id);
  } else if (instrumentId) {
    filtered = list.filter((r) => r.instrumentId === instrumentId);
  } else if (!canSuperviseInstruments(user.roles)) {
    // Managers see requests for instruments they own
    const owned = new Set(
      getStore()
        .instruments.filter((i) => i.contactUserId === user.id)
        .map((i) => i.id)
    );
    filtered = list.filter((r) => owned.has(r.instrumentId));
  }

  return jsonOk({ requests: filtered });
}

/** User applies for instrument training */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const instrumentId = String(body.instrumentId ?? "").trim();
  const note = String(body.note ?? "").trim();
  if (!instrumentId) return jsonError("invalid_body", 400);

  const store = getStore();
  const instrument = store.instruments.find((i) => i.id === instrumentId);
  if (!instrument) return jsonError("not_found", 404);
  if (!instrument.trainingRequired) return jsonError("training_not_required", 400);

  const trained = (user.trainedInstrumentIds ?? []).includes(instrumentId);
  if (trained) return jsonError("already_trained", 400);

  const dup = (store.instrumentTrainingRequests ?? []).find(
    (r) =>
      r.instrumentId === instrumentId &&
      r.applicantUserId === user.id &&
      (r.status === "pending" || r.status === "approved")
  );
  if (dup) return jsonError("already_pending", 400);

  const now = new Date().toISOString();
  const request: InstrumentTrainingRequest = {
    id: uid("itr"),
    instrumentId,
    instrumentName: instrument.name,
    applicantUserId: user.id,
    applicantName: displayName(user),
    note,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await mutateStore((s) => {
    if (!Array.isArray(s.instrumentTrainingRequests)) s.instrumentTrainingRequests = [];
    s.instrumentTrainingRequests = [request, ...s.instrumentTrainingRequests];
    const managerId = instrument.contactUserId;
    if (managerId) {
      s.notifications.unshift({
        id: uid("ntf"),
        userId: managerId,
        title: "新的仪器培训申请",
        titleEn: "New instrument training request",
        message: `${displayName(user)} 申请培训：${instrument.name}`,
        messageEn: `${displayName(user)} requested training for ${instrument.name}`,
        read: false,
        link: `/instruments/${encodeURIComponent(instrumentId)}`,
        kind: "instrument_training",
        instrumentId,
        trainingRequestId: request.id,
        handled: false,
        createdAt: now,
      });
    }
  });

  await appendAuditLog({
    userId: user.id,
    userName: displayName(user),
    action: "training_request",
    entityType: "instrument",
    entityId: instrumentId,
    details: `申请培训 ${instrument.name}`,
  });

  return jsonOk({ request, requests: getStore().instrumentTrainingRequests }, { status: 201 });
}

/** Manager: approve / authorize / reject */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageInstruments(user.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim(); // approve | authorize | reject
  const handledNote = String(body.note ?? "").trim();
  if (!id || !["approve", "authorize", "reject"].includes(action)) {
    return jsonError("invalid_body", 400);
  }

  let updated: InstrumentTrainingRequest | null = null;
  let forbidden = false;

  await mutateStore((s) => {
    if (!Array.isArray(s.instrumentTrainingRequests)) s.instrumentTrainingRequests = [];
    const idx = s.instrumentTrainingRequests.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const cur = s.instrumentTrainingRequests[idx];
    const inst = s.instruments.find((i) => i.id === cur.instrumentId);
    if (
      !canSuperviseInstruments(user.roles) &&
      !(inst && isInstrumentOwner(user.id, inst.contactUserId))
    ) {
      forbidden = true;
      return;
    }

    const now = new Date().toISOString();
    const next = { ...cur, updatedAt: now, handledByUserId: user.id, handledByName: displayName(user) };
    if (handledNote) next.handledNote = handledNote;

    if (action === "reject") {
      next.status = "rejected";
    } else if (action === "approve") {
      next.status = "approved";
    } else {
      // authorize = grant training
      next.status = "authorized";
      s.users = s.users.map((u) => {
        if (u.id !== cur.applicantUserId) return u;
        const ids = new Set(u.trainedInstrumentIds ?? []);
        ids.add(cur.instrumentId);
        return { ...u, trainedInstrumentIds: [...ids] };
      });
    }

    s.instrumentTrainingRequests[idx] = next;
    updated = next;

    s.notifications.unshift({
      id: uid("ntf"),
      userId: cur.applicantUserId,
      title:
        action === "reject"
          ? "培训申请已拒绝"
          : action === "authorize"
            ? "仪器已授权（培训完成）"
            : "培训申请已受理",
      titleEn:
        action === "reject"
          ? "Training request rejected"
          : action === "authorize"
            ? "Instrument authorized after training"
            : "Training request accepted",
      message:
        action === "authorize"
          ? `${displayName(user)} 已完成培训并授权你使用 ${cur.instrumentName}`
          : action === "reject"
            ? `${displayName(user)} 拒绝了你对 ${cur.instrumentName} 的培训申请${handledNote ? `：${handledNote}` : ""}`
            : `${displayName(user)} 已受理你对 ${cur.instrumentName} 的培训申请，请按约定参加培训`,
      messageEn: `${displayName(user)} updated your training request for ${cur.instrumentName}`,
      read: false,
      link: `/instruments/${encodeURIComponent(cur.instrumentId)}`,
      kind: "instrument_training",
      instrumentId: cur.instrumentId,
      trainingRequestId: cur.id,
      handled: false,
      createdAt: now,
    });
  });

  if (forbidden) return jsonError("forbidden", 403);
  if (!updated) return jsonError("not_found", 404);

  await appendAuditLog({
    userId: user.id,
    userName: displayName(user),
    action: `training_${action}`,
    entityType: "instrument_training",
    entityId: id,
    details: `${action} training request ${id}`,
  });

  return jsonOk({ request: updated, requests: getStore().instrumentTrainingRequests });
}
