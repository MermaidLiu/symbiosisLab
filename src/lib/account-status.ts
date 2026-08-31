import { AccountStatus, AppliedBusinessRole, Role, User } from "@/types";
import { canSuperviseAnimalFacility, hasRole } from "@/lib/roles";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pending_profile: "待完善实名信息",
  pending_review: "待审核",
  active: "已激活",
  rejected: "已拒绝",
  disabled: "已停用",
};

type AccountUser = Pick<User, "accountStatus" | "rejectReason">;

export function normalizeAccountStatus(user: AccountUser): AccountStatus {
  return user.accountStatus ?? "active";
}

/** 可登录查看，但不可做动物/实验业务 */
export function canUseBusinessFeatures(user: AccountUser): boolean {
  return normalizeAccountStatus(user) === "active";
}

export function isPendingMessage(user: AccountUser): string {
  const st = normalizeAccountStatus(user);
  if (st === "pending_profile") {
    return "请先完成实名认证与人员信息登记。";
  }
  if (st === "pending_review") {
    return "您的实名信息正在审核中，请联系动物房主管。";
  }
  if (st === "rejected") {
    return `实名审核未通过${user.rejectReason ? `：${user.rejectReason}` : "。"}请联系动物房主管。`;
  }
  if (st === "disabled") {
    return "账号已停用，无法进行新的业务操作。历史记录仍可查阅。";
  }
  return "";
}

export function canReviewStaff(roles: Role[]): boolean {
  return canSuperviseAnimalFacility(roles) || hasRole(roles, "super_admin");
}

/** 申请角色 → 系统 Role 映射（审核通过后写入） */
export function rolesForAppliedRole(applied: AppliedBusinessRole): Role[] {
  if (applied === "technician") {
    return ["user", "animal_manager"];
  }
  if (applied === "supervisor") {
    return ["user", "animal_facility_supervisor"];
  }
  return ["user"];
}

export function phoneToEmail(phone: string): string {
  return `${phone}@phone.symbiosis.local`;
}

/** 是否需要强制进入完善资料页（实名 / 学号等） */
export function needsProfileCompletion(user: {
  accountStatus?: AccountStatus | null;
  name?: string;
  employeeId?: string;
  phone?: string;
}): boolean {
  const st = user.accountStatus ?? "active";
  if (st === "pending_profile" || st === "rejected") return true;
  if (st === "pending_review" || st === "disabled") return true;
  // 有手机号但姓名为空 → 未完成实名
  if (user.phone && !String(user.name ?? "").trim()) return true;
  // 学号/工号缺失或占位
  const emp = String(user.employeeId ?? "").trim();
  if (user.phone && (!emp || emp.startsWith("LEGACY-"))) {
    if (st !== "active") return true;
  }
  return false;
}

/** 仅「待填资料 / 被拒重填」时显示表单；审核中/停用只展示状态 */
export function canEditRealnameForm(user: {
  accountStatus?: AccountStatus | null;
  name?: string;
  phone?: string;
}): boolean {
  const st = user.accountStatus ?? "active";
  if (st === "pending_profile" || st === "rejected") return true;
  if (user.phone && !String(user.name ?? "").trim()) return true;
  return false;
}

