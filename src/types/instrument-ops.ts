/** Training applications & repair tickets for instruments */

export type InstrumentTrainingRequestStatus =
  | "pending"
  | "approved"
  | "authorized"
  | "rejected"
  | "cancelled";

export interface InstrumentTrainingRequest {
  id: string;
  instrumentId: string;
  instrumentName: string;
  applicantUserId: string;
  applicantName: string;
  note: string;
  status: InstrumentTrainingRequestStatus;
  /** Manager who approved / authorized */
  handledByUserId?: string;
  handledByName?: string;
  handledNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type InstrumentRepairTicketStatus =
  | "open"
  | "acknowledged"
  | "escalated"
  | "resolved"
  | "cancelled";

export interface InstrumentRepairTicket {
  id: string;
  instrumentId: string;
  instrumentName: string;
  reporterUserId: string;
  reporterName: string;
  description: string;
  status: InstrumentRepairTicketStatus;
  /** Expected repair completion ISO */
  eta?: string;
  managerNote?: string;
  /** Manager who responded */
  managerUserId?: string;
  managerName?: string;
  /** Escalated to instrument super admin */
  escalatedToUserId?: string;
  escalatedNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** Display status shown to managers / super admins */
export type InstrumentDisplayStatus =
  | "idle"
  | "in_use"
  | "training"
  | "maintenance"
  | "retired";
