export type Role =
  | "super_admin"
  | "instrument_manager"
  | "animal_manager"
  | "research_assistant"
  | "user";

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
  kind?: "info" | "booking_pending" | "booking_status" | "application_status" | "application_pending";
  bookingId?: string;
  applicationId?: string;
  handled?: boolean;
  createdAt: string;
}

export interface Session {
  userId: string;
  token: string;
  expiresAt: string;
}

/** Lab member weekly progress report */
export interface ProgressReport {
  id: string;
  studentName: string;
  weekNum: number;
  content: string;
  blockers: string;
  submittedAt: string;
}

/** Research Assistant daily todo (persisted in server `todos` collection) */
export interface Todo {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  /** Calendar day this todo belongs to, YYYY-MM-DD */
  date: string;
  createdAt: string;
  updatedAt: string;
}

/** PPTX template metadata (binary stored under data/ppt-templates/{id}.pptx) */
export interface PptTemplate {
  id: string;
  name: string;
  /** Placeholder keys discovered in the file, e.g. date, funding_amount */
  placeholders: string[];
  uploadedBy: string;
  createdAt: string;
}

/** Achievement archive: certificates, patents, papers, PPT scans */
export type RaAchievementCategory = "certificate" | "patent" | "paper" | "ppt";

export interface RaAchievementRecord {
  id: string;
  category: RaAchievementCategory;
  title: string;
  note: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
}

/** Manually maintained analytics metrics for RA dashboard */
export interface RaAnalyticsMetrics {
  papersYtd: number;
  experimentsWeek: number;
  fundingUsedPct: number;
  labMembersActive: number;
  updatedAt: string;
  updatedBy: string;
}

/** Free-form data row entered by RA in 数据管理 */
export interface RaDataEntry {
  id: string;
  category: string;
  label: string;
  value: string;
  unit: string;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

