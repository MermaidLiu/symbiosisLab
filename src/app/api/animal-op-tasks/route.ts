import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { canReceiveAnimalOps } from "@/lib/roles";
import { displayName } from "@/lib/users";
import {
  ANIMAL_OP_TYPES,
  AnimalOpTask,
  urgencyFromFlags,
} from "@/types/animal-ops";
import {
  appendLifecycleTrace,
  assertCanCreateOperation,
  findAnimal,
  setRegistrationStatus,
} from "@/server/animal-lifecycle";
import { ExperimentKind, ExperimentOperation } from "@/types/animal-lifecycle";

function isOpType(v: string): v is AnimalOpTask["opType"] {
  return (ANIMAL_OP_TYPES as readonly string[]).includes(v);
}

/** 派发时同步创建实验 Operation（需扫码拍照 + 学生 NAS 闭环）的操作类型 */
const EXPERIMENT_DISPATCH_TYPES = new Set([
  "signal_collection",
  "surgery",
  "perfusion",
  "other",
]);

function kindFromOpType(opType: string): ExperimentKind {
  if (opType === "signal_collection") return "ephys";
  if (opType === "surgery") return "other";
  return "other";
}

const OP_TYPE_TITLE: Record<string, string> = {
  fasting: "禁食",
  water_deprivation: "禁水",
  signal_collection: "数据采集",
  euthanasia: "安乐死",
  perfusion: "灌流",
  surgery: "手术",
  other: "其他实验",
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const assigneeId = url.searchParams.get("assigneeId") || undefined;

  const tasks = getStore().animalOpTasks ?? [];
  let list = tasks;
  if (mine) {
    list = tasks.filter((t) => t.assigneeUserId === user.id);
  } else if (assigneeId) {
    list = tasks.filter((t) => t.assigneeUserId === assigneeId);
  }

  return jsonOk({ tasks: list });
}

