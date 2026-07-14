export type Role = "super_admin" | "instrument_manager" | "animal_manager" | "user";

export type ResourceStatus = "available" | "maintenance" | "retired" | "in_use" | "quarantine";

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled" | "completed";

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  roles: Role[];
  phone?: string;
  department?: string;
  createdAt: string;
}

export interface InstrumentAccessory {
  name: string;
  nameEn: string;
  quantity: number;
}

export interface Instrument {
  id: string;
  name: string;
  nameEn: string;
  model: string;
  location: string;
  description: string;
  descriptionEn: string;
  status: "available" | "maintenance" | "retired";
  contactUserId: string;
  contactPhone: string;
  tags: string[];
  specs: { key: string; value: string }[];
  accessories: InstrumentAccessory[];
  trainingRequired: boolean;
  minBookingHours: number;
  maxBookingHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface Animal {
  id: string;
  name: string;
  nameEn: string;
  species: string;
  speciesEn: string;
  strain: string;
  identifier: string;
  sex: "male" | "female" | "unknown";
  location: string;
  status: "available" | "in_use" | "quarantine";
  contactUserId: string;
  contactPhone: string;
  notes: string;
  notesEn: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  resourceType: "instrument" | "animal";
  resourceId: string;
  userId: string;
  startTime: string;
  endTime: string;
  purpose: string;
  status: BookingStatus;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: string;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  titleEn: string;
  message: string;
  messageEn: string;
  read: boolean;
  link?: string;
  kind?: "info" | "booking_pending" | "booking_status";
  bookingId?: string;
  handled?: boolean;
  createdAt: string;
}

export interface Session {
  userId: string;
  token: string;
  expiresAt: string;
}
