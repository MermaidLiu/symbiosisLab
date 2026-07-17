import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore } from "@/server/store";
import { canManageAnimals } from "@/lib/roles";
import { appendAuditLog } from "@/server/audit";
import {
  AnimalPurpose,
  ANIMAL_PURPOSES,
  ManagedAnimal,
  ManagedAnimalStatus,
} from "@/types/animal-management";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ managedAnimals: getStore().managedAnimals });
}

/** POST — create a managed animal (managers only) */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageAnimals(user.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  const gender = body.gender === "female" ? "female" : body.gender === "male" ? "male" : "";
  const strain = String(body.strain ?? "").trim();
  const genotype = String(body.genotype ?? "").trim() || "未知";
  const cageLocation = String(body.cageLocation ?? "").trim();
  const birthDate = String(body.birthDate ?? "").trim();
  const purpose = (body.purpose ?? "blank") as AnimalPurpose;
  const status = (body.status ?? "active") as ManagedAnimalStatus;

  if (!id || !gender || !strain || !cageLocation || !birthDate) {
    return jsonError("invalid_body", 400);
  }
  if (!ANIMAL_PURPOSES.includes(purpose)) return jsonError("invalid_body", 400);

  if (getStore().managedAnimals.some((a) => a.id === id)) {
    return jsonError("duplicate_id", 409);
  }

  const ageWeeks = Math.max(
    0,
    Math.floor((Date.now() - new Date(birthDate).getTime()) / (7 * 24 * 60 * 60 * 1000))
  );

  const animal: ManagedAnimal = {
    id,
    gender,
    strain,
    genotype,
    sireId: String(body.sireId ?? "—").trim() || "—",
    sireGenotype: String(body.sireGenotype ?? "—").trim() || "—",
    damId: String(body.damId ?? "—").trim() || "—",
    damGenotype: String(body.damGenotype ?? "—").trim() || "—",
    birthDate,
    ageWeeks: Number.isFinite(ageWeeks) ? ageWeeks : 0,
    cageLocation,
    status: ["active", "breeding", "quarantine", "reserved", "deceased"].includes(status)
      ? status
      : "active",
    strainType: body.strainType === "private" ? "private" : "public",
    generation: Math.max(0, Number(body.generation ?? 1) || 1),
    weaningStatus: body.weaningStatus === "not_weaned" ? "not_weaned" : "weaned",
    genotypeStatus: body.genotypeStatus === "unidentified" ? "unidentified" : "identified",
    purpose,
    lifecycleStatus: "entered",
    cageId: body.cageId ? String(body.cageId) : undefined,
  };

  await mutateStore((s) => {
    s.managedAnimals = [animal, ...s.managedAnimals];
  });

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "create",
    entityType: "managed_animal",
    entityId: animal.id,
    details: `新增代管动物: ${animal.id}`,
  });

  return jsonOk({ animal, managedAnimals: getStore().managedAnimals }, { status: 201 });
}

/** DELETE ?id= — remove a managed animal (managers only) */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageAnimals(user.roles)) return jsonError("forbidden", 403);

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("invalid_body", 400);

  const existing = getStore().managedAnimals.find((a) => a.id === id);
  if (!existing) return jsonError("not_found", 404);

  await mutateStore((s) => {
    s.managedAnimals = s.managedAnimals.filter((a) => a.id !== id);
  });

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "delete",
    entityType: "managed_animal",
    entityId: id,
    details: `移除代管动物: ${id}`,
  });

  return jsonOk({ managedAnimals: getStore().managedAnimals });
}
