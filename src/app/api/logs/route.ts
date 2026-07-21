import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { getStore } from "@/server/store";
import { filterLogsForUser } from "@/server/instrument-scope";
import { canSuperviseInstruments } from "@/lib/roles";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const canView =
    requireRole(user, "super_admin") ||
    requireRole(user, "instrument_manager") ||
    requireRole(user, "instrument_super_admin") ||
    requireRole(user, "animal_manager") ||
    requireRole(user, "animal_facility_supervisor");
  if (!canView) return jsonError("forbidden", 403);

  const store = getStore();
  const logs =
    canSuperviseInstruments(user.roles) || user.roles.includes("super_admin")
      ? store.logs
      : filterLogsForUser(store.logs, user, store);

  return jsonOk({ logs });
}
