/** Student-assignable animal operation types (each has a free-text note). */
export const ANIMAL_OP_TYPES = [
  "fasting",
  "water_deprivation",
  "signal_collection",
  "euthanasia",
  "perfusion",
  "surgery",
  "other",
] as const;

export type AnimalOpType = (typeof ANIMAL_OP_TYPES)[number];

export type AnimalOpTaskStatus = "scheduled" | "done" | "cancelled";

/**
 * Urgency from 必要 × 紧急:
 * - necessary + urgent → critical (红)
 * - necessary only → important (黄)
 * - urgent only → urgent (绿)
 * - neither → normal (灰)
 */
export type AnimalOpUrgency = "critical" | "important" | "urgent" | "normal";

export function urgencyFromFlags(necessary: boolean, urgent: boolean): AnimalOpUrgency {
  if (necessary && urgent) return "critical";
  if (necessary) return "important";
  if (urgent) return "urgent";
  return "normal";
}

export const URGENCY_COLORS: Record<AnimalOpUrgency, string> = {
  critical: "#DC2626",
  important: "#EAB308",
  urgent: "#16A34A",
  normal: "#94A3B8",
};

export interface AnimalOpTask {
  id: string;
  animalIds: string[];
  opType: AnimalOpType;
  /** 填空备注 */
  note: string;
  assigneeUserId: string;
  assigneeName: string;
  necessary: boolean;
  urgent: boolean;
  urgency: AnimalOpUrgency;
  startTime: string;
  endTime: string;
  status: AnimalOpTaskStatus;
  /** Lower = earlier in the day's queue (drag reorder) */
  sortOrder?: number;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  completedAt?: string;
  /** Receipt note sent back to the student when done */
  receiptNote?: string;
}
