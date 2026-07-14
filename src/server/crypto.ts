import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `sha256$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  // Support legacy plaintext seed passwords during first migrate, then rehash
  if (!stored.startsWith("sha256$")) {
    return password === stored;
  }
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const next = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}
