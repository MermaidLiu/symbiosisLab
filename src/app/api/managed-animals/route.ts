import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore } from "@/server/store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  return jsonOk({ managedAnimals: getStore().managedAnimals });
}
