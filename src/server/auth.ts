import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Role, User } from "@/types";
import { getStore, mutateStore, publicUser, SessionRecord, uid } from "@/server/store";
import { hashPassword, verifyPassword } from "@/server/crypto";

export const SESSION_COOKIE = "symbiosis_session";
const SESSION_DAYS = 7;

export function createSessionToken(userId: string): SessionRecord {
  return {
    token: uid("tok"),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000).toISOString(),
  };
}

export async function setSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function getSessionTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Cookie session or Authorization: Bearer <token> (WeChat mini-program) */
export async function getSessionToken(): Promise<string | null> {
  const fromCookie = await getSessionTokenFromCookies();
  if (fromCookie) return fromCookie;
  const h = await headers();
  const auth = h.get("authorization") ?? h.get("Authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim() || null;
  }
  return null;
}

export async function getCurrentUser(): Promise<User | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const store = getStore();
  const session = store.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await mutateStore((s) => {
      s.sessions = s.sessions.filter((x) => x.token !== token);
    });
    return null;
  }
  return store.users.find((u) => u.id === session.userId) ?? null;
}

export async function requireUser(): Promise<{ user: User } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { user };
}

export function requireRole(user: User, ...roles: Role[]): boolean {
  if (user.roles.includes("super_admin")) return true;
  return roles.some((r) => user.roles.includes(r));
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function loginUser(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const store = getStore();
  const found = store.users.find((u) => u.email === normalized);
  if (!found || !verifyPassword(password, found.password)) {
    return { ok: false as const, error: "invalid_credentials" };
  }

  // Upgrade legacy plaintext password
  if (!found.password.startsWith("sha256$")) {
    await mutateStore((s) => {
      const u = s.users.find((x) => x.id === found.id);
      if (u) u.password = hashPassword(password);
    });
  }

  const session = createSessionToken(found.id);
  await mutateStore((s) => {
    s.sessions = [session, ...s.sessions.filter((x) => x.userId !== found.id)].slice(0, 200);
    s.logs.unshift({
      id: uid("log"),
      userId: found.id,
      userName: found.name,
      action: "login",
      entityType: "auth",
      details: `用户登录: ${found.email}`,
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);
  });

  return { ok: true as const, user: publicUser(found), session };
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  department?: string;
  roles?: Role[];
}) {
  // Public self-registration is disabled — only admins may create accounts.
  return { ok: false as const, error: "register_disabled" };
}

/** Admin-only account creation with explicit roles */
export async function createUserByAdmin(input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  department?: string;
  roles: Role[];
  actorId: string;
  actorName: string;
}) {
  const email = input.email.trim().toLowerCase();
  const store = getStore();
  if (store.users.some((u) => u.email === email)) {
    return { ok: false as const, error: "email_exists" };
  }
  let roles: Role[] = input.roles.includes("user") ? input.roles : [...input.roles, "user"];
  roles = Array.from(new Set(roles)) as Role[];

  const newUser: User = {
    id: uid("u"),
    email,
    name: input.name,
    password: hashPassword(input.password),
    roles,
    phone: input.phone,
    department: input.department,
    createdAt: new Date().toISOString(),
  };

  await mutateStore((s) => {
    s.users.push(newUser);
    s.logs.unshift({
      id: uid("log"),
      userId: input.actorId,
      userName: input.actorName,
      action: "create_user",
      entityType: "user",
      entityId: newUser.id,
      details: `管理员开通账号: ${email}, 角色: ${roles.join(",")}`,
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);
  });

  return { ok: true as const, user: publicUser(newUser) };
}

export function getTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}
