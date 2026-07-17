import fs from "fs";
import path from "path";
import {
  User,
  Instrument,
  Animal,
  Booking,
  AuditLog,
  AppNotification,
  Todo,
  ProgressReport,
  PptTemplate,
  RaAchievementRecord,
  RaAnalyticsMetrics,
  RaDataEntry,
  RaImageLibraryItem,
  RaProject,
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
  /** RA daily todos table */
  todos: Todo[];
  /** Lab member weekly progress reports */
  progressReports: ProgressReport[];
  /** PPT template metadata (files on disk under data/ppt-templates/) */
  pptTemplates: PptTemplate[];
  /** Achievement scans (files under data/ra-achievements/) */
  raAchievements: RaAchievementRecord[];
  /** Manually entered analytics KPIs */
  raAnalytics: RaAnalyticsMetrics | null;
  /** Manual data-management rows */
  raDataEntries: RaDataEntry[];
  /** PPT workbench image library (files under data/ra-images/) */
  raImageLibrary: RaImageLibraryItem[];
  /** RA project board */
  raProjects: RaProject[];
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
    todos: [],
    progressReports: [],
    pptTemplates: [],
    raAchievements: [],
    raAnalytics: null,
    raDataEntries: [],
    raImageLibrary: [],
    raProjects: [],
  };
}

const DEFAULT_RA_PROJECTS: RaProject[] = [
  { id: "p1", name: "共生微生物组课题", status: "active", progress: 62, due: "2026-09-30" },
  { id: "p2", name: "仪器预约智能化", status: "active", progress: 40, due: "2026-08-15" },
  { id: "p3", name: "横向合作—免疫成像", status: "paused", progress: 25, due: "2026-12-01" },
  { id: "p4", name: "开题报告修订", status: "done", progress: 100, due: "2026-03-01" },
];

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
    todos: [],
    progressReports: [],
    pptTemplates: [],
    raAchievements: [],
    raAnalytics: null,
    raDataEntries: [],
    raImageLibrary: [],
    raProjects: DEFAULT_RA_PROJECTS.map((p) => ({ ...p })),
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
    if (!Array.isArray(parsed.todos)) {
      parsed.todos = [];
      dirty = true;
    }
    if (!Array.isArray(parsed.progressReports)) {
      parsed.progressReports = [];
      dirty = true;
    }
    if (!Array.isArray(parsed.pptTemplates)) {
      parsed.pptTemplates = [];
      dirty = true;
    }
    if (!Array.isArray(parsed.raAchievements)) {
      parsed.raAchievements = [];
      dirty = true;
    }
    if (parsed.raAnalytics === undefined) {
      parsed.raAnalytics = null;
      dirty = true;
    }
    if (!Array.isArray(parsed.raDataEntries)) {
      parsed.raDataEntries = [];
      dirty = true;
    }
    if (!Array.isArray(parsed.raImageLibrary)) {
      parsed.raImageLibrary = [];
      dirty = true;
    }
    if (!Array.isArray(parsed.raProjects)) {
      parsed.raProjects = DEFAULT_RA_PROJECTS.map((p) => ({ ...p }));
      dirty = true;
    }
    // Default purpose on managed animals
    for (const a of parsed.managedAnimals ?? []) {
      if (!a.purpose) {
        a.purpose = "blank";
        dirty = true;
      }
    }
    // Ensure seed RA + demo students + vet exist for existing databases
    for (const email of ["ra@lab.edu.cn", "chen@lab.edu.cn", "zhao@lab.edu.cn", "vet@lab.edu.cn"]) {
      if (!parsed.users.some((u) => u.email === email)) {
        const seed = SEED_USERS.find((u) => u.email === email);
        if (seed) {
          parsed.users.push({ ...seed, password: hashPassword(seed.password) });
          dirty = true;
        }
      }
    }
    // Keep demo RA display name in sync
    const ra = parsed.users.find((u) => u.email === "ra@lab.edu.cn");
    if (ra && ra.name !== "助理小刘") {
      ra.name = "助理小刘";
      dirty = true;
    }
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
  } else {
    if (!Array.isArray(globalThis.__symbiosisDb.todos)) {
      globalThis.__symbiosisDb.todos = [];
    }
    if (!Array.isArray(globalThis.__symbiosisDb.progressReports)) {
      globalThis.__symbiosisDb.progressReports = [];
    }
    if (!Array.isArray(globalThis.__symbiosisDb.pptTemplates)) {
      globalThis.__symbiosisDb.pptTemplates = [];
    }
    if (!Array.isArray(globalThis.__symbiosisDb.raAchievements)) {
      globalThis.__symbiosisDb.raAchievements = [];
    }
    if (globalThis.__symbiosisDb.raAnalytics === undefined) {
      globalThis.__symbiosisDb.raAnalytics = null;
    }
    if (!Array.isArray(globalThis.__symbiosisDb.raDataEntries)) {
      globalThis.__symbiosisDb.raDataEntries = [];
    }
    if (!Array.isArray(globalThis.__symbiosisDb.raImageLibrary)) {
      globalThis.__symbiosisDb.raImageLibrary = [];
    }
    if (!Array.isArray(globalThis.__symbiosisDb.raProjects)) {
      globalThis.__symbiosisDb.raProjects = DEFAULT_RA_PROJECTS.map((p) => ({ ...p }));
    }
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
