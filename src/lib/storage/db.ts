/**
 * Client-side read cache hydrated from the backend API.
 * Keeps existing sync call sites (getUsers/getLogs/...) working without UI rewrites.
 */
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
import { api, BootstrapData, PublicUser } from "@/lib/api/client";

type Cache = {
  users: PublicUser[];
  instruments: Instrument[];
  animals: Animal[];
  bookings: Booking[];
  logs: AuditLog[];
  notifications: AppNotification[];
  managedAnimals: ManagedAnimal[];
  cages: Cage[];
  applications: OperationApplication[];
};

const empty: Cache = {
  users: [],
  instruments: [],
  animals: [],
  bookings: [],
  logs: [],
  notifications: [],
  managedAnimals: [],
  cages: [],
  applications: [],
};

let cache: Cache = { ...empty };
let hydrated = false;

export function isHydrated() {
  return hydrated;
}

export function applyBootstrap(data: BootstrapData) {
  cache = {
    users: data.users,
    instruments: data.instruments,
    animals: data.animals,
    bookings: data.bookings,
    logs: data.logs,
    notifications: data.notifications,
    managedAnimals: data.managedAnimals,
    cages: data.cages,
    applications: data.applications,
  };
  hydrated = true;
}

export function setCachePartial(partial: Partial<Cache>) {
  cache = { ...cache, ...partial };
}

export async function hydrateFromApi(): Promise<boolean> {
  try {
    const data = await api.bootstrap();
    applyBootstrap(data);
    return true;
  } catch {
    hydrated = false;
    cache = { ...empty };
    return false;
  }
}

/** @deprecated Server seeds automatically; kept for call-site compatibility */
export function ensureSeeded(): void {
  // no-op on client — seeding happens server-side in data/db.json
}

export function getUsers(): User[] {
  // password never returned from API; cast to User for existing call sites
  return cache.users as User[];
}

export function saveUsers(users: User[]): void {
  cache.users = users as PublicUser[];
}

export function getInstruments(): Instrument[] {
  return cache.instruments;
}

export function saveInstruments(items: Instrument[]): void {
  cache.instruments = items;
}

export function getAnimals(): Animal[] {
  return cache.animals;
}

export function saveAnimals(items: Animal[]): void {
  cache.animals = items;
}

export function getBookings(): Booking[] {
  return cache.bookings;
}

export function saveBookings(items: Booking[]): void {
  cache.bookings = items;
}

export function getLogs(): AuditLog[] {
  return cache.logs;
}

export function appendLog(log: AuditLog): void {
  cache.logs = [log, ...cache.logs].slice(0, 500);
}

export function getNotifications(): AppNotification[] {
  return cache.notifications;
}

export function saveNotifications(items: AppNotification[]): void {
  cache.notifications = items;
}

export function getManagedAnimals(): ManagedAnimal[] {
  return cache.managedAnimals;
}

export function getCages(): Cage[] {
  return cache.cages;
}

export function getApplications(): OperationApplication[] {
  return cache.applications;
}

export function saveApplications(items: OperationApplication[]): void {
  cache.applications = items;
}

export function getSession(): null {
  return null; // sessions are httpOnly cookies now
}

export function setSession(_session: unknown): void {
  // no-op — cookie managed by API
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
