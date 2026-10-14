import { NextRequest } from "next/server";
import {
  createUserByAdmin,
  deleteUserByAdmin,
  getCurrentUser,
  jsonError,
  jsonOk,
  requireRole,
  updateUserByAdmin,
} from "@/server/auth";
import { getStore, mutateStore, publicUser } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { AccountStatus, AppliedBusinessRole, Role } from "@/types";

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
    employeeId: body.employeeId ? String(body.employeeId) : undefined,
    school: body.school ? String(body.school) : undefined,
    personType: body.personType ? String(body.personType) : undefined,
    appliedRole: body.appliedRole as AppliedBusinessRole | undefined,
    phoneLocked: body.phoneLocked === true || body.phoneLocked === "true",
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
  if (!userId) return jsonError("invalid_body", 400);

  const action = String(body.action ?? "roles").trim();

  // 兼容旧逻辑：仅改角色
  if (action === "roles" && body.name === undefined && body.email === undefined) {
    let roles = (Array.isArray(body.roles) ? body.roles : []) as Role[];
    roles = Array.from(new Set(roles.includes("user") ? roles : [...roles, "user"])) as Role[];

    const store = getStore();
    const target = store.users.find((u) => u.id === userId);
    if (!target) return jsonError("not_found", 404);

    if (target.roles.includes("super_admin") && !roles.includes("super_admin")) {
      const otherAdmins = store.users.filter(
        (u) => u.id !== userId && u.roles.includes("super_admin")
      ).length;
      if (otherAdmins === 0) return jsonError("last_super_admin", 400);
    }

    let targetEmail = "";
    await mutateStore((s) => {
      const u = s.users.find((x) => x.id === userId);
      if (!u) return;
      u.roles = roles;
      targetEmail = u.email;
    });

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

  const result = await updateUserByAdmin({
    userId,
    name: body.name !== undefined ? String(body.name) : undefined,
    email: body.email !== undefined ? String(body.email) : undefined,
    phone: body.phone !== undefined ? String(body.phone) : undefined,
    department: body.department !== undefined ? String(body.department) : undefined,
    employeeId: body.employeeId !== undefined ? String(body.employeeId) : undefined,
    school: body.school !== undefined ? String(body.school) : undefined,
    personType: body.personType !== undefined ? String(body.personType) : undefined,
    password: body.password !== undefined ? String(body.password) : undefined,
    roles: Array.isArray(body.roles) ? (body.roles as Role[]) : undefined,
    accountStatus: body.accountStatus
      ? (String(body.accountStatus) as AccountStatus)
      : undefined,
    actorId: me.id,
    actorName: me.name,
  });

  if (!result.ok) return jsonError(result.error, 400);

  return jsonOk({
    user: result.user,
    users: getStore().users.map((u) => publicUser(u)),
  });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return jsonError("unauthorized", 401);
  if (!requireRole(me, "super_admin")) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? req.nextUrl.searchParams.get("userId") ?? "").trim();
  if (!userId) return jsonError("invalid_body", 400);

  const result = await deleteUserByAdmin({
    userId,
    actorId: me.id,
    actorName: me.name,
  });
  if (!result.ok) return jsonError(result.error, 400);

  return jsonOk({
    users: getStore().users.map((u) => publicUser(u)),
  });
}
