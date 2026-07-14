import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { getStore } from "@/server/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const canView =
    requireRole(user, "super_admin") ||
    requireRole(user, "instrument_manager") ||
    requireRole(user, "animal_manager");
  if (!canView) return jsonError("forbidden", 403);

  return jsonOk({ logs: getStore().logs });
}
