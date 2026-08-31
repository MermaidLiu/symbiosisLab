import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { appendAuditLog } from "@/server/audit";
import {
  appendLifecycleTrace,
  assertCanCreateOperation,
  findAnimal,
  openOperationForAnimal,
  OPERATION_STATUS_LABELS,
  setRegistrationStatus,
} from "@/server/animal-lifecycle";
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

function isKind(v: unknown): v is ExperimentKind {
  return EXPERIMENT_KINDS.includes(v as ExperimentKind);
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

/** POST — 技术员扫码后创建 Operation（自动绑定当前账号） */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!isAnimalExperimentTechnician(user.roles)) {
    return jsonError("forbidden", 403);
  }

  const body = await req.json().catch(() => ({}));
  const animalId = String(body.animalId ?? "").trim();
  const kind = isKind(body.kind) ? body.kind : "other";
  const title = String(body.title ?? "").trim() || "实验操作";

  if (!animalId) return jsonError("invalid_body", 400);

  const store = getStore();
  const animal = findAnimal(store, animalId);
  if (!animal) return jsonError("not_found", 404);

  const block = assertCanCreateOperation(animal, store);
  if (block) return jsonError(block, 409);

  const now = new Date().toISOString();
  const op: ExperimentOperation = {
    id: uid("exp"),
    animalId,
    status: "open",
    kind,
    title,
    technicianUserId: user.id,
    technicianName: user.name,
    studentUserId: animal.claimantUserId ?? "",
    studentName: animal.claimantName ?? "",
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
    a.technicianUserId = user.id;
    a.technicianName = user.name;
    appendLifecycleTrace(s, {
      animalId,
      timestamp: now,
      action: "operation_created",
      userId: user.id,
      userName: user.name,
      details: `创建实验 Operation：${title}（${kind}）`,
      operationId: op.id,
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
    details: `${animalId} · ${title}`,
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
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

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
        details: `技术员提交实验结果：${op.resultNote || "—"}`,
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
      setRegistrationStatus(animal, "awaiting_experiment");
      appendLifecycleTrace(s, {
        animalId: op.animalId,
        timestamp: now,
        action: "student_close",
        userId: user.id,
        userName: user.name,
        details: `学生完成闭环，NAS：${nas}`,
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
      setRegistrationStatus(animal, "awaiting_experiment");
      appendLifecycleTrace(s, {
        animalId: op.animalId,
        timestamp: now,
        action: "force_close",
        userId: user.id,
        userName: user.name,
        details: op.forceCloseReason,
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
