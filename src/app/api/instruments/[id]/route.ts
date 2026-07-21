import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { Instrument, InstrumentStepContact } from "@/types";
import {
  clampBookingHours,
  normalizeInstrument,
  normalizeInstrumentContacts,
} from "@/lib/instruments";
import { canManageInstruments } from "@/lib/roles";
import { deleteInstrumentImageFile } from "@/server/instrument-images";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageInstruments(user.roles)) return jsonError("forbidden", 403);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  let updated: Instrument | null = null;

  await mutateStore((s) => {
    const idx = s.instruments.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const prev = normalizeInstrument(s.instruments[idx]);
    const merged: Instrument = {
      ...prev,
      ...body,
      id,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
    };
    if (body.minBookingHours != null || body.maxBookingHours != null) {
      const hours = clampBookingHours(
        Number(body.minBookingHours ?? merged.minBookingHours),
        Number(body.maxBookingHours ?? merged.maxBookingHours)
      );
      merged.minBookingHours = hours.min;
      merged.maxBookingHours = hours.max;
    }
    if (Array.isArray(body.contacts)) {
      merged.contacts = normalizeInstrumentContacts(
        body.contacts as InstrumentStepContact[],
        user.name,
        String(body.contactPhone ?? merged.contactPhone),
        String(body.contactUserId ?? merged.contactUserId)
      );
    } else {
      merged.contacts = normalizeInstrumentContacts(
        merged.contacts,
        user.name,
        merged.contactPhone,
        merged.contactUserId
      );
    }
    const approval = merged.contacts.find((c) => c.step === "approval");
    if (approval) {
      merged.contactPhone = approval.phone || merged.contactPhone;
      if (approval.userId) merged.contactUserId = approval.userId;
    }
    if (merged.status !== "maintenance") {
      merged.maintenanceUntil = undefined;
      merged.maintenanceNote = undefined;
    }
    updated = normalizeInstrument(merged);
    s.instruments[idx] = updated;

    // When assigning an owner, ensure they can act as instrument_manager
    const ownerId = updated.contactUserId;
    if (ownerId) {
      s.users = s.users.map((u) => {
        if (u.id !== ownerId) return u;
        if (u.roles.includes("instrument_manager") || u.roles.includes("instrument_super_admin")) {
          return u;
        }
        return { ...u, roles: [...u.roles, "instrument_manager"] };
      });
    }
  });

  if (!updated) return jsonError("not_found", 404);
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "update",
    entityType: "instrument",
    entityId: id,
    details: `更新仪器 ${id}`,
  });
  return jsonOk({ instrument: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageInstruments(user.roles)) return jsonError("forbidden", 403);

  const { id } = await params;
  let found = false;
  let imageId: string | undefined;
  await mutateStore((s) => {
    const target = s.instruments.find((i) => i.id === id);
    imageId = target?.imageId;
    const before = s.instruments.length;
    s.instruments = s.instruments.filter((i) => i.id !== id);
    found = s.instruments.length < before;
  });
  if (!found) return jsonError("not_found", 404);
  if (imageId) deleteInstrumentImageFile(imageId);
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "delete",
    entityType: "instrument",
    entityId: id,
    details: `删除仪器 ${id}`,
  });
  return jsonOk({ ok: true });
}
