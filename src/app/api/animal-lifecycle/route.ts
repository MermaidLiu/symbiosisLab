import { POST as enrollInCage } from "@/app/api/cage-workflow/route";
import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireActiveUser } from "@/server/auth";
import { appendAuditLog } from "@/server/audit";
import {
  appendLifecycleTrace,
  findAnimal,
  generateAnimalId,
  isPermanentAnimalId,
  normalizeLegacyRegistration,
  openOperationForAnimal,
  REGISTRATION_LABELS,
  setRegistrationStatus,
} from "@/server/animal-lifecycle";
import { pushNotificationToUsers } from "@/server/notify";
import {
  canManageAnimals,
  canSuperviseAnimalFacility,
  canViewAllAnimalLifecycle,
  isAnimalClaimantStudent,
  isAnimalExperimentTechnician,
} from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import { DEATH_METHODS, DeathMethod, ManagedAnimal } from "@/types/animal-management";
import { AnimalRegistrationStatus } from "@/types/animal-lifecycle";
import { displayName } from "@/lib/users";

/** GET /api/animal-lifecycle?animalId= — 查询小鼠 + 追溯 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const animalId = req.nextUrl.searchParams.get("animalId")?.trim();
  if (!animalId) {
    const store = getStore();
    let animals = store.managedAnimals.map((a) => {
      normalizeLegacyRegistration(a);
      return a;
    });
    if (!canViewAllAnimalLifecycle(user.roles)) {
      if (isAnimalClaimantStudent(user.roles)) {
        animals = animals.filter((a) => a.claimantUserId === user.id);
      } else if (!canManageAnimals(user.roles)) {
        animals = animals.filter(
          (a) => a.claimantUserId === user.id || a.technicianUserId === user.id
        );
      }
    }
    const operations = (store.experimentOperations ?? []).filter((op) =>
      canViewAllAnimalLifecycle(user.roles)
        ? true
        : op.studentUserId === user.id || op.technicianUserId === user.id
    );
    return jsonOk({
      animals,
      operations,
      traces: store.animalLifecycleTraces ?? [],
      labels: REGISTRATION_LABELS,
    });
  }

  const store = getStore();
  const animal = findAnimal(store, animalId) || store.managedAnimals.find(a => a.qrCode === animalId);
  if (!animal) return jsonError("not_found", 404);
  normalizeLegacyRegistration(animal);

  const canView =
    canViewAllAnimalLifecycle(user.roles) ||
    animal.claimantUserId === user.id ||
    animal.technicianUserId === user.id ||
    canManageAnimals(user.roles);
  if (!canView) return jsonError("forbidden", 403);

  const operations = (store.experimentOperations ?? []).filter((op) => op.animalId === animal.id);
  const traces = (store.animalLifecycleTraces ?? []).filter((t) => t.animalId === animal.id);

  return jsonOk({ animal, operations, traces, tasks:(store.animalOpTasks||[]).filter(t=>t.animalIds.includes(animal.id)), labels: REGISTRATION_LABELS });
}

/**
 * POST /api/animal-lifecycle
 * action: create_blank | claim_blank | complete_surgery | register | enroll_from_cage | lookup
 */
