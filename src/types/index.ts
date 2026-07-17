export type Role =
  | "super_admin"
  | "instrument_manager"
  | "animal_facility_supervisor"
  | "animal_manager"
  | "veterinarian"
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

/** PPTX slide metadata (placeholders discovered per slide) */
export interface PptSlideImageMeta {
  /** Pixel width of embedded media (0 if unknown) */
  width: number;
  /** Pixel height of embedded media (0 if unknown) */
  height: number;
}

/** Beautiful.ai-style editable placeholder on a slide (normalized 0–1 coords) */
export interface PptSlideBlock {
  key: string;
  kind: "text" | "image";
  /** Left edge as fraction of slide width */
  x: number;
  /** Top edge as fraction of slide height */
  y: number;
  /** Width as fraction of slide width */
  w: number;
  /** Height as fraction of slide height */
  h: number;
  /** Stacking order — lower draws behind (background images use low z) */
  z?: number;
  /** Template default text (text blocks) */
  defaultText?: string;
  /** Index into slide media / imageKeys (image blocks) */
  imageIndex?: number;
}

export interface PptTemplateSlide {
  /** 0-based index matching ppt/slides/slide{n}.xml order in presentation */
  index: number;
  /** Display label, e.g. Page 1 */
  label: string;
  /** All field keys (text + image) */
  placeholders: string[];
  /** Text fields to edit on canvas */
  textKeys: string[];
  /** Image slot keys (named img_* or auto __img_N from embedded media) */
  imageKeys: string[];
  /** Default text parsed from template (for __text_* / __shape_* and initial display) */
  textDefaults?: Record<string, string>;
  /** Per imageKeys index: intrinsic pixel size for natural preview */
  imageMeta?: PptSlideImageMeta[];
  /** Positioned placeholders for Smart-Slide style canvas */
  blocks?: PptSlideBlock[];
}

/** PPTX template metadata (binary stored under data/ppt-templates/{id}.pptx) */
export interface PptTemplate {
  id: string;
  name: string;
  /** Flat unique placeholder keys (legacy + convenience) */
  placeholders: string[];
  /** Per-slide placeholders; empty if file has no slides parsed yet */
  slides: PptTemplateSlide[];
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

/** Lab photo / equipment image for PPT workbench image library */
export type RaImageLibraryTag = "lab" | "equipment" | "experiment";

export interface RaImageLibraryItem {
  id: string;
  title: string;
  tag: RaImageLibraryTag;
  note: string;
  fileName: string;
  mimeType: string;
  uploadedBy: string;
  createdAt: string;
}

/** Research Assistant project board item */
export interface RaProject {
  id: string;
  name: string;
  status: "active" | "paused" | "done";
  progress: number;
  due: string;
  createdAt?: string;
  createdBy?: string;
}

