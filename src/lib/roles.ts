import { Role } from "@/types";

export const ALL_ROLES: Role[] = ["super_admin", "instrument_manager", "animal_manager", "user"];

export function hasRole(roles: Role[], role: Role): boolean {
  return roles.includes(role) || roles.includes("super_admin");
}

export function canManageInstruments(roles: Role[]): boolean {
  return hasRole(roles, "instrument_manager");
}

export function canManageAnimals(roles: Role[]): boolean {
  return hasRole(roles, "animal_manager");
}

export function canManageUsers(roles: Role[]): boolean {
  return hasRole(roles, "super_admin");
}

export function canViewAllLogs(roles: Role[]): boolean {
  return hasRole(roles, "super_admin");
}

export function canViewResourceLogs(roles: Role[], type: "instrument" | "animal"): boolean {
  if (hasRole(roles, "super_admin")) return true;
  if (type === "instrument") return canManageInstruments(roles);
  return canManageAnimals(roles);
}
