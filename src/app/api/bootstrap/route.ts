import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, publicUser } from "@/server/store";
import { normalizeInstrument } from "@/lib/instruments";

/** Bootstrap payload for authenticated client hydrate */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  const store = getStore();
  return jsonOk({
    user: publicUser(user),
    users: store.users.map((u) => publicUser(u)),
    instruments: store.instruments.map((i) => normalizeInstrument(i)),
    animals: store.animals,
    bookings: store.bookings,
    logs: store.logs,
    notifications: store.notifications.filter((n) => n.userId === user.id),
    managedAnimals: store.managedAnimals,
    cages: store.cages,
    applications: store.applications,
  });
}
