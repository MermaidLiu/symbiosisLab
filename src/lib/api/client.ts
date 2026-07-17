import {
  User,
  Instrument,
  Animal,
  Booking,
  AuditLog,
  AppNotification,
  Role,
  BookingStatus,
} from "@/types";
import {
  ManagedAnimal,
  Cage,
  OperationApplication,
  ApplicationType,
} from "@/types/animal-management";

export type PublicUser = Omit<User, "password">;

export interface BootstrapData {
  user: PublicUser;
  users: PublicUser[];
  instruments: Instrument[];
  animals: Animal[];
  bookings: Booking[];
  logs: AuditLog[];
  notifications: AppNotification[];
  managedAnimals: ManagedAnimal[];
  cages: Cage[];
  applications: OperationApplication[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = (data as { error?: string }).error ?? `http_${res.status}`;
    throw Object.assign(new Error(error), { status: res.status, code: error });
  }
  return data as T;
}

export const api = {
  bootstrap: () => request<BootstrapData>("/api/bootstrap"),

  me: () => request<{ user: PublicUser }>("/api/auth"),

  login: (email: string, password: string) =>
    request<{ user: PublicUser }>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ action: "login", email, password }),
    }),

  register: (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    department?: string;
    roles: Role[];
  }) =>
    request<{ user: PublicUser }>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ action: "register", ...data }),
    }),

  logout: () =>
    request<{ ok: boolean }>("/api/auth", {
      method: "POST",
      body: JSON.stringify({ action: "logout" }),
    }),

  users: () => request<{ users: PublicUser[] }>("/api/users"),

  updateUserRoles: (userId: string, roles: Role[]) =>
    request<{ users: PublicUser[] }>("/api/users", {
      method: "PATCH",
      body: JSON.stringify({ userId, roles }),
    }),

  instruments: () => request<{ instruments: Instrument[] }>("/api/instruments"),

  createInstrument: (data: Omit<Instrument, "id" | "createdAt" | "updatedAt">) =>
    request<{ instrument: Instrument }>("/api/instruments", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateInstrument: (id: string, data: Partial<Instrument>) =>
    request<{ instrument: Instrument }>(`/api/instruments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteInstrument: (id: string) =>
    request<{ ok: boolean }>(`/api/instruments/${id}`, { method: "DELETE" }),

  animals: () => request<{ animals: Animal[] }>("/api/animals"),

  createAnimal: (data: Omit<Animal, "id" | "createdAt" | "updatedAt">) =>
    request<{ animal: Animal }>("/api/animals", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateAnimal: (id: string, data: Partial<Animal>) =>
    request<{ animal: Animal }>(`/api/animals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteAnimal: (id: string) =>
    request<{ ok: boolean }>(`/api/animals/${id}`, { method: "DELETE" }),

  bookings: () => request<{ bookings: Booking[] }>("/api/bookings"),

  createBooking: (data: Omit<Booking, "id" | "createdAt" | "status">) =>
    request<{ booking: Booking }>("/api/bookings", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateBookingStatus: (id: string, status: BookingStatus) =>
    request<{ booking: Booking; bookings: Booking[] }>("/api/bookings", {
      method: "PATCH",
      body: JSON.stringify({ id, status }),
    }),

  logs: () => request<{ logs: AuditLog[] }>("/api/logs"),

  notifications: () => request<{ notifications: AppNotification[] }>("/api/notifications"),

  handleNotification: (id: string, action: "open" | "approve" | "reject" | "read") =>
    request<{ notifications: AppNotification[]; bookings?: Booking[] }>("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ id, action }),
    }),

  markAllNotificationsRead: () =>
    request<{ notifications: AppNotification[] }>("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_all_read" }),
    }),

  managedAnimals: () => request<{ managedAnimals: ManagedAnimal[] }>("/api/managed-animals"),

  facilityBoard: () =>
    request<{
      cages: Cage[];
      managedAnimals: ManagedAnimal[];
      cells: import("@/types/animal-management").FacilityCageCell[];
      activities: import("@/types/animal-management").AnimalDayActivity[];
      staff: PublicUser[];
    }>("/api/facility-board"),

  updateManagedAnimal: (id: string, data: Partial<ManagedAnimal> & Record<string, unknown>) =>
    request<{
      animal: ManagedAnimal;
      managedAnimals: ManagedAnimal[];
      cells: import("@/types/animal-management").FacilityCageCell[];
      activities: import("@/types/animal-management").AnimalDayActivity[];
    }>(`/api/managed-animals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  batchUploadManagedAnimals: (payload: { csv?: string; rows?: Record<string, string>[] }) =>
    request<{
      created: number;
      errors: string[];
      managedAnimals: ManagedAnimal[];
      cells: import("@/types/animal-management").FacilityCageCell[];
      activities: import("@/types/animal-management").AnimalDayActivity[];
    }>("/api/managed-animals/batch", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createManagedAnimal: (data: Partial<ManagedAnimal> & { id: string; gender: "male" | "female"; strain: string; cageLocation: string; birthDate: string }) =>
    request<{ animal: ManagedAnimal; managedAnimals: ManagedAnimal[] }>("/api/managed-animals", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteManagedAnimal: (id: string) =>
    request<{ managedAnimals: ManagedAnimal[] }>(`/api/managed-animals?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  cages: () => request<{ cages: Cage[] }>("/api/cages"),

  createCage: (data: {
    number: string;
    rack?: string;
    strain?: string;
    cageType?: string;
    capacity?: number;
    id?: string;
  }) =>
    request<{
      cage: Cage;
      cages: Cage[];
      cells: import("@/types/animal-management").FacilityCageCell[];
    }>("/api/cages", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  applications: () => request<{ applications: OperationApplication[] }>("/api/applications"),

  createApplication: (data: {
    type: ApplicationType;
    description: string;
    pi?: string;
    animalIds?: string[];
    vetInstructions?: string;
  }) =>
    request<{ application: OperationApplication; applications: OperationApplication[] }>(
      "/api/applications",
      { method: "POST", body: JSON.stringify(data) }
    ),

  reviewApplication: (id: string, action: "approve" | "reject" | "receive", feedback?: string) =>
    request<{ application: OperationApplication; applications: OperationApplication[] }>(
      "/api/applications",
      { method: "PATCH", body: JSON.stringify({ id, action, feedback }) }
    ),

  cancelApplication: (id: string) =>
    request<{ applications: OperationApplication[] }>(`/api/applications?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  raProjects: () => request<{ projects: import("@/types").RaProject[] }>("/api/ra-projects"),

  createRaProject: (data: {
    name: string;
    due: string;
    status?: "active" | "paused" | "done";
    progress?: number;
  }) =>
    request<{ project: import("@/types").RaProject; projects: import("@/types").RaProject[] }>(
      "/api/ra-projects",
      { method: "POST", body: JSON.stringify(data) }
    ),

  createUser: (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    department?: string;
    roles: Role[];
  }) =>
    request<{ user: PublicUser; users: PublicUser[] }>("/api/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
