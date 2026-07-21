import { NextRequest } from "next/server";
import {
  clearSessionCookie,
  getCurrentUser,
  getSessionToken,
  jsonError,
  jsonOk,
  loginUser,
  registerUser,
  setSessionCookie,
} from "@/server/auth";
import { publicUser, mutateStore } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { displayName, normalizeNickname } from "@/lib/users";

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
    const res = jsonOk({
      user: result.user,
      /** Returned for WeChat mini-program / mobile clients (cookie still set for web) */
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

    const nickname = normalizeNickname(body.nickname);
    let warning: string | undefined;
    let updated = user;

    await mutateStore((s) => {
      const me = s.users.find((u) => u.id === user.id);
      if (!me) return;

      if (nickname) {
        const taken = s.users.some(
          (u) =>
            u.id !== me.id &&
            u.nickname?.trim().toLowerCase() === nickname.toLowerCase()
        );
        if (taken) warning = "nickname_taken";
      }

      me.nickname = nickname;
      const label = displayName(me);

      // Ownership stays on userId; only refresh display labels
      for (const a of s.managedAnimals) {
        if (a.claimantUserId === me.id) a.claimantName = label;
        if (a.technicianUserId === me.id) a.technicianName = label;
      }
      for (const app of s.applications) {
        if (
          app.applicantUserId === me.id &&
          (app.status === "pending_receipt" || app.status === "received")
        ) {
          app.applicant = label;
        }
      }

      updated = me;
    });

    await appendAuditLog({
      userId: user.id,
      userName: user.name,
      action: "update_nickname",
      entityType: "user",
      entityId: user.id,
      details: nickname ? `设置花名: ${nickname}` : "清除花名",
    });

    return jsonOk({ user: publicUser(updated), warning });
  }

  return jsonError("unknown_action", 400);
}
