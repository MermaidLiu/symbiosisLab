import { Role } from "@/types";

export const ALL_ROLES: Role[] = [
  "super_admin",
  "instrument_manager",
  "animal_facility_supervisor",
  "animal_manager",
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

export function canManageInstruments(roles: Role[]): boolean {
  return hasRole(roles, "instrument_manager");
}

/** 动物负责人 / 技术员（主管也具备管理能力） */
export function canManageAnimals(roles: Role[]): boolean {
  return hasRole(roles, "animal_manager") || canSuperviseAnimalFacility(roles);
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

export function canViewResourceLogs(roles: Role[], type: "instrument" | "animal"): boolean {
  if (hasRole(roles, "super_admin")) return true;
  if (type === "instrument") return canManageInstruments(roles);
  return canManageAnimals(roles) || canProcessVeterinary(roles);
}
