import type { User } from "@/types";

/** Prefer nickname for display; real name is always kept for admin records. */
export function displayName(
  user: Pick<User, "name" | "nickname"> | null | undefined
): string {
  if (!user) return "";
  const nick = user.nickname?.trim();
  return nick || user.name;
}

/** Match by id, email, nickname, or legal name (case-insensitive for nick/name). */
export function findUserByKey(
  users: User[],
  key: string
): User | undefined {
  const raw = key.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  return (
    users.find((x) => x.id === raw) ||
    users.find((x) => x.email.toLowerCase() === lower) ||
    users.find((x) => x.nickname?.trim().toLowerCase() === lower) ||
    users.find((x) => x.name === raw) ||
    users.find((x) => x.name.toLowerCase() === lower)
  );
}

export function normalizeNickname(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  return s.slice(0, 32);
}
