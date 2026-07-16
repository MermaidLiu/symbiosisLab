import { Role } from "@/types";

export const ALL_ROLES: Role[] = [
  "super_admin",
  "instrument_manager",
  "animal_manager",
  "research_assistant",
  "user",
];

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

export function canAccessResearchAssistant(roles: Role[]): boolean {
  return roles.includes("super_admin") || roles.includes("research_assistant");
}

export function canViewResourceLogs(roles: Role[], type: "instrument" | "animal"): boolean {
  if (hasRole(roles, "super_admin")) return true;
  if (type === "instrument") return canManageInstruments(roles);
  return canManageAnimals(roles);
}
