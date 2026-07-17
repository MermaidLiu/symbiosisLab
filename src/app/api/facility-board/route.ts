import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore } from "@/server/store";
import { canSuperviseAnimalFacility, canManageAnimals } from "@/lib/roles";
import { buildFacilityCageCells } from "@/lib/animals/facility-board";
import { publicUser } from "@/server/store";

/** GET /api/facility-board — supervisor cage Excel board data */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canSuperviseAnimalFacility(user.roles) && !canManageAnimals(user.roles)) {
    return jsonError("forbidden", 403);
  }

  const store = getStore();
  const cells = buildFacilityCageCells(store.cages, store.managedAnimals);
  const staff = store.users
    .filter(
      (u) =>
        u.roles.includes("user") ||
        u.roles.includes("animal_manager") ||
        u.roles.includes("animal_facility_supervisor") ||
        u.roles.includes("research_assistant")
    )
    .map((u) => publicUser(u));

  return jsonOk({
    cages: store.cages,
    managedAnimals: store.managedAnimals,
    cells,
    activities: store.animalDayActivities ?? [],
    staff,
  });
}
