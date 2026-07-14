import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { Instrument } from "@/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ instruments: getStore().instruments });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!requireRole(user, "instrument_manager")) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const item: Instrument = {
    id: uid("inst"),
    name: String(body.name ?? ""),
    nameEn: String(body.nameEn ?? ""),
    model: String(body.model ?? ""),
    location: String(body.location ?? ""),
    description: String(body.description ?? ""),
    descriptionEn: String(body.descriptionEn ?? ""),
    status: body.status ?? "available",
    contactUserId: String(body.contactUserId ?? user.id),
    contactPhone: String(body.contactPhone ?? ""),
    tags: Array.isArray(body.tags) ? body.tags : [],
    specs: Array.isArray(body.specs) ? body.specs : [],
    accessories: Array.isArray(body.accessories) ? body.accessories : [],
    trainingRequired: Boolean(body.trainingRequired),
    minBookingHours: Number(body.minBookingHours ?? 2),
    maxBookingHours: Number(body.maxBookingHours ?? 24),
    createdAt: now,
    updatedAt: now,
  };

  if (!item.name) return jsonError("invalid_body", 400);

  await mutateStore((s) => {
    s.instruments.push(item);
  });
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "create",
    entityType: "instrument",
    entityId: item.id,
    details: `添加仪器: ${item.name}`,
  });

  return jsonOk({ instrument: item }, { status: 201 });
}
