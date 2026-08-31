import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireActiveUser } from "@/server/auth";
import { appendAuditLog } from "@/server/audit";
import {
  appendLifecycleTrace,
  findAnimal,
  generateAnimalId,
  isPermanentAnimalId,
  normalizeLegacyRegistration,
  REGISTRATION_LABELS,
} from "@/server/animal-lifecycle";
import { pushNotificationToUsers } from "@/server/notify";
import {
  canManageAnimals,
  canSuperviseAnimalFacility,
  canViewAllAnimalLifecycle,
  isAnimalClaimantStudent,
} from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import { ManagedAnimal } from "@/types/animal-management";
import { AnimalRegistrationStatus } from "@/types/animal-lifecycle";

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
 * action: create_blank | claim_blank | complete_surgery | register | lookup
 */
export async function POST(req: NextRequest) {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "lookup") {
    const animalId = String(body.animalId ?? "").trim();
    if (!animalId) return jsonError("invalid_body", 400);
    const animal = findAnimal(getStore(), animalId);
    if (!animal) return jsonError("not_found", 404);
    normalizeLegacyRegistration(animal);
    return jsonOk({ animal, label: REGISTRATION_LABELS[animal.registrationStatus ?? "blank_available"] });
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

  return jsonError("invalid_action", 400);
}
