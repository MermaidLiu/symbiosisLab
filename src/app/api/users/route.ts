import { NextRequest } from "next/server";
import {
  createUserByAdmin,
  getCurrentUser,
  jsonError,
  jsonOk,
  requireRole,
} from "@/server/auth";
import { getStore, mutateStore, publicUser } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { Role } from "@/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({
    users: getStore().users.map((u) => publicUser(u)),
  });
}

/** Admin creates a new account and assigns roles */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return jsonError("unauthorized", 401);
  if (!requireRole(me, "super_admin")) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();
  if (!email || !password || !name) return jsonError("invalid_body", 400);

  const roles = (Array.isArray(body.roles) ? body.roles : ["user"]) as Role[];

  const result = await createUserByAdmin({
    email,
    password,
    name,
    phone: body.phone ? String(body.phone) : undefined,
    department: body.department ? String(body.department) : undefined,
    roles,
    actorId: me.id,
    actorName: me.name,
  });

  if (!result.ok) return jsonError(result.error, 400);

  return jsonOk(
    {
      user: result.user,
      users: getStore().users.map((u) => publicUser(u)),
    },
    { status: 201 }
  );
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return jsonError("unauthorized", 401);
  if (!requireRole(me, "super_admin")) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  let roles = (Array.isArray(body.roles) ? body.roles : []) as Role[];
  if (!userId) return jsonError("invalid_body", 400);
  roles = Array.from(new Set(roles.includes("user") ? roles : [...roles, "user"])) as Role[];

  let targetEmail = "";
  await mutateStore((s) => {
    const target = s.users.find((u) => u.id === userId);
    if (!target) return;
    target.roles = roles;
    targetEmail = target.email;
  });

  if (!targetEmail) return jsonError("not_found", 404);

  await appendAuditLog({
    userId: me.id,
    userName: me.name,
    action: "update_roles",
    entityType: "user",
    entityId: userId,
    details: `修改用户 ${targetEmail} 角色为 ${roles.join(",")}`,
  });

  return jsonOk({
    users: getStore().users.map((u) => publicUser(u)),
  });
}
