import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore } from "@/server/store";
import { createBookingAtomic, updateBookingStatusAtomic } from "@/server/booking";
import { BookingStatus } from "@/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ bookings: getStore().bookings });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const resourceType = body.resourceType as "instrument" | "animal";
  const resourceId = String(body.resourceId ?? "");
  const startTime = String(body.startTime ?? "");
  const endTime = String(body.endTime ?? "");
  const purpose = String(body.purpose ?? "");

  if (!resourceType || !resourceId || !startTime || !endTime || !purpose.trim()) {
    return jsonError("invalid_body", 400);
  }

  if (new Date(endTime) <= new Date(startTime)) {
    return jsonError("invalid_time_range", 400);
  }

  const result = await createBookingAtomic({
    resourceType,
    resourceId,
    userId: user.id,
    userName: user.name,
    startTime,
    endTime,
    purpose: purpose.trim(),
  });

  if (!result.ok) {
    const status = result.error === "slot_taken" ? 409 : 404;
    return jsonError(result.error, status);
  }

  return jsonOk({ booking: result.booking }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const status = body.status as BookingStatus;
  if (!id || !status) return jsonError("invalid_body", 400);

  const result = await updateBookingStatusAtomic({
    id,
    status,
    actorId: user.id,
    actorName: user.name,
  });

  if (!result.ok) {
    const code = result.error === "slot_taken" ? 409 : 404;
    return jsonError(result.error, code);
  }

  return jsonOk({ booking: result.booking, bookings: getStore().bookings });
}
