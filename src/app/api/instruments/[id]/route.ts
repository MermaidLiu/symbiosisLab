import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { getStore, mutateStore } from "@/server/store";
import { appendAuditLog } from "@/server/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!requireRole(user, "instrument_manager")) return jsonError("forbidden", 403);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  let updated = null as ReturnType<typeof getStore>["instruments"][number] | null;

  await mutateStore((s) => {
    const idx = s.instruments.findIndex((i) => i.id === id);
    if (idx < 0) return;
    s.instruments[idx] = {
      ...s.instruments[idx],
      ...body,
      id,
      createdAt: s.instruments[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    updated = s.instruments[idx];
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
  if (!requireRole(user, "instrument_manager")) return jsonError("forbidden", 403);

  const { id } = await params;
  let found = false;
  await mutateStore((s) => {
    const before = s.instruments.length;
    s.instruments = s.instruments.filter((i) => i.id !== id);
    found = s.instruments.length < before;
  });
  if (!found) return jsonError("not_found", 404);
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
