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
  const animal = findAnimal(store, animalId);
  if (!animal) return jsonError("not_found", 404);
  normalizeLegacyRegistration(animal);

  const canView =
    canViewAllAnimalLifecycle(user.roles) ||
    animal.claimantUserId === user.id ||
    animal.technicianUserId === user.id ||
    canManageAnimals(user.roles);
  if (!canView) return jsonError("forbidden", 403);

  const operations = (store.experimentOperations ?? []).filter((op) => op.animalId === animalId);
  const traces = (store.animalLifecycleTraces ?? []).filter((t) => t.animalId === animalId);

  return jsonOk({ animal, operations, traces, labels: REGISTRATION_LABELS });
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
    // 任意已激活账号可录入（认领人=当前用户）；二维码未到位时可用 ML0001 等笼号测试
    const raw = String(body.cageCode ?? body.animalId ?? "").trim();
    if (!raw) return jsonError("invalid_body", 400);

    // 永久 Animal ID 仅匹配 M + 12 位数字（勿把 ML0001 之类笼号当成 Animal ID）
    const idMatch = raw.match(/\b(M\d{12})\b/i);
    const cageIdMatch = raw.match(/cageId=([^&\s]+)/i);
    const cageCode = (
      cageIdMatch
        ? decodeURIComponent(cageIdMatch[1])
        : idMatch
          ? idMatch[1]
          : raw
    )
      .trim()
      .toUpperCase()
      .slice(0, 64);

    if (!cageCode) return jsonError("invalid_body", 400);

    const now = new Date().toISOString();
    let result: ManagedAnimal | null = null;
    let created = false;

    await mutateStore((s) => {
      const ensureImplant = (animal: ManagedAnimal, at: string) => {
        // 录入成功时间即植入时间
        if (!animal.implantAt) {
          animal.implantAt = animal.registeredAt || at;
        }
        if (animal.lifecycleStatus === "entered" || !animal.lifecycleStatus) {
          animal.lifecycleStatus = "electrode_implant";
        }
      };

      // 已有永久 ID：若空白则认领建档；若已是本人名下则直接返回
      if (idMatch) {
        const existingId = idMatch[1].toUpperCase();
        const animal = findAnimal(s, existingId);
        if (animal) {
          normalizeLegacyRegistration(animal);
          if (animal.claimantUserId === user.id) {
            if (
              animal.registrationStatus === "blank_claimed" ||
              animal.registrationStatus === "awaiting_register" ||
              animal.registrationStatus === "blank_available"
            ) {
              animal.registrationStatus = "awaiting_experiment";
              animal.registeredAt = animal.registeredAt || now;
              animal.animalLock = false;
              animal.purpose = animal.purpose === "blank" ? "signal_processing" : animal.purpose;
              appendLifecycleTrace(s, {
                animalId: animal.id,
                timestamp: now,
                action: "enroll_from_cage",
                userId: user.id,
                userName: user.name,
                details: `扫码录入，确认建档 ${animal.id}`,
              });
            }
            ensureImplant(animal, now);
            result = { ...animal };
            return;
          }
          if (animal.registrationStatus === "blank_available" && !animal.claimantUserId) {
            animal.claimantUserId = user.id;
            animal.claimantName = user.name;
            animal.registrationStatus = "awaiting_experiment";
            animal.registeredAt = now;
            animal.implantAt = now;
            animal.animalLock = false;
            animal.purpose = "signal_processing";
            animal.lifecycleStatus = "electrode_implant";
            if (cageIdMatch) animal.cageId = cageCode;
            appendLifecycleTrace(s, {
              animalId: animal.id,
              timestamp: now,
              action: "enroll_from_cage",
              userId: user.id,
              userName: user.name,
              details: `扫码认领空白鼠并建档 ${animal.id}`,
            });
            result = { ...animal };
            return;
          }
          return; // 已被他人占用
        }
      }

      // 同笼码已录入过（本人）→ 返回已有记录（补写缺失的植入时间）
      const byCage = s.managedAnimals.find(
        (a) =>
          a.claimantUserId === user.id &&
          (a.cageId === cageCode || a.cageLocation === cageCode)
      );
      if (byCage) {
        normalizeLegacyRegistration(byCage);
        ensureImplant(byCage, now);
        result = { ...byCage };
        return;
      }

      const id = generateAnimalId(s);
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
        cageLocation: String(body.cageLocation ?? cageCode).trim() || cageCode,
        status: "active",
        strainType: "public",
        generation: 1,
        weaningStatus: "weaned",
        genotypeStatus: "unidentified",
        purpose: "signal_processing",
        lifecycleStatus: "electrode_implant",
        registrationStatus: "awaiting_experiment",
        animalLock: false,
        registeredAt: now,
        implantAt: now,
        cageId: cageCode,
        claimantUserId: user.id,
        claimantName: user.name,
      };
      s.managedAnimals = [animal, ...s.managedAnimals];
      appendLifecycleTrace(s, {
        animalId: id,
        timestamp: now,
        action: "enroll_from_cage",
        userId: user.id,
        userName: user.name,
        details: `扫码录入小鼠，分配 ID ${id}（笼码 ${cageCode}）`,
      });
      result = { ...animal };
      created = true;
    });

    if (!result) return jsonError("cage_occupied_or_invalid", 409);

    await appendAuditLog({
      userId: user.id,
      userName: user.name,
      action: "enroll_from_cage",
      entityType: "managed_animal",
      entityId: (result as ManagedAnimal).id,
      details: created
        ? `扫码新建 ${(result as ManagedAnimal).id}`
        : `扫码确认 ${(result as ManagedAnimal).id}`,
    });

    return jsonOk({ animal: result, created }, { status: created ? 201 : 200 });
  }

  if (action === "lookup") {
    const animalId = String(body.animalId ?? "").trim();
    if (!animalId) return jsonError("invalid_body", 400);
    const animal = findAnimal(getStore(), animalId);
    if (!animal) return jsonError("not_found", 404);
    normalizeLegacyRegistration(animal);
    return jsonOk({ animal, label: REGISTRATION_LABELS[animal.registrationStatus ?? "blank_available"] });
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
      animal.implantAt = animal.implantAt || now;
      animal.lifecycleStatus = "electrode_implant";
      animal.cageLabelNote = String(body.cageLabelNote ?? "").trim();
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
