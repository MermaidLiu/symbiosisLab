import type { Role } from "@/types";
import {
  canManageUsers, canAccessResearchAssistant, canSuperviseAnimalFacility,
  canProcessVeterinary, canViewAllLogs, canManageInstruments, canManageAnimals,
} from "@/lib/roles";

/** A previous session's destination may be unavailable to the new account. */
export function getLoginRedirect(target: string | null, roles: Role[]): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return "/";
  let path: string;
  try {
    path = decodeURIComponent(new URL(target, "https://local.invalid").pathname);
  } catch {
    return "/";
  }
  const within = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (within("/admin") && !canManageUsers(roles)) return "/";
  if (within("/ra") && !canAccessResearchAssistant(roles)) return "/";
  if ((within("/animals/staff-review") || within("/animals/facility-board")) && !canSuperviseAnimalFacility(roles)) return "/";
  if (within("/animals/vet-care") && !canProcessVeterinary(roles)) return "/";
  if (within("/logs") && !(canViewAllLogs(roles) || canManageInstruments(roles) || canManageAnimals(roles))) return "/";
  if (within("/login") || within("/auth")) return "/";
  return target;
}
