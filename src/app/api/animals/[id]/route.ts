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
  if (!requireRole(user, "animal_manager")) return jsonError("forbidden", 403);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  let updated = null as ReturnType<typeof getStore>["animals"][number] | null;

  await mutateStore((s) => {
    const idx = s.animals.findIndex((a) => a.id === id);
    if (idx < 0) return;
    s.animals[idx] = {
      ...s.animals[idx],
      ...body,
      id,
      createdAt: s.animals[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    updated = s.animals[idx];
  });

  if (!updated) return jsonError("not_found", 404);
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "update",
    entityType: "animal",
    entityId: id,
    details: `更新动物资源 ${id}`,
  });
  return jsonOk({ animal: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!requireRole(user, "animal_manager")) return jsonError("forbidden", 403);

  const { id } = await params;
  let found = false;
  await mutateStore((s) => {
    const before = s.animals.length;
    s.animals = s.animals.filter((a) => a.id !== id);
    found = s.animals.length < before;
  });
  if (!found) return jsonError("not_found", 404);
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "delete",
    entityType: "animal",
    entityId: id,
    details: `删除动物资源 ${id}`,
  });
  return jsonOk({ ok: true });
}