/** Create animal op task(s) — any logged-in user (students assign staff). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const animalIds = Array.isArray(body.animalIds)
    ? body.animalIds.map((x: unknown) => String(x).trim()).filter(Boolean)
    : [];
  const opTypeRaw = String(body.opType ?? "").trim();
  const note = String(body.note ?? "").trim();
  const assigneeUserId = String(body.assigneeUserId ?? "").trim();
  const necessary = Boolean(body.necessary);
  const urgent = Boolean(body.urgent);
  const startTime = String(body.startTime ?? "").trim();
  const endTime = String(body.endTime ?? "").trim();

  if (!animalIds.length || !isOpType(opTypeRaw) || !assigneeUserId || !startTime || !endTime) {
    return jsonError("invalid_body", 400);
  }
  if (new Date(endTime) <= new Date(startTime)) {
    return jsonError("invalid_duration", 400);
  }

  const store = getStore();
  const assignee = store.users.find((u) => u.id === assigneeUserId);
  if (!assignee || !canReceiveAnimalOps(assignee.roles)) {
    return jsonError("invalid_assignee", 400);
  }

  const urgency = urgencyFromFlags(necessary, urgent);
  const now = new Date().toISOString();
  const task: AnimalOpTask = {
    id: uid("aot"),
    animalIds,
    opType: opTypeRaw,
    note,
    assigneeUserId: assignee.id,
    assigneeName: displayName(assignee),
    necessary,
    urgent,
    urgency,
    startTime,
    endTime,
    status: "scheduled",
    createdByUserId: user.id,
    createdByName: displayName(user),
    createdAt: now,
  };

  await mutateStore((s) => {
    if (!Array.isArray(s.animalOpTasks)) s.animalOpTasks = [];
    s.animalOpTasks = [task, ...s.animalOpTasks];

    const createdOps: string[] = [];
    if (EXPERIMENT_DISPATCH_TYPES.has(opTypeRaw)) {
      for (const animalId of animalIds) {
        const a = findAnimal(s, animalId);
        if (!a) continue;
        if (assertCanCreateOperation(a, s)) continue;
        const kind = kindFromOpType(opTypeRaw);
        const title =
          (note && note.slice(0, 40)) ||
          OP_TYPE_TITLE[opTypeRaw] ||
          "实验操作";
        const op: ExperimentOperation = {
          id: uid("exp"),
          animalId,
          status: "open",
          kind,
          title,
          technicianUserId: assignee.id,
          technicianName: displayName(assignee),
          studentUserId: a.claimantUserId ?? user.id,
          studentName: a.claimantName ?? displayName(user),
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        s.experimentOperations = [op, ...(s.experimentOperations ?? [])];
        setRegistrationStatus(a, "in_experiment");
        a.technicianUserId = assignee.id;
        a.technicianName = displayName(assignee);
        appendLifecycleTrace(s, {
          animalId,
          timestamp: now,
          action: "operation_created",
          userId: user.id,
          userName: displayName(user),
          details: `派发实验：${title} → ${displayName(assignee)}`,
          operationId: op.id,
        });
        createdOps.push(animalId);
      }
    }

    const needScan = createdOps.length > 0;
    s.notifications.unshift({
      id: uid("ntf"),
      userId: assignee.id,
      title: needScan ? "新的实验处理任务（需扫码）" : "新的动物操作任务",
      titleEn: needScan ? "New experiment task (scan required)" : "New animal operation task",
      message: needScan
        ? `${displayName(user)} 派发 ${createdOps.length} 只小鼠：请打开小程序扫笼码，上传拍照记录后完成。`
        : `${displayName(user)} 指派你处理 ${animalIds.length} 只小鼠的操作`,
      messageEn: needScan
        ? `${displayName(user)} assigned ${createdOps.length} mouse(es). Scan cage QR in mini-program and upload photos.`
        : `${displayName(user)} assigned you an animal op on ${animalIds.length} mouse(es)`,
      read: false,
      link: needScan
        ? `/animals/lifecycle?animalId=${encodeURIComponent(createdOps[0])}`
        : "/",
      kind: needScan ? "experiment_operation" : "animal_task",
      animalTaskId: task.id,
      animalId: createdOps[0],
      handled: false,
      createdAt: now,
    });
  });

  await appendAuditLog({
    userId: user.id,
    userName: displayName(user),
    action: "create_animal_op",
    entityType: "animal_op_task",
    entityId: task.id,
    details: `${opTypeRaw} → ${displayName(assignee)} · ${animalIds.join(",")}`,
  });

  return jsonOk({ task, tasks: getStore().animalOpTasks }, { status: 201 });
}

/** Reschedule / complete / cancel */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return jsonError("invalid_body", 400);

  let updated: AnimalOpTask | null = null;
  let forbidden = false;

  await mutateStore((s) => {
    if (!Array.isArray(s.animalOpTasks)) s.animalOpTasks = [];
    const idx = s.animalOpTasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const cur = s.animalOpTasks[idx];
    const isAssignee = cur.assigneeUserId === user.id;
    const isCreator = cur.createdByUserId === user.id;
    const isStaff = canReceiveAnimalOps(user.roles);
    if (!isAssignee && !isCreator && !isStaff) {
      forbidden = true;
      return;
    }

    const prevStatus = cur.status;
    const next = { ...cur };
    if (body.startTime !== undefined) next.startTime = String(body.startTime);
    if (body.endTime !== undefined) next.endTime = String(body.endTime);
    if (body.status !== undefined) {
      const st = String(body.status);
      if (st === "scheduled" || st === "done" || st === "cancelled") next.status = st;
    }
    if (body.note !== undefined) next.note = String(body.note);
    if (body.sortOrder !== undefined) {
      const n = Number(body.sortOrder);
      if (Number.isFinite(n)) next.sortOrder = n;
    }
    if (body.receiptNote !== undefined) next.receiptNote = String(body.receiptNote).trim();
    if (new Date(next.endTime) <= new Date(next.startTime)) return;

    const now = new Date().toISOString();
    const becameDone = prevStatus !== "done" && next.status === "done";
    if (becameDone) next.completedAt = now;

    s.animalOpTasks[idx] = next;
    updated = next;

    // Student receipt + red-dot notification when staff completes the task
    if (becameDone && next.createdByUserId) {
      const opLabel: Record<string, string> = {
        fasting: "禁食",
        water_deprivation: "禁水",
        signal_collection: "信号采集",
        euthanasia: "处死",
        perfusion: "灌流取材",
        surgery: "手术",
        other: "其他",
      };
      const opZh = opLabel[next.opType] ?? next.opType;
      const receipt =
        next.receiptNote ||
        `${displayName(user)} 已完成「${opZh}」操作（${next.animalIds.length} 只小鼠）`;
      s.notifications.unshift({
        id: uid("ntf"),
        userId: next.createdByUserId,
        title: "动物操作完成回执",
        titleEn: "Animal operation completed",
        message: receipt,
        messageEn:
          next.receiptNote ||
          `${displayName(user)} completed “${next.opType}” on ${next.animalIds.length} mouse(es)`,
        read: false,
        link: "/animals/managed",
        kind: "animal_task_receipt",
        animalTaskId: next.id,
        handled: false,
        createdAt: now,
      });
      // Mark related assignee notifications as handled
      s.notifications = s.notifications.map((n) =>
        n.animalTaskId === next.id && n.userId === user.id && n.kind === "animal_task"
          ? { ...n, handled: true, read: true }
          : n
      );
    }
  });

  if (forbidden) return jsonError("forbidden", 403);
  if (!updated) return jsonError("not_found", 404);

  return jsonOk({ task: updated, tasks: getStore().animalOpTasks });
}
