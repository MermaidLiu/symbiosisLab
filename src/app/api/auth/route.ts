import { NextRequest } from "next/server";
import {
  clearSessionCookie,
  getCurrentUser,
  getSessionToken,
  jsonError,
  jsonOk,
  loginUser,
  loginWithPhone,
  registerUser,
  setSessionCookie,
  submitRealNameProfile,
  updateIdentityProfile,
} from "@/server/auth";
import { publicUser, mutateStore } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { createAndSendSmsCode } from "@/server/sms";
import { AppliedBusinessRole } from "@/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ user: publicUser(user) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "send_sms") {
    const result = await createAndSendSmsCode(String(body.phone ?? ""));
    if (!result.ok) return jsonError(result.error, 400);
    return jsonOk({
      ok: true,
      /** 仅演示/开发返回；生产勿返回 */
      mockCode: result.mockCode,
    });
  }

  if (action === "phone_login") {
    const result = await loginWithPhone(String(body.phone ?? ""), String(body.code ?? ""));
    if (!result.ok) {
      const status =
        result.error === "account_disabled" ? 403 : result.error === "invalid_phone" ? 400 : 401;
      return jsonError(result.error, status);
    }
    const res = jsonOk({
      user: result.user,
      token: result.session.token,
      expiresAt: result.session.expiresAt,
    });
    await setSessionCookie(res, result.session.token, result.session.expiresAt);
    return res;
  }

  if (action === "submit_realname") {
    const user = await getCurrentUser();
    if (!user) return jsonError("unauthorized", 401);
    const result = await submitRealNameProfile(user.id, {
      name: String(body.name ?? ""),
      email: body.email ? String(body.email) : undefined,
      school: String(body.school ?? ""),
      department: String(body.department ?? ""),
      employeeId: String(body.employeeId ?? ""),
      personType: String(body.personType ?? ""),
      contactExtra: body.contactExtra ? String(body.contactExtra) : undefined,
      appliedRole: String(body.appliedRole ?? "student") as AppliedBusinessRole,
    });
    if (!result.ok) return jsonError(result.error, 400);
    return jsonOk({ user: result.user });
  }

  if (action === "login") {
    const result = await loginUser(String(body.email ?? ""), String(body.password ?? ""));
    if (!result.ok) return jsonError(result.error, 401);
    const res = jsonOk({
      user: result.user,
      token: result.session.token,
      expiresAt: result.session.expiresAt,
    });
    await setSessionCookie(res, result.session.token, result.session.expiresAt);
    return res;
  }

  if (action === "register") {
    const result = await registerUser({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      name: String(body.name ?? ""),
      phone: body.phone ? String(body.phone) : undefined,
      department: body.department ? String(body.department) : undefined,
      roles: Array.isArray(body.roles) ? body.roles : ["user"],
    });
    if (!result.ok) return jsonError(result.error, 403);
    return jsonError("register_disabled", 403);
  }

  if (action === "logout") {
    const user = await getCurrentUser();
    const sessionToken = await getSessionToken();
    if (user) {
      await appendAuditLog({
        userId: user.id,
        userName: user.name,
        action: "logout",
        entityType: "auth",
        details: `用户登出: ${user.email}`,
      });
    }
    if (sessionToken) {
      await mutateStore((s) => {
        s.sessions = s.sessions.filter((x) => x.token !== sessionToken);
      });
    }
    const res = jsonOk({ ok: true });
    clearSessionCookie(res);
    return res;
  }

  if (action === "update_profile") {
    const user = await getCurrentUser();
    if (!user) return jsonError("unauthorized", 401);

    const result = await updateIdentityProfile(user.id, {
      nickname: body.nickname !== undefined ? String(body.nickname) : undefined,
      name: body.name !== undefined ? String(body.name) : undefined,
      email: body.email !== undefined ? String(body.email) : undefined,
      school: body.school !== undefined ? String(body.school) : undefined,
      department: body.department !== undefined ? String(body.department) : undefined,
      employeeId: body.employeeId !== undefined ? String(body.employeeId) : undefined,
      personType: body.personType !== undefined ? String(body.personType) : undefined,
      contactExtra: body.contactExtra !== undefined ? String(body.contactExtra) : undefined,
    });
    if (!result.ok) return jsonError(result.error, 400);

    await appendAuditLog({
      userId: user.id,
      userName: result.user.name,
      action: "update_profile",
      entityType: "user",
      entityId: user.id,
      details: "更新个人实名信息",
    });

    return jsonOk({ user: result.user, warning: result.warning });
  }

  return jsonError("unknown_action", 400);
}
