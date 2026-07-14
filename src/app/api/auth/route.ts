import { NextRequest } from "next/server";
import {
  clearSessionCookie,
  getCurrentUser,
  getSessionTokenFromCookies,
  jsonError,
  jsonOk,
  loginUser,
  registerUser,
  setSessionCookie,
} from "@/server/auth";
import { publicUser, mutateStore } from "@/server/store";
import { appendAuditLog } from "@/server/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ user: publicUser(user) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "login") {
    const result = await loginUser(String(body.email ?? ""), String(body.password ?? ""));
    if (!result.ok) return jsonError(result.error, 401);
    const res = jsonOk({ user: result.user });
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
    if (!result.ok) return jsonError(result.error, 400);
    const res = jsonOk({ user: result.user });
    await setSessionCookie(res, result.session.token, result.session.expiresAt);
    return res;
  }

  if (action === "logout") {
    const user = await getCurrentUser();
    const sessionToken = await getSessionTokenFromCookies();
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

  return jsonError("unknown_action", 400);
}
