import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { Instrument, InstrumentStepContact } from "@/types";
import {
  BOOKING_HOURS_CEILING,
  BOOKING_HOURS_FLOOR,
  clampBookingHours,
  normalizeInstrument,
  normalizeInstrumentContacts,
} from "@/lib/instruments";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({
    instruments: getStore().instruments.map((i) => normalizeInstrument(i)),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!requireRole(user, "instrument_manager")) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const hours = clampBookingHours(
    Number(body.minBookingHours ?? BOOKING_HOURS_FLOOR),
    Number(body.maxBookingHours ?? BOOKING_HOURS_CEILING)
  );
  const contactPhone = String(body.contactPhone ?? user.phone ?? "");
  const contactUserId = String(body.contactUserId ?? user.id);
  const contacts = normalizeInstrumentContacts(
    Array.isArray(body.contacts) ? (body.contacts as InstrumentStepContact[]) : undefined,
    user.name,
    contactPhone,
    contactUserId
  );
  const approval = contacts.find((c) => c.step === "approval");

  const status = body.status === "maintenance" || body.status === "retired" ? body.status : "available";
  const item: Instrument = normalizeInstrument({
    id: uid("inst"),
    name: String(body.name ?? ""),
    nameEn: String(body.nameEn ?? ""),
    model: String(body.model ?? ""),
    location: String(body.location ?? ""),
    description: String(body.description ?? ""),
    descriptionEn: String(body.descriptionEn ?? ""),
    status,
    contactUserId: approval?.userId || contactUserId,
    contactPhone: approval?.phone || contactPhone,
    contacts,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    specs: Array.isArray(body.specs) ? body.specs : [],
    accessories: Array.isArray(body.accessories) ? body.accessories : [],
    trainingRequired: Boolean(body.trainingRequired),
    minBookingHours: hours.min,
    maxBookingHours: hours.max,
    imageId: body.imageId ? String(body.imageId) : undefined,
    maintenanceUntil:
      status === "maintenance" && body.maintenanceUntil
        ? String(body.maintenanceUntil)
        : undefined,
    maintenanceNote:
      status === "maintenance" && body.maintenanceNote
        ? String(body.maintenanceNote)
        : undefined,
    createdAt: now,
    updatedAt: now,
  });

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
