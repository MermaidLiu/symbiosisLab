import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { Animal } from "@/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ animals: getStore().animals });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!requireRole(user, "animal_manager")) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const item: Animal = {
    id: uid("ani"),
    name: String(body.name ?? ""),
    nameEn: String(body.nameEn ?? ""),
    species: String(body.species ?? ""),
    speciesEn: String(body.speciesEn ?? ""),
    strain: String(body.strain ?? ""),
    identifier: String(body.identifier ?? ""),
    sex: body.sex ?? "unknown",
    location: String(body.location ?? ""),
    status: body.status ?? "available",
    contactUserId: String(body.contactUserId ?? user.id),
    contactPhone: String(body.contactPhone ?? ""),
    notes: String(body.notes ?? ""),
    notesEn: String(body.notesEn ?? ""),
    tags: Array.isArray(body.tags) ? body.tags : [],
    createdAt: now,
    updatedAt: now,
  };
  if (!item.name) return jsonError("invalid_body", 400);

  await mutateStore((s) => {
    s.animals.push(item);
  });
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "create",
    entityType: "animal",
    entityId: item.id,
    details: `添加动物资源: ${item.name}`,
  });
  return jsonOk({ animal: item }, { status: 201 });
}
