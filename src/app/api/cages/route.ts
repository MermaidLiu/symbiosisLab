import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore } from "@/server/store";
import { canSuperviseAnimalFacility, hasRole } from "@/lib/roles";
import { appendAuditLog } from "@/server/audit";
import { buildFacilityCageCells } from "@/lib/animals/facility-board";
import { Cage, CageStatus } from "@/types/animal-management";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ cages: getStore().cages });
}

/** POST — create a cage (facility supervisor / admin) */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canSuperviseAnimalFacility(user.roles) && !hasRole(user.roles, "super_admin")) {
    return jsonError("forbidden", 403);
  }

  const body = await req.json().catch(() => ({}));
  const number = String(body.number ?? "").trim().toUpperCase();
  const rack = String(body.rack ?? "").trim() || "Rack A";
  const strain = String(body.strain ?? "").trim() || "—";
  const cageType = body.cageType === "breeding" ? "breeding" : "standard";
  const capacityRaw = Number(body.capacity);
  const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? Math.floor(capacityRaw) : 5;

  if (!number) return jsonError("invalid_body", 400);

  const id = String(body.id ?? "").trim() || `c-${number.toLowerCase()}`;
  const store = getStore();
  if (store.cages.some((c) => c.id === id || c.number.toUpperCase() === number)) {
    return jsonError("duplicate_cage", 409);
  }

  const cage: Cage = {
    id,
    number,
    rack,
    strain,
    cageType,
    capacity,
    occupied: 0,
    status: "vacant" as CageStatus,
  };

  await mutateStore((s) => {
    s.cages.push(cage);
  });

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "create",
    entityType: "cage",
    entityId: cage.id,
    details: `新增笼位 ${cage.rack} / ${cage.number}`,
  });

  const s = getStore();
  return jsonOk({
    cage,
    cages: s.cages,
    cells: buildFacilityCageCells(s.cages, s.managedAnimals),
  });
}
