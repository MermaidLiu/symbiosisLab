/** V2 实验 Operation 状态 */
export type ExperimentOperationStatus =
  | "open"
  | "tech_submitted"
  | "closed"
  | "force_closed";

/** 实验类型 */
export type ExperimentKind =
  | "ephys"
  | "behavior"
  | "optotagging"
  | "imaging"
  | "other";

export const EXPERIMENT_KINDS: ExperimentKind[] = [
  "ephys",
  "behavior",
  "optotagging",
  "imaging",
  "other",
];

/** V2 小鼠建档 / 实验就绪状态 */
export type AnimalRegistrationStatus =
  | "blank_available"
  | "blank_claimed"
  | "awaiting_register"
  | "awaiting_experiment"
  | "in_experiment"
  | "deceased";

export const ANIMAL_REGISTRATION_STATUSES: AnimalRegistrationStatus[] = [
  "blank_available",
  "blank_claimed",
  "awaiting_register",
  "awaiting_experiment",
  "in_experiment",
  "deceased",
];

/**
 * 一次实验 = 一条 Operation（技术员创建 → 提交 → 学生闭环）
 * 与 OperationApplication（审批流）不同。
 */
export interface ExperimentOperation {
  id: string;
  animalId: string;
  status: ExperimentOperationStatus;
  kind: ExperimentKind;
  title: string;
  /** 自动绑定：当前登录技术员 */
  technicianUserId: string;
  technicianName: string;
  /** 小鼠认领学生 */
  studentUserId: string;
  studentName: string;
  startedAt: string;
  techSubmittedAt?: string;
  closedAt?: string;
  resultNote?: string;
  /** 实验结果截图/照片（存储路径或 URL） */
  resultImageUrls?: string[];
  /** 学生上传的 NAS 原始数据路径 */
  nasDataPath?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * 补录：技术员提交（或闭环）不在 Operation 开始的同一自然日
   */
  backfill?: boolean;
  forceClosedBy?: string;
  forceClosedByName?: string;
  forceCloseReason?: string;
}

/** 生命周期追溯条目 */
export interface AnimalLifecycleTraceEvent {
  id: string;
  animalId: string;
  timestamp: string;
  action: string;
  userId: string;
  userName: string;
  details: string;
  operationId?: string;
}