export async function POST(req: NextRequest) {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  /**
   * 学生手机扫笼码录入：分配永久 Animal ID，直接进入「待实验」（不再是空白鼠）
   * cageCode 可为笼位二维码原文、cageId=xxx、或已有 M############
   */
  if (action === "enroll_from_cage") {
    return enrollInCage(new NextRequest(req.url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action:"enroll",id:body.customId,qrCode:body.cageCode,entryType:body.entryType,entryTypeOther:body.entryTypeOther,housingType:body.housingType,ageWeeks:body.ageWeeks,cageNumber:body.cageNumber,entryDate:body.entryDate,strain:body.strain,note:body.note,ownerUserId:body.ownerUserId || user.id})}));
  }

  /** 技术员按笼号/笼码查找小鼠（核验是否与派发 ID 一致） */
  if (action === "lookup_cage") {
    const raw = String(body.cageCode ?? body.animalId ?? "").trim();
    if (!raw) return jsonError("invalid_body", 400);
    const code = raw.toUpperCase();
    const store = getStore();
    const idMatch = code.match(/\b(M\d{12})\b/);
    let animal =
      (idMatch && findAnimal(store, idMatch[1])) ||
      store.managedAnimals.find(
        (a) =>
          a.id.toUpperCase() === code ||
          a.qrCode === raw ||
          (a.cageId && a.cageId.toUpperCase() === code) ||
          (a.cageLocation && a.cageLocation.toUpperCase() === code)
      );
    if (!animal) return jsonError("not_found", 404);
    normalizeLegacyRegistration(animal);
    const canView =
      canViewAllAnimalLifecycle(user.roles) ||
      animal.claimantUserId === user.id ||
      animal.technicianUserId === user.id ||
      canManageAnimals(user.roles);
    if (!canView) return jsonError("forbidden", 403);
    const operations = (store.experimentOperations ?? []).filter((op) => op.animalId === animal!.id);
    return jsonOk({
      animal,
      operations,
      label: REGISTRATION_LABELS[animal.registrationStatus ?? "blank_available"],
    });
  }

  if (action === "create_blank") {
    if (!canSuperviseAnimalFacility(user.roles) && !canManageAnimals(user.roles)) {
      return jsonError("forbidden", 403);
    }
    const store = getStore();
    const id = generateAnimalId(store);
    const now = new Date().toISOString();
    const animal: ManagedAnimal = {
      id,
      gender: body.gender === "female" ? "female" : "male",
      strain: String(body.strain ?? "C57BL/6").trim() || "C57BL/6",
      genotype: String(body.genotype ?? "未知").trim() || "未知",
      sireId: "—",
      sireGenotype: "—",
      damId: "—",
      damGenotype: "—",
      birthDate: String(body.birthDate ?? now.slice(0, 10)),
      ageWeeks: 0,
      cageLocation: String(body.cageLocation ?? "待分配").trim() || "待分配",
      status: "active",
      strainType: "public",
      generation: 1,
      weaningStatus: "weaned",
      genotypeStatus: "unidentified",
      purpose: "blank",
      lifecycleStatus: "entered",
      registrationStatus: "blank_available",
      animalLock: false,
      cageId: body.cageId ? String(body.cageId) : undefined,
    };

    await mutateStore((s) => {
      s.managedAnimals = [animal, ...s.managedAnimals];
      appendLifecycleTrace(s, {
        animalId: id,
        timestamp: now,
        action: "create_blank",
        userId: user.id,
        userName: user.name,
        details: `主管创建空白鼠 ${id}`,
      });
    });

    await appendAuditLog({
      userId: user.id,
      userName: user.name,
      action: "create_blank_animal",
      entityType: "managed_animal",
      entityId: id,
      details: `创建空白鼠 ${id}`,
    });

    return jsonOk({ animal }, { status: 201 });
  }

  if (action === "claim_blank") {
    if (!isAnimalClaimantStudent(user.roles) && !canManageAnimals(user.roles)) {
      return jsonError("forbidden", 403);
    }
    const animalId = String(body.animalId ?? "").trim();
    if (!animalId) return jsonError("invalid_body", 400);

    let updated: ManagedAnimal | null = null;
    const now = new Date().toISOString();
    await mutateStore((s) => {
      const animal = findAnimal(s, animalId);
      if (!animal) return;
      normalizeLegacyRegistration(animal);
      if (animal.registrationStatus !== "blank_available") return;
      animal.claimantUserId = user.id;
      animal.claimantName = user.name;
      animal.registrationStatus = "blank_claimed";
      animal.purpose = "signal_processing";
      appendLifecycleTrace(s, {
        animalId,
        timestamp: now,
        action: "claim_blank",
        userId: user.id,
        userName: user.name,
        details: `${user.name} 认领空白鼠`,
      });
      updated = { ...animal };
    });

    if (!updated) return jsonError("invalid_state", 409);
    return jsonOk({ animal: updated });
  }

  if (action === "complete_surgery") {
    const animalId = String(body.animalId ?? "").trim();
    if (!animalId) return jsonError("invalid_body", 400);
    const surgeryLocation = String(body.surgeryLocation || "").trim();
    const surgeryImages = Array.isArray(body.surgeryImageUrls) ? body.surgeryImageUrls.filter((u: unknown) => typeof u === "string" && u.startsWith("/uploads/experiments/")) : [];
    if (!surgeryLocation || !surgeryImages.length) return jsonError("surgery_location_and_photo_required", 400);

    let updated: ManagedAnimal | null = null;
    const now = new Date().toISOString();
    await mutateStore((s) => {
      const animal = findAnimal(s, animalId);
      if (!animal) return;
      if (animal.claimantUserId !== user.id && !canManageAnimals(user.roles)) return;
      normalizeLegacyRegistration(animal);
      if (
        animal.registrationStatus !== "blank_claimed" &&
        animal.registrationStatus !== "awaiting_register"
      ) {
        return;
      }
      animal.surgeryCompletedAt = now;
      animal.surgeryLocation = surgeryLocation;
      animal.surgeryImageUrls = surgeryImages;
      animal.implantAt = animal.implantAt || now;
      animal.lifecycleStatus = "electrode_implant";
      if (animal.claimantUserId === user.id && body.cageLabelNote !== undefined) animal.cageLabelNote = String(body.cageLabelNote).trim();
      animal.registrationStatus = "awaiting_register";
      appendLifecycleTrace(s, {
        animalId,
        timestamp: now,
        action: "complete_surgery",
        userId: user.id,
        userName: user.name,
        details: `植入手术完成，待扫码建档。笼牌：${animal.cageLabelNote || "—"}`,
      });
      updated = { ...animal };
    });

    if (!updated) return jsonError("invalid_state", 409);
    return jsonOk({ animal: updated });
  }

  if (action === "register") {
    const scannedId = String(body.animalId ?? "").trim();
    if (!scannedId) return jsonError("invalid_body", 400);

    let updated: ManagedAnimal | null = null;
    let newId: string | null = null;
    const now = new Date().toISOString();

    await mutateStore((s) => {
      const animal = findAnimal(s, scannedId);
      if (!animal) return;
      if (animal.claimantUserId !== user.id && !canManageAnimals(user.roles)) return;
      normalizeLegacyRegistration(animal);
      if (animal.registrationStatus !== "awaiting_register") return;

      if (!isPermanentAnimalId(animal.id)) {
        newId = generateAnimalId(s);
        const oldId = animal.id;
        animal.id = newId;
        for (const op of s.experimentOperations ?? []) {
          if (op.animalId === oldId) op.animalId = newId;
        }
        for (const t of s.animalLifecycleTraces ?? []) {
          if (t.animalId === oldId) t.animalId = newId;
        }
      }

      animal.registeredAt = now;
      animal.registrationStatus = "awaiting_experiment" as AnimalRegistrationStatus;
      animal.animalLock = false;
      if (body.cageLocation) animal.cageLocation = String(body.cageLocation).trim();
      if (body.cageId) animal.cageId = String(body.cageId);

      appendLifecycleTrace(s, {
        animalId: animal.id,
        timestamp: now,
        action: "register",
        userId: user.id,
        userName: user.name,
        details: newId
          ? `扫码建档，分配永久 ID ${animal.id}（原 ${scannedId}）`
          : `扫码确认建档 ${animal.id}`,
      });
      updated = { ...animal };
    });

    if (!updated) return jsonError("invalid_state", 409);

    await appendAuditLog({
      userId: user.id,
      userName: user.name,
      action: "register_animal",
      entityType: "managed_animal",
      entityId: (updated as ManagedAnimal).id,
      details: `小鼠正式建档 ${(updated as ManagedAnimal).id}`,
    });

    return jsonOk({ animal: updated, assignedId: newId });
  }

  /**
   * 登记死亡：内页填写死亡时间与原因后直接终止实验流程，
   * 并通知下一环节人员（学生/技术员）点击「我已知晓」查看详情。
   */
  if (action === "report_death") {
    const animalId = String(body.animalId ?? "").trim();
    const deathAt = String(body.deathAt ?? "").trim();
    const deathReason = String(body.deathReason ?? "").trim();
    const deathMethodRaw = String(body.deathMethod ?? "found_dead").trim();
    if (!animalId || !deathAt || !deathReason) return jsonError("invalid_body", 400);
    if (!DEATH_METHODS.includes(deathMethodRaw as DeathMethod)) {
      return jsonError("invalid_death_method", 400);
    }
    const deathMethod = deathMethodRaw as DeathMethod;
    if (Number.isNaN(new Date(deathAt).getTime())) return jsonError("invalid_death_at", 400);

    let updated: ManagedAnimal | null = null;
    const now = new Date().toISOString();

    await mutateStore((s) => {
      const animal = findAnimal(s, animalId);
      if (!animal) return;
      normalizeLegacyRegistration(animal);

      const openOp = openOperationForAnimal(s, animalId);
      const allowed =
        animal.claimantUserId === user.id ||
        animal.technicianUserId === user.id ||
        canManageAnimals(user.roles) ||
        canSuperviseAnimalFacility(user.roles) ||
        (isAnimalExperimentTechnician(user.roles) && openOp?.technicianUserId === user.id);
      if (!allowed) return;

      if (animal.registrationStatus === "deceased" && animal.deathAt) return;

      animal.deathAt = deathAt;
      animal.deathReason = deathReason;
      animal.deathMethod = deathMethod;
      animal.deathReportedByUserId = user.id;
      animal.deathReportedByName = displayName(user);
      animal.recordingStatus = "dead";
      animal.status = "deceased";
      animal.exitedAt = deathAt;
      animal.cageId = undefined;
      animal.cageLocation = "已退出";
      for (const cage of s.cages) cage.occupied = s.managedAnimals.filter(a => a.cageId === cage.id && !a.deathAt && !a.exitedAt && a.status !== "deceased").length;
      animal.lifecycleStatus = "euthanasia";
      animal.statusLabel = animal.statusLabel || "死亡";
      animal.statusColor = animal.statusColor || "rose";
      setRegistrationStatus(animal, "deceased");

      // 直接终止未闭环 Operation
      for (const op of s.experimentOperations ?? []) {
        if (op.animalId !== animalId) continue;
        if (op.status === "closed" || op.status === "force_closed") continue;
        op.status = "force_closed";
        op.closedAt = now;
        op.updatedAt = now;
        op.forceClosedBy = user.id;
        op.forceClosedByName = displayName(user);
        op.forceCloseReason = `小鼠死亡终止：${deathReason}`;
      }

      // 取消未完成的派发任务
      for (const task of s.animalOpTasks ?? []) {
        if (task.status !== "scheduled") continue;
        if (!task.animalIds.includes(animalId)) continue;
        task.status = "cancelled";
        task.receiptNote = `因小鼠死亡终止：${deathReason}`;
      }

      appendLifecycleTrace(s, {
        animalId: animal.id,
        timestamp: now,
        action: "report_death",
        userId: user.id,
        userName: displayName(user),
        details: `登记死亡并终止流程：${deathAt.slice(0, 16).replace("T", " ")} · ${deathMethod} · ${deathReason}`,
        operationId: openOp?.id,
      });

      const ids = new Set<string>();
      for (const person of s.users) if (canManageAnimals(person.roles)) ids.add(person.id);
      if (animal.claimantUserId && animal.claimantUserId !== user.id) ids.add(animal.claimantUserId);
      if (animal.technicianUserId && animal.technicianUserId !== user.id) {
        ids.add(animal.technicianUserId);
      }
      if (openOp?.studentUserId && openOp.studentUserId !== user.id) ids.add(openOp.studentUserId);
      if (openOp?.technicianUserId && openOp.technicianUserId !== user.id) {
        ids.add(openOp.technicianUserId);
      }

      pushNotificationToUsers(s, [...ids], {
        title: "小鼠死亡通知 · 请确认已知晓",
        titleEn: "Mouse death — please acknowledge",
        message: `${animal.id} 已登记死亡并终止实验。请点击「我已知晓」查看死亡时间与原因。`,
        messageEn: `${animal.id} was marked deceased and the experiment terminated. Tap Acknowledge to view details.`,
        link: `/animals/death?animalId=${animal.id}`,
        kind: "animal_death",
        animalId: animal.id,
        operationId: openOp?.id,
      });

      updated = { ...animal };
    });

    if (!updated) return jsonError("forbidden", 403);

    await appendAuditLog({
      userId: user.id,
      userName: displayName(user),
      action: "report_death",
      entityType: "managed_animal",
      entityId: animalId,
      details: `${animalId} deathAt=${deathAt} reason=${deathReason} terminated`,
    });

    return jsonOk({ animal: updated, terminated: true });
  }

  return jsonError("invalid_action", 400);
}
