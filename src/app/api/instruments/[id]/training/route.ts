import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { getStore, mutateStore } from "@/server/store";
import { appendAuditLog } from "@/server/audit";

/** Grant or revoke instrument training for a user */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getCurrentUser();
  if (!actor) return jsonError("unauthorized", 401);
  if (!requireRole(actor, "instrument_manager")) return jsonError("forbidden", 403);

  const { id: instrumentId } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  const action = body.action === "revoke" ? "revoke" : "grant";
  if (!userId) return jsonError("invalid_body", 400);

  const store = getStore();
  if (!store.instruments.some((i) => i.id === instrumentId)) {
    return jsonError("instrument_not_found", 404);
  }

  let updatedUser = null as (typeof store.users)[number] | null;
  await mutateStore((s) => {
    const idx = s.users.findIndex((u) => u.id === userId);
    if (idx < 0) return;
    const ids = new Set(s.users[idx].trainedInstrumentIds ?? []);
    if (action === "grant") ids.add(instrumentId);
    else ids.delete(instrumentId);
    s.users[idx] = {
      ...s.users[idx],
      trainedInstrumentIds: [...ids],
    };
    updatedUser = s.users[idx];
  });

  if (!updatedUser) return jsonError("user_not_found", 404);

  await appendAuditLog({
    userId: actor.id,
    userName: actor.name,
    action: action === "grant" ? "grant_training" : "revoke_training",
    entityType: "instrument",
    entityId: instrumentId,
    details: `${action} training for ${updatedUser.name} on ${instrumentId}`,
  });

  const { password: _, ...publicUser } = updatedUser;
  return jsonOk({ user: publicUser });
}
