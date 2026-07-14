import fs from "fs";
import path from "path";
import {
  User,
  Instrument,
  Animal,
  Booking,
  AuditLog,
  AppNotification,
} from "@/types";
import {
  ManagedAnimal,
  Cage,
  OperationApplication,
} from "@/types/animal-management";
import { SEED_USERS, SEED_INSTRUMENTS, SEED_ANIMALS } from "@/lib/storage/seed";
import {
  SEED_MANAGED_ANIMALS,
  SEED_CAGES,
  SEED_APPLICATIONS,
} from "@/lib/mock/animalManagement";
import { hashPassword, uid } from "@/server/crypto";

export interface SessionRecord {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface DbStore {
  users: User[];
  sessions: SessionRecord[];
  instruments: Instrument[];
  animals: Animal[];
  bookings: Booking[];
  logs: AuditLog[];
  notifications: AppNotification[];
  managedAnimals: ManagedAnimal[];
  cages: Cage[];
  applications: OperationApplication[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

declare global {
  // eslint-disable-next-line no-var
  var __symbiosisDb: DbStore | undefined;
  // eslint-disable-next-line no-var
  var __symbiosisDbWriteQueue: Promise<void> | undefined;
}

function emptyStore(): DbStore {
  return {
    users: [],
    sessions: [],
    instruments: [],
    animals: [],
    bookings: [],
    logs: [],
    notifications: [],
    managedAnimals: [],
    cages: [],
    applications: [],
  };
}

function seedStore(): DbStore {
  return {
    users: SEED_USERS.map((u) => ({ ...u, password: hashPassword(u.password) })),
    sessions: [],
    instruments: SEED_INSTRUMENTS.map((i) => ({
      ...i,
      accessories: i.accessories ?? [],
      trainingRequired: i.trainingRequired ?? false,
    })),
    animals: [...SEED_ANIMALS],
    bookings: [],
    logs: [],
    notifications: [],
    managedAnimals: [...SEED_MANAGED_ANIMALS],
    cages: [...SEED_CAGES],
    applications: [...SEED_APPLICATIONS],
  };
}

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readFromDisk(): DbStore {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    const seeded = seedStore();
    fs.writeFileSync(DB_FILE, JSON.stringify(seeded, null, 2), "utf-8");
    return seeded;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as DbStore;
    // migrate legacy plaintext passwords on read
    let dirty = false;
    parsed.users = parsed.users.map((u) => {
      if (!u.password.startsWith("sha256$")) {
        dirty = true;
        return { ...u, password: hashPassword(u.password) };
      }
      return u;
    });
    parsed.instruments = (parsed.instruments ?? []).map((i) => ({
      ...i,
      accessories: i.accessories ?? [],
      trainingRequired: i.trainingRequired ?? false,
    }));
    parsed.sessions = parsed.sessions ?? [];
    parsed.managedAnimals = parsed.managedAnimals ?? [...SEED_MANAGED_ANIMALS];
    parsed.cages = parsed.cages ?? [...SEED_CAGES];
    parsed.applications = parsed.applications ?? [...SEED_APPLICATIONS];
    if (dirty) writeToDisk(parsed);
    return parsed;
  } catch {
    const seeded = seedStore();
    writeToDisk(seeded);
    return seeded;
  }
}

function writeToDisk(store: DbStore): void {
  ensureDir();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmp, DB_FILE);
}

export function getStore(): DbStore {
  if (!globalThis.__symbiosisDb) {
    globalThis.__symbiosisDb = readFromDisk();
  }
  return globalThis.__symbiosisDb;
}

export async function mutateStore<T>(mutator: (store: DbStore) => T): Promise<T> {
  const prev = globalThis.__symbiosisDbWriteQueue ?? Promise.resolve();
  let result!: T;
  let failed: unknown;

  const next = prev
    // Keep the serial queue alive even if a previous write failed
    .catch(() => undefined)
    .then(async () => {
      const store = getStore();
      result = mutator(store);
      writeToDisk(store);
    })
    .catch((err) => {
      failed = err;
    });

  globalThis.__symbiosisDbWriteQueue = next.then(() => undefined);
  await next;
  if (failed) throw failed;
  return result;
}

export function publicUser(user: User): Omit<User, "password"> & { password?: never } {
  const { password: _p, ...rest } = user;
  return rest;
}

export { uid };
