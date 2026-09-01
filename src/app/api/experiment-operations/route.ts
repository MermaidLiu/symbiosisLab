import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireActiveUser } from "@/server/auth";
import { appendAuditLog } from "@/server/audit";
import {
  appendLifecycleTrace,
  assertCanCreateOperation,
  findAnimal,
  OPERATION_STATUS_LABELS,
  setRegistrationStatus,
} from "@/server/animal-lifecycle";
import { isBackfillProcessing } from "@/lib/animals/experiment-lock";
import { pushNotificationToUsers } from "@/server/notify";
import {
  canSuperviseAnimalFacility,
  canViewAllAnimalLifecycle,
  isAnimalClaimantStudent,
  isAnimalExperimentTechnician,
} from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import {
  EXPERIMENT_KINDS,
  ExperimentKind,
  ExperimentOperation,
} from "@/types/animal-lifecycle";
import { displayName } from "@/lib/users";

function isKind(v: unknown): v is ExperimentKind {
  return EXPERIMENT_KINDS.includes(v as ExperimentKind);
}

function mapOpTypeToKind(opType: string): ExperimentKind {
  if (opType === "signal_collection") return "ephys";
  if (opType === "surgery") return "other";
  return "other";
}

/** GET /api/experiment-operations?animalId= */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const animalId = req.nextUrl.searchParams.get("animalId")?.trim();
  let ops = getStore().experimentOperations ?? [];

  if (animalId) {
    ops = ops.filter((op) => op.animalId === animalId);
  }

  if (!canViewAllAnimalLifecycle(user.roles)) {
    ops = ops.filter(
      (op) => op.studentUserId === user.id || op.technicianUserId === user.id
    );
  }

  return jsonOk({ operations: ops, statusLabels: OPERATION_STATUS_LABELS });
}

/**
 * POST — 创建实验 Operation
 * - 技术员扫码后自行创建（绑定自己）
 * - 或学生派发时指定 technicianUserId
 */
export async function POST(req: NextRequest) {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const animalId = String(body.animalId ?? "").trim();
  const kind = isKind(body.kind)
    ? body.kind
    : body.opType
      ? mapOpTypeToKind(String(body.opType))
      : "other";
  const title = String(body.title ?? "").trim() || "实验操作";
  const assigneeId = String(body.technicianUserId ?? "").trim();

  if (!animalId) return jsonError("invalid_body", 400);

  const store = getStore();
  const animal = findAnimal(store, animalId);
  if (!animal) return jsonError("not_found", 404);

  let tech = user;
  if (assigneeId && assigneeId !== user.id) {
    // 学生派发：指定技术员
    if (
      !isAnimalClaimantStudent(user.roles) &&
      !canSuperviseAnimalFacility(user.roles) &&
      animal.claimantUserId !== user.id
    ) {
      return jsonError("forbidden", 403);
    }
    if (animal.claimantUserId !== user.id && !canSuperviseAnimalFacility(user.roles)) {
      return jsonError("forbidden", 403);
    }
    const assignee = store.users.find((u) => u.id === assigneeId);
    if (!assignee || !isAnimalExperimentTechnician(assignee.roles)) {
      return jsonError("invalid_assignee", 400);
    }
    tech = assignee;
  } else if (!isAnimalExperimentTechnician(user.roles) && !canSuperviseAnimalFacility(user.roles)) {
    return jsonError("forbidden", 403);
  }

  const block = assertCanCreateOperation(animal, store);
  if (block) return jsonError(block, 409);

  const now = new Date().toISOString();
  const op: ExperimentOperation = {
    id: uid("exp"),
    animalId,
    status: "open",
    kind,
    title,
    technicianUserId: tech.id,
    technicianName: displayName(tech),
    studentUserId: animal.claimantUserId ?? user.id,
    studentName: animal.claimantName ?? displayName(user),
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await mutateStore((s) => {
    const a = findAnimal(s, animalId);
    if (!a) return;
    if (assertCanCreateOperation(a, s)) return;
    s.experimentOperations = [op, ...(s.experimentOperations ?? [])];
    setRegistrationStatus(a, "in_experiment");
    a.technicianUserId = tech.id;
    a.technicianName = displayName(tech);
    a.lastOpBackfill = false;
    appendLifecycleTrace(s, {
      animalId,
      timestamp: now,
      action: "operation_created",
      userId: user.id,
      userName: user.name,
      details: `${displayName(user)} 派发/创建实验：${title}（${kind}）→ 技术员 ${displayName(tech)}`,
      operationId: op.id,
    });
    pushNotificationToUsers(s, [tech.id], {
      title: "新的实验处理任务",
      titleEn: "New experiment task",
      message: `${displayName(user)} 派发小鼠 ${animalId}，请用小程序扫笼码并上传拍照记录后完成。`,
      messageEn: `${displayName(user)} assigned ${animalId}. Scan cage QR in mini-program and upload photos.`,
      link: `/animals/task-handle?animalId=${animalId}&operationId=${op.id}`,
      kind: "experiment_operation",
      operationId: op.id,
      animalId,
    });
  });

  if (!getStore().experimentOperations?.some((x) => x.id === op.id)) {
    return jsonError("create_failed", 500);
  }

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "create_operation",
    entityType: "experiment_operation",
    entityId: op.id,
    details: `${animalId} · ${title} → ${displayName(tech)}`,
  });

  return jsonOk({ operation: op }, { status: 201 });
}

