import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AccountStatus, AppliedBusinessRole, Role, User } from "@/types";
import { getStore, mutateStore, publicUser, SessionRecord, uid } from "@/server/store";
import { hashPassword, verifyPassword } from "@/server/crypto";
import { isPlaceholderEmail, isPhoneLocked, phoneToEmail, rolesForAppliedRole } from "@/lib/account-status";
import { displayName, normalizeNickname } from "@/lib/users";
import { isValidCnMobile, normalizePhone, verifySmsCode } from "@/server/sms";
import { isOnRoster, requiresRosterMatch } from "@/lib/research-group-roster";

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

/** Cookie session, Authorization Bearer, or X-Symbiosis-Token (mini-program) */
export async function getSessionToken(): Promise<string | null> {
  const fromCookie = await getSessionTokenFromCookies();
  if (fromCookie) return fromCookie;
  const h = await headers();
  const auth = h.get("authorization") ?? h.get("Authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim() || null;
  }
  const custom = h.get("x-symbiosis-token");
  if (custom && custom.trim()) return custom.trim();
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

/** 业务接口：必须已实名审核通过（系统管理员豁免） */
export async function requireActiveUser(): Promise<{ user: User } | { error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (user.roles.includes("super_admin")) {
    return { user };
  }
  const status = user.accountStatus ?? "active";
  if (status !== "active") {
    return {
      error: NextResponse.json(
        { error: "account_not_active", accountStatus: status },
        { status: 403 }
      ),
    };
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

export function jsonError(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

async function issueSession(user: User) {
  const session = createSessionToken(user.id);
  await mutateStore((s) => {
    s.sessions = [session, ...s.sessions.filter((x) => x.userId !== user.id)].slice(0, 200);
    s.logs.unshift({
      id: uid("log"),
      userId: user.id,
      userName: user.name || user.phone || user.email,
      action: "login",
      entityType: "auth",
      details: `用户登录: ${user.phone || user.email}`,
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);
  });
  return session;
}

export async function loginUser(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const store = getStore();
  const found = store.users.find((u) => u.email === normalized);
  if (!found || !verifyPassword(password, found.password)) {
    return { ok: false as const, error: "invalid_credentials" };
  }

  if (!found.password.startsWith("sha256$")) {
    await mutateStore((s) => {
      const u = s.users.find((x) => x.id === found.id);
      if (u) u.password = hashPassword(password);
    });
  }

  const session = await issueSession(found);
  return { ok: true as const, user: publicUser(found), session };
}

/** 手机号 + 验证码登录；无账号则建 pending_profile 账号 */
export async function loginWithPhone(phoneRaw: string, code: string) {
  const phone = normalizePhone(phoneRaw);
  if (!isValidCnMobile(phone)) {
    return { ok: false as const, error: "invalid_phone" };
  }
  const verified = await verifySmsCode(phone, code);
  if (!verified.ok) return { ok: false as const, error: verified.error };

  const store = getStore();
  let user = store.users.find((u) => normalizePhone(u.phone ?? "") === phone);

  if (!user) {
    const now = new Date().toISOString();
    const newUser: User = {
      id: uid("u"),
      email: phoneToEmail(phone),
      name: "",
      password: hashPassword(uid("pwd")),
      roles: ["user"],
      phone,
      phoneLocked: true,
      accountStatus: "pending_profile",
      createdAt: now,
    };
    await mutateStore((s) => {
      if (s.users.some((u) => normalizePhone(u.phone ?? "") === phone)) return;
      s.users.push(newUser);
    });
    user = getStore().users.find((u) => normalizePhone(u.phone ?? "") === phone);
    if (!user) return { ok: false as const, error: "create_failed" };
  }

  if ((user.accountStatus ?? "active") === "disabled") {
    return { ok: false as const, error: "account_disabled" };
  }

  // 通过手机号验证码登录：手机号即登录凭证，不可再自行修改
  if (user.phoneLocked !== true) {
    await mutateStore((s) => {
      const u = s.users.find((x) => x.id === user!.id);
      if (u) u.phoneLocked = true;
    });
    user = { ...user, phoneLocked: true };
  }

  const session = await issueSession(user);
  return { ok: true as const, user: publicUser(user), session };
}

export async function submitRealNameProfile(
  userId: string,
  input: {
    name: string;
    email?: string;
    school: string;
    department: string;
    employeeId: string;
    personType: string;
    contactExtra?: string;
    appliedRole: AppliedBusinessRole;
    /** 仅邮箱账号（未锁定手机号）可在此补填/修改 */
    phone?: string;
  }
) {
  const name = String(input.name ?? "").trim();
  const school = String(input.school ?? "").trim();
  const department = String(input.department ?? "").trim();
  const employeeId = String(input.employeeId ?? "").trim();
  const personType = String(input.personType ?? "").trim();
  const emailRaw = String(input.email ?? "").trim().toLowerCase();
  const appliedRole = input.appliedRole;
  if (!name || !school || !department || !employeeId || !personType) {
    return { ok: false as const, error: "invalid_body" };
  }
  if (!["student", "technician", "supervisor"].includes(appliedRole)) {
    return { ok: false as const, error: "invalid_applied_role" };
  }
  if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) || isPlaceholderEmail(emailRaw)) {
    return { ok: false as const, error: "invalid_email" };
  }

  const store = getStore();
  const me = store.users.find((u) => u.id === userId);
  if (!me) return { ok: false as const, error: "not_found" };

  let nextPhone = me.phone ? normalizePhone(me.phone) : "";
  if (input.phone !== undefined) {
    if (isPhoneLocked(me)) {
      return { ok: false as const, error: "phone_locked" };
    }
    nextPhone = normalizePhone(String(input.phone));
    if (!isValidCnMobile(nextPhone)) {
      return { ok: false as const, error: "invalid_phone" };
    }
    const dupPhone = store.users.some(
      (u) => u.id !== userId && normalizePhone(u.phone ?? "") === nextPhone
    );
    if (dupPhone) return { ok: false as const, error: "phone_exists" };
  }
  if (!nextPhone) return { ok: false as const, error: "no_phone" };

  // 学生/技术员：姓名+手机号必须与管理员录入的课题组名单一致
  if (requiresRosterMatch(appliedRole)) {
    if (!isOnRoster(store.researchGroupRoster, name, nextPhone)) {
      return { ok: false as const, error: "roster_mismatch" };
    }
  }

  const dupEmp = store.users.some(
    (u) => u.id !== userId && u.employeeId && u.employeeId.toLowerCase() === employeeId.toLowerCase()
  );
  if (dupEmp) return { ok: false as const, error: "employee_id_exists" };

  const dupEmail = store.users.some(
    (u) => u.id !== userId && u.email && u.email.toLowerCase() === emailRaw
  );
  if (dupEmail) return { ok: false as const, error: "email_exists" };

  const now = new Date().toISOString();
  const wasActive = (me.accountStatus ?? "active") === "active";
  let updated: User | null = null;
  await mutateStore((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (!u) return;
    u.name = name;
    u.email = emailRaw;
    u.school = school;
    u.department = department;
    u.employeeId = employeeId;
    u.personType = personType;
    u.contactExtra = String(input.contactExtra ?? "").trim();
    u.appliedRole = appliedRole;
    u.phone = nextPhone;
    if (u.phoneLocked !== true) u.phoneLocked = false;
    // 已激活账号补全资料：保持 active
    // 学生且已通过名单校验：直接激活；技术员/主管仍须动物房审核
    if (wasActive && u.accountStatus === "active") {
      u.accountStatus = "active";
    } else if (appliedRole === "student") {
      u.accountStatus = "active";
      u.roles = rolesForAppliedRole("student");
      u.approvedAt = now;
      u.approvedBy = "auto_roster";
    } else {
      u.accountStatus = "pending_review";
      u.roles = ["user"];
    }
    u.profileSubmittedAt = now;
    u.rejectReason = undefined;
    updated = { ...u };
    s.logs.unshift({
      id: uid("log"),
      userId,
      userName: name,
      action: "submit_realname",
      entityType: "user",
      entityId: userId,
      details: `提交/完善实名建档，申请角色: ${appliedRole}`,
      timestamp: now,
    });
    s.logs = s.logs.slice(0, 500);
  });

  if (!updated) return { ok: false as const, error: "not_found" };
  return { ok: true as const, user: publicUser(updated) };
}

/** 个人信息可查看/修改，但必填项不可清空删除 */
export async function updateIdentityProfile(
  userId: string,
  input: {
    nickname?: string;
    name?: string;
    email?: string;
    school?: string;
    department?: string;
    employeeId?: string;
    personType?: string;
    contactExtra?: string;
    phone?: string;
  }
) {
  const store = getStore();
  const me = store.users.find((u) => u.id === userId);
  if (!me) return { ok: false as const, error: "not_found" };

  const touchingIdentity =
    input.name !== undefined ||
    input.email !== undefined ||
    input.school !== undefined ||
    input.department !== undefined ||
    input.employeeId !== undefined ||
    input.personType !== undefined ||
    input.contactExtra !== undefined ||
    input.phone !== undefined;

  const name =
    input.name !== undefined ? String(input.name).trim() : String(me.name ?? "").trim();
  const school =
    input.school !== undefined ? String(input.school).trim() : String(me.school ?? "").trim();
  const department =
    input.department !== undefined
      ? String(input.department).trim()
      : String(me.department ?? "").trim();
  const employeeId =
    input.employeeId !== undefined
      ? String(input.employeeId).trim()
      : String(me.employeeId ?? "").trim();
  const personType =
    input.personType !== undefined
      ? String(input.personType).trim()
      : String(me.personType ?? "").trim();
  const emailRaw =
    input.email !== undefined
      ? String(input.email).trim().toLowerCase()
      : String(me.email ?? "").trim().toLowerCase();

  let nextPhone = me.phone ? normalizePhone(me.phone) : "";
  if (input.phone !== undefined) {
    if (isPhoneLocked(me)) {
      return { ok: false as const, error: "phone_locked" };
    }
    const raw = String(input.phone).trim();
    if (!raw) {
      return { ok: false as const, error: "invalid_phone" };
    }
    nextPhone = normalizePhone(raw);
    if (!isValidCnMobile(nextPhone)) {
      return { ok: false as const, error: "invalid_phone" };
    }
    const dupPhone = store.users.some(
      (u) => u.id !== userId && normalizePhone(u.phone ?? "") === nextPhone
    );
    if (dupPhone) return { ok: false as const, error: "phone_exists" };
  }

  if (touchingIdentity) {
    if (!name || !school || !department || !employeeId || !personType) {
      return { ok: false as const, error: "required_fields_cannot_clear" };
    }
    if (!emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) || isPlaceholderEmail(emailRaw)) {
      return { ok: false as const, error: "invalid_email" };
    }

    const applied = (me.appliedRole ?? "student") as AppliedBusinessRole;
    const isTechByRole =
      me.roles.includes("animal_manager") &&
      !me.roles.includes("animal_facility_supervisor") &&
      !me.roles.includes("super_admin");
    if (
      nextPhone &&
      (requiresRosterMatch(applied) || isTechByRole) &&
      !isOnRoster(store.researchGroupRoster, name, nextPhone)
    ) {
      return { ok: false as const, error: "roster_mismatch" };
    }

    const dupEmp = store.users.some(
      (u) =>
        u.id !== userId && u.employeeId && u.employeeId.toLowerCase() === employeeId.toLowerCase()
    );
    if (dupEmp) return { ok: false as const, error: "employee_id_exists" };
    const dupEmail = store.users.some(
      (u) => u.id !== userId && u.email && u.email.toLowerCase() === emailRaw
    );
    if (dupEmail) return { ok: false as const, error: "email_exists" };
  }

  const nickname =
    input.nickname !== undefined ? normalizeNickname(input.nickname) : me.nickname;
  let warning: string | undefined;
  let updated: User | null = null;

  await mutateStore((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (!u) return;
    if (nickname) {
      const taken = s.users.some(
        (x) =>
          x.id !== u.id && x.nickname?.trim().toLowerCase() === nickname.toLowerCase()
      );
      if (taken) warning = "nickname_taken";
    }
    if (touchingIdentity) {
      u.name = name;
      u.email = emailRaw;
      u.school = school;
      u.department = department;
      u.employeeId = employeeId;
      u.personType = personType;
      if (input.contactExtra !== undefined) {
        u.contactExtra = String(input.contactExtra).trim();
      }
      if (input.phone !== undefined) {
        u.phone = nextPhone;
        u.phoneLocked = false;
      }
    }
    if (input.nickname !== undefined) {
      u.nickname = nickname;
    }
    const label = displayName(u);
    for (const a of s.managedAnimals) {
      if (a.claimantUserId === u.id) a.claimantName = label;
      if (a.technicianUserId === u.id) a.technicianName = label;
    }
    updated = { ...u };
  });

  if (!updated) return { ok: false as const, error: "not_found" };
  return { ok: true as const, user: publicUser(updated), warning };
}

/** 用户自行修改登录密码（需验证当前密码） */
export async function changeOwnPassword(
  userId: string,
  input: { currentPassword: string; newPassword: string }
) {
  const currentPassword = String(input.currentPassword ?? "");
  const newPassword = String(input.newPassword ?? "").trim();
  if (!currentPassword || !newPassword) {
    return { ok: false as const, error: "invalid_body" };
  }
  if (newPassword.length < 6) {
    return { ok: false as const, error: "password_too_short" };
  }
  if (currentPassword === newPassword) {
    return { ok: false as const, error: "password_unchanged" };
  }

  const store = getStore();
  const me = store.users.find((u) => u.id === userId);
  if (!me) return { ok: false as const, error: "not_found" };
  if (!verifyPassword(currentPassword, me.password)) {
    return { ok: false as const, error: "wrong_password" };
  }

  await mutateStore((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (!u) return;
    u.password = hashPassword(newPassword);
    s.logs.unshift({
      id: uid("log"),
      userId,
      userName: displayName(u),
      action: "change_password",
      entityType: "user",
      entityId: userId,
      details: "用户自行修改登录密码",
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);
  });

  return { ok: true as const };
}

export async function reviewStaffAccount(input: {
  targetUserId: string;
  action: "approve" | "reject" | "disable" | "enable";
  reason?: string;
  actorId: string;
  actorName: string;
}) {
  let updated: User | null = null;
  let failReason: string | null = null;
  const now = new Date().toISOString();

  await mutateStore((s) => {
    const u = s.users.find((x) => x.id === input.targetUserId);
    if (!u) return;

    if (input.action === "approve") {
      const applied = u.appliedRole ?? "student";
      if (requiresRosterMatch(applied)) {
        if (!u.phone || !isOnRoster(s.researchGroupRoster, u.name, u.phone)) {
          failReason = "roster_mismatch";
          return;
        }
      }
      u.roles = rolesForAppliedRole(applied);
      u.accountStatus = "active";
      u.approvedAt = now;
      u.approvedBy = input.actorId;
      u.rejectReason = undefined;
    } else if (input.action === "reject") {
      u.accountStatus = "rejected";
      u.rejectReason = String(input.reason ?? "").trim() || "审核未通过";
      u.roles = ["user"];
    } else if (input.action === "disable") {
      u.accountStatus = "disabled";
    } else if (input.action === "enable") {
      if (u.accountStatus === "disabled") {
        u.accountStatus = "active";
      }
    }
    updated = { ...u };
    s.logs.unshift({
      id: uid("log"),
      userId: input.actorId,
      userName: input.actorName,
      action: `staff_${input.action}`,
      entityType: "user",
      entityId: u.id,
      details: `${input.action} ${u.name}(${u.phone}) ${input.reason ?? ""}`.trim(),
      timestamp: now,
    });
    s.logs = s.logs.slice(0, 500);
  });

  if (failReason) return { ok: false as const, error: failReason };
  if (!updated) return { ok: false as const, error: "not_found" };
  return { ok: true as const, user: publicUser(updated as User) };
}

export async function registerUser(_input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  department?: string;
  roles?: Role[];
}) {
  return { ok: false as const, error: "register_disabled" };
}

/** Admin-only account creation with explicit roles */
export async function createUserByAdmin(input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  department?: string;
  employeeId?: string;
  roles: Role[];
  actorId: string;
  actorName: string;
}) {
  const email = input.email.trim().toLowerCase();
  const store = getStore();
  if (store.users.some((u) => u.email === email)) {
    return { ok: false as const, error: "email_exists" };
  }
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  if (phone) {
    if (!isValidCnMobile(phone)) return { ok: false as const, error: "invalid_phone" };
    if (store.users.some((u) => normalizePhone(u.phone ?? "") === phone)) {
      return { ok: false as const, error: "phone_exists" };
    }
  }
  const employeeId = input.employeeId?.trim();
  if (employeeId && store.users.some((u) => u.employeeId?.toLowerCase() === employeeId.toLowerCase())) {
    return { ok: false as const, error: "employee_id_exists" };
  }

  let roles: Role[] = input.roles.includes("user") ? input.roles : [...input.roles, "user"];
  roles = Array.from(new Set(roles)) as Role[];

  const newUser: User = {
    id: uid("u"),
    email,
    name: input.name,
    password: hashPassword(input.password),
    roles,
    phone,
    phoneLocked: false,
    department: input.department,
    employeeId: employeeId || `ADM-${Date.now()}`,
    accountStatus: "active" as AccountStatus,
    approvedAt: new Date().toISOString(),
    approvedBy: input.actorId,
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

/** Admin updates account profile / roles / optional password reset */
export async function updateUserByAdmin(input: {
  userId: string;
  name?: string;
  email?: string;
  phone?: string | null;
  department?: string;
  employeeId?: string;
  password?: string;
  roles?: Role[];
  accountStatus?: AccountStatus;
  actorId: string;
  actorName: string;
}) {
  const store = getStore();
  const target = store.users.find((u) => u.id === input.userId);
  if (!target) return { ok: false as const, error: "not_found" };

  const name =
    input.name !== undefined ? String(input.name).trim() : String(target.name ?? "").trim();
  if (!name) return { ok: false as const, error: "invalid_body" };

  const email =
    input.email !== undefined
      ? String(input.email).trim().toLowerCase()
      : String(target.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: "invalid_email" };
  }
  if (store.users.some((u) => u.id !== target.id && u.email.toLowerCase() === email)) {
    return { ok: false as const, error: "email_exists" };
  }

  let phone: string | undefined = target.phone;
  if (input.phone !== undefined) {
    const raw = String(input.phone ?? "").trim();
    if (!raw) {
      phone = undefined;
    } else {
      phone = normalizePhone(raw);
      if (!isValidCnMobile(phone)) return { ok: false as const, error: "invalid_phone" };
      if (store.users.some((u) => u.id !== target.id && normalizePhone(u.phone ?? "") === phone)) {
        return { ok: false as const, error: "phone_exists" };
      }
    }
  }

  const department =
    input.department !== undefined
      ? String(input.department).trim()
      : String(target.department ?? "").trim();

  let employeeId = target.employeeId;
  if (input.employeeId !== undefined) {
    employeeId = String(input.employeeId).trim() || undefined;
    if (
      employeeId &&
      store.users.some(
        (u) =>
          u.id !== target.id &&
          u.employeeId &&
          u.employeeId.toLowerCase() === employeeId!.toLowerCase()
      )
    ) {
      return { ok: false as const, error: "employee_id_exists" };
    }
  }

  let roles = target.roles;
  if (input.roles) {
    roles = Array.from(
      new Set(input.roles.includes("user") ? input.roles : [...input.roles, "user"])
    ) as Role[];
  }

  // 不能把自己或系统中唯一的 super_admin 降权掉
  const wasAdmin = target.roles.includes("super_admin");
  const willBeAdmin = roles.includes("super_admin");
  if (wasAdmin && !willBeAdmin) {
    const otherAdmins = store.users.filter(
      (u) => u.id !== target.id && u.roles.includes("super_admin")
    ).length;
    if (otherAdmins === 0) return { ok: false as const, error: "last_super_admin" };
  }

  const password = input.password?.trim();
  if (password !== undefined && password !== "" && password.length < 6) {
    return { ok: false as const, error: "password_too_short" };
  }

  let updated: User | null = null;
  await mutateStore((s) => {
    const u = s.users.find((x) => x.id === input.userId);
    if (!u) return;
    u.name = name;
    u.email = email;
    u.phone = phone;
    u.department = department || undefined;
    u.employeeId = employeeId;
    u.roles = roles;
    if (input.accountStatus) u.accountStatus = input.accountStatus;
    if (password) u.password = hashPassword(password);
    // 管理员编辑手机号的邮箱账号保持可改
    if (input.phone !== undefined && u.phoneLocked !== true) {
      u.phoneLocked = false;
    }
    const label = displayName(u);
    for (const a of s.managedAnimals) {
      if (a.claimantUserId === u.id) a.claimantName = label;
      if (a.technicianUserId === u.id) a.technicianName = label;
    }
    updated = { ...u };
    s.logs.unshift({
      id: uid("log"),
      userId: input.actorId,
      userName: input.actorName,
      action: "update_user",
      entityType: "user",
      entityId: u.id,
      details: `管理员编辑账号: ${email}${password ? "（已重置密码）" : ""}`,
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);
  });

  if (!updated) return { ok: false as const, error: "not_found" };
  return { ok: true as const, user: publicUser(updated) };
}

/** Admin deletes an account */
export async function deleteUserByAdmin(input: {
  userId: string;
  actorId: string;
  actorName: string;
}) {
  if (input.userId === input.actorId) {
    return { ok: false as const, error: "cannot_delete_self" };
  }
  const store = getStore();
  const target = store.users.find((u) => u.id === input.userId);
  if (!target) return { ok: false as const, error: "not_found" };

  if (target.roles.includes("super_admin")) {
    const otherAdmins = store.users.filter(
      (u) => u.id !== target.id && u.roles.includes("super_admin")
    ).length;
    if (otherAdmins === 0) return { ok: false as const, error: "last_super_admin" };
  }

  const email = target.email;
  await mutateStore((s) => {
    s.users = s.users.filter((u) => u.id !== input.userId);
    s.sessions = s.sessions.filter((x) => x.userId !== input.userId);
    s.logs.unshift({
      id: uid("log"),
      userId: input.actorId,
      userName: input.actorName,
      action: "delete_user",
      entityType: "user",
      entityId: input.userId,
      details: `管理员删除账号: ${email}`,
      timestamp: new Date().toISOString(),
    });
    s.logs = s.logs.slice(0, 500);
  });

  return { ok: true as const };
}

export function getTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}
