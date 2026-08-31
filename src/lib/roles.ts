import { Role } from "@/types";

export const ALL_ROLES: Role[] = [
  "super_admin",
  "instrument_super_admin",
  "instrument_manager",
  "animal_facility_supervisor",
  "animal_manager",
  "animal_caretaker",
  "animal_collector",
  "veterinarian",
  "research_assistant",
  "user",
];

export function hasRole(roles: Role[], role: Role): boolean {
  return roles.includes(role) || roles.includes("super_admin");
}

/** 动物房主管：最高权限 */
export function canSuperviseAnimalFacility(roles: Role[]): boolean {
  return hasRole(roles, "animal_facility_supervisor");
}

/** 仪器总管理员：导入设备、分配负责人 */
export function canSuperviseInstruments(roles: Role[]): boolean {
  return hasRole(roles, "instrument_super_admin") || hasRole(roles, "super_admin");
}

/** 仪器负责人或总管理员（可维护名下/全部仪器、培训授权、保修响应） */
export function canManageInstruments(roles: Role[]): boolean {
  return (
    hasRole(roles, "instrument_manager") ||
    canSuperviseInstruments(roles)
  );
}

/** 是否某台仪器的负责人（contactUserId） */
export function isInstrumentOwner(userId: string, contactUserId: string): boolean {
  return Boolean(userId && contactUserId && userId === contactUserId);
}

/** 动物技术员 / 主管 */
export function canManageAnimals(roles: Role[]): boolean {
  return hasRole(roles, "animal_manager") || canSuperviseAnimalFacility(roles);
}

/** 可接收小动物操作任务：技术员、饲养员、采集员、主管 */
export function canReceiveAnimalOps(roles: Role[]): boolean {
  return (
    canManageAnimals(roles) ||
    hasRole(roles, "animal_caretaker") ||
    hasRole(roles, "animal_collector")
  );
}

/**
 * 一线动物人员（饲养员 / 技术员 / 采集员）：查看动物列表、处理学生派发任务、强制处理。
 * 不含动物房主管与总管理员（他们保留完整代管编辑）。
 */
export function isAnimalOpsStaff(roles: Role[]): boolean {
  return (
    canReceiveAnimalOps(roles) &&
    !canSuperviseAnimalFacility(roles) &&
    !hasRole(roles, "super_admin")
  );
}

/** 动物一线人员工作台（排班） */
export function canUseAnimalStaffWorkbench(roles: Role[]): boolean {
  return canReceiveAnimalOps(roles);
}

/** Veterinarian or animal managers / supervisor / admin */
export function canProcessVeterinary(roles: Role[]): boolean {
  return (
    hasRole(roles, "veterinarian") ||
    canManageAnimals(roles) ||
    hasRole(roles, "super_admin")
  );
}

export function canManageUsers(roles: Role[]): boolean {
  return hasRole(roles, "super_admin");
}

export function canViewAllLogs(roles: Role[]): boolean {
  return hasRole(roles, "super_admin");
}

export function canAccessResearchAssistant(roles: Role[]): boolean {
  return roles.includes("super_admin") || roles.includes("research_assistant");
}

/** 学生（小动物认领员）：非动物房一线人员 */
export function isAnimalClaimantStudent(roles: Role[]): boolean {
  return (
    roles.includes("user") &&
    !canReceiveAnimalOps(roles) &&
    !canSuperviseAnimalFacility(roles) &&
    !hasRole(roles, "super_admin")
  );
}

/** 技术员（小动物实验人员） */
export function isAnimalExperimentTechnician(roles: Role[]): boolean {
  return canReceiveAnimalOps(roles);
}

/** V2 业务角色别名（映射现有 Role 枚举） */
export function roleLabelV2(roles: Role[]): "student" | "technician" | "supervisor" | "admin" {
  if (hasRole(roles, "super_admin")) return "admin";
  if (canSuperviseAnimalFacility(roles)) return "supervisor";
  if (canReceiveAnimalOps(roles)) return "technician";
  return "student";
}

export function canViewAllAnimalLifecycle(roles: Role[]): boolean {
  return (
    canSuperviseAnimalFacility(roles) ||
    hasRole(roles, "super_admin") ||
    /** 技术员可查看各同学名下小鼠的处理流程 */
    canReceiveAnimalOps(roles)
  );
}

export function canViewResourceLogs(roles: Role[], type: "instrument" | "animal"): boolean {
  if (hasRole(roles, "super_admin")) return true;
  if (type === "instrument") return canManageInstruments(roles);
  return canManageAnimals(roles) || canProcessVeterinary(roles);
}