/**
 * PATCH — action:
 * - tech_submit: 技术员提交结果
 * - student_close: 学生上传 NAS 并闭环
 * - force_close: 主管强制关闭
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const action = String(body.action ?? "");
  if (!id || !action) return jsonError("invalid_body", 400);

  const now = new Date().toISOString();
  let updated: ExperimentOperation | null = null;
  let notifyStudentId: string | null = null;

  await mutateStore((s) => {
    const idx = (s.experimentOperations ?? []).findIndex((op) => op.id === id);
    if (idx < 0) return;
    const op = s.experimentOperations![idx];
    const animal = findAnimal(s, op.animalId);
    if (!animal) return;

    if (action === "tech_submit") {
      if (op.technicianUserId !== user.id && !canSuperviseAnimalFacility(user.roles)) return;
      if (op.status !== "open") return;
      op.status = "tech_submitted";
      op.techSubmittedAt = now;
      op.backfill = isBackfillProcessing(op.startedAt || op.createdAt, now);
      animal.lastOpBackfill = op.backfill;
      op.resultNote = String(body.resultNote ?? "").trim();
      op.resultImageUrls = Array.isArray(body.resultImageUrls)
        ? body.resultImageUrls.map((u: unknown) => String(u)).filter(Boolean)
        : body.resultImageUrl
          ? [String(body.resultImageUrl)]
          : op.resultImageUrls;
      op.updatedAt = now;
      notifyStudentId = op.studentUserId;
      appendLifecycleTrace(s, {
        animalId: op.animalId,
        timestamp: now,
        action: "tech_submit",
        userId: user.id,
        userName: user.name,
        details: `${op.backfill ? "【补录】" : ""}技术员提交实验结果：${op.resultNote || "—"}`,
        operationId: op.id,
      });
    } else if (action === "student_close") {
      if (op.studentUserId !== user.id && !canSuperviseAnimalFacility(user.roles)) return;
      if (op.status !== "tech_submitted") return;
      const nas = String(body.nasDataPath ?? "").trim();
      if (!nas) return;
      op.nasDataPath = nas;
      op.status = "closed";
      op.closedAt = now;
      op.updatedAt = now;
      if (!op.backfill) {
        op.backfill = isBackfillProcessing(op.startedAt || op.createdAt, now);
      }
      animal.lastOpBackfill = op.backfill;
      setRegistrationStatus(animal, "awaiting_experiment");
      appendLifecycleTrace(s, {
        animalId: op.animalId,
        timestamp: now,
        action: "student_close",
        userId: user.id,
        userName: user.name,
        details: `${op.backfill ? "【补录】" : ""}学生完成闭环，NAS：${nas}`,
        operationId: op.id,
      });
    } else if (action === "force_close") {
      if (!canSuperviseAnimalFacility(user.roles)) return;
      if (op.status === "closed" || op.status === "force_closed") return;
      op.status = "force_closed";
      op.closedAt = now;
      op.forceClosedBy = user.id;
      op.forceClosedByName = user.name;
      op.forceCloseReason = String(body.reason ?? "").trim() || "主管强制关闭";
      op.updatedAt = now;
      if (!op.backfill) {
        op.backfill = isBackfillProcessing(op.startedAt || op.createdAt, now);
      }
      animal.lastOpBackfill = op.backfill;
      setRegistrationStatus(animal, "awaiting_experiment");
      appendLifecycleTrace(s, {
        animalId: op.animalId,
        timestamp: now,
        action: "force_close",
        userId: user.id,
        userName: user.name,
        details: `${op.backfill ? "【补录】" : ""}${op.forceCloseReason}`,
        operationId: op.id,
      });
    } else {
      return;
    }

    s.experimentOperations![idx] = op;
    updated = { ...op };
  });

  if (!updated) return jsonError("invalid_state", 409);

  if (action === "tech_submit" && notifyStudentId) {
    await mutateStore((s) => {
      pushNotificationToUsers(s, [notifyStudentId!], {
        title: "实验已完成，请上传 NAS 路径",
        titleEn: "Experiment submitted — upload NAS path",
        message: `小鼠 ${(updated as ExperimentOperation).animalId} 的技术员阶段已提交，请上传 NAS 数据路径并完成闭环。`,
        messageEn: `Technician submitted results for ${(updated as ExperimentOperation).animalId}. Upload NAS path to close.`,
        link: `/animals/lifecycle?animalId=${(updated as ExperimentOperation).animalId}`,
        kind: "experiment_operation",
        operationId: (updated as ExperimentOperation).id,
        animalId: (updated as ExperimentOperation).animalId,
      });
    });
  }

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: `operation_${action}`,
    entityType: "experiment_operation",
    entityId: id,
    details: `${(updated as ExperimentOperation).animalId} · ${action}`,
  });

  return jsonOk({ operation: updated });
}
