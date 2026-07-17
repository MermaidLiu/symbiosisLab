export type AnimalGender = "male" | "female" | "mixed";
export type StrainTypeFilter = "contains_public" | "excludes_public";
export type GenotypeStatusFilter = "all" | "unidentified" | "identified";
export type WeaningStatus = "weaned" | "not_weaned" | "all";
export type ManagedAnimalStatus = "active" | "breeding" | "quarantine" | "reserved" | "deceased";

/** 用途：空白鼠 / 信号鼠 / 免疫鼠 / 繁殖鼠 */
export type AnimalPurpose = "blank" | "signal_processing" | "immunity" | "breeding";

export const ANIMAL_PURPOSES: AnimalPurpose[] = [
  "blank",
  "signal_processing",
  "immunity",
  "breeding",
];

/**
 * 生命周期状态（按用途不同路径）
 * 信号：进笼 → 植入电极 → 采集信号 → 观察 → 处死
 * 免疫：进笼 → 观察 → 处死
 * 繁殖：进笼 → 观察
 * 空白：进笼
 */
export type MouseLifecycleStatus =
  | "entered"
  | "electrode_implant"
  | "signal_recording"
  | "observing"
  | "euthanasia";

export const PURPOSE_LIFECYCLE: Record<AnimalPurpose, MouseLifecycleStatus[]> = {
  blank: ["entered", "euthanasia"],
  signal_processing: ["entered", "electrode_implant", "signal_recording", "observing", "euthanasia"],
  immunity: ["entered", "observing", "euthanasia"],
  breeding: ["entered", "observing", "euthanasia"],
};

/** 处死方式 */
export type EuthanasiaMethod =
  | "humane"
  | "perfusion"
  | "cervical"
  | "brain_harvest"
  | "other";

export const EUTHANASIA_METHODS: EuthanasiaMethod[] = [
  "humane",
  "perfusion",
  "cervical",
  "brain_harvest",
  "other",
];

export interface ManagedAnimal {
  id: string;
  gender: "male" | "female";
  strain: string;
  genotype: string;
  sireId: string;
  sireGenotype: string;
  damId: string;
  damGenotype: string;
  birthDate: string;
  ageWeeks: number;
  /** Display location label, e.g. SPF-A-A01 */
  cageLocation: string;
  /** Link to Cage.id for facility board */
  cageId?: string;
  status: ManagedAnimalStatus;
  strainType: "public" | "private";
  generation: number;
  weaningStatus: "weaned" | "not_weaned";
  genotypeStatus: "identified" | "unidentified";
  purpose?: AnimalPurpose;
  /** 当前生命周期步骤 */
  lifecycleStatus?: MouseLifecycleStatus;
  /** 处死方式（仅处死阶段） */
  euthanasiaMethod?: EuthanasiaMethod;
  /** 自定义处死说明 */
  euthanasiaNote?: string;
  /** 申领人（空白鼠无申领人） */
  claimantUserId?: string;
  claimantName?: string;
  /** 负责技术员 */
  technicianUserId?: string;
  technicianName?: string;
  /** 电生理 / 记录状态 */
  ephysStatus?: EphysRecordStatus;
  /** 处死方式（断颈 / 灌流 / 发现死亡） */
  deathMethod?: DeathMethod;
  /** 进笼时间 ISO */
  cageEntryAt?: string;
  /** 植入时间 ISO（电极植入等） */
  implantAt?: string;
  /** 采集时间 ISO（仅信号鼠） */
  collectionAt?: string;
  /** 上次采集时间 ISO（仅信号鼠） */
  lastCollectionAt?: string;
  /** 特殊实验备注 */
  specialExperiment?: string;
}

/** 电生理记录状态 */
export type EphysRecordStatus =
  | "dead"
  | "ephys_no_signal"
  | "ephys_has_signal"
  | "twophoton"
  | "immunity_mouse"
  | "poor_condition"
  | "no_spike";

export const EPHYS_STATUSES: EphysRecordStatus[] = [
  "dead",
  "ephys_no_signal",
  "ephys_has_signal",
  "twophoton",
  "immunity_mouse",
  "poor_condition",
  "no_spike",
];

/** 死亡方式 */
export type DeathMethod = "cervical" | "perfusion" | "found_dead";

export const DEATH_METHODS: DeathMethod[] = ["cervical", "perfusion", "found_dead"];

/** 日历：某日动物房活动 */
export interface AnimalDayActivity {
  id: string;
  date: string;
  timestamp: string;
  animalId?: string;
  cageId?: string;
  action: string;
  details: string;
  userId: string;
  userName: string;
}

export type CageStatus =
  | "unavailable"
  | "selected"
  | "vacant"
  | "male_confirmed"
  | "female_confirmed"
  | "breeding"
  | "unidentified";

export interface Cage {
  id: string;
  number: string;
  rack: string;
  strain: string;
  cageType: string;
  capacity: number;
  occupied: number;
  status: CageStatus;
  userTag?: string;
  healthStatus?: string;
  /** 笼位默认技术员 */
  technicianUserId?: string;
  technicianName?: string;
}

export type ApplicationWorkflowStatus =
  | "pending_receipt"
  | "received"
  | "awaiting_conditions"
  | "completed"
  | "rejected";

export type ApplicationType =
  | "custody"
  | "veterinary"
  | "transfer"
  | "cage_change"
  | "breeding"
  | "euthanasia"
  | "other";

export interface OperationApplication {
  id: string;
  applicationTime: string;
  applicant: string;
  /** User id of applicant — used for approval notifications */
  applicantUserId?: string;
  pi: string;
  type: ApplicationType;
  description: string;
  /** Managed animal ids when type is custody, veterinary, or transfer */
  animalIds?: string[];
  /** What the veterinarian should do (veterinary requests) */
  vetInstructions?: string;
  status: ApplicationWorkflowStatus;
  waitingHours: number;
  processor?: string;
  receivedTime?: string;
  completionTime?: string;
  feedback?: string;
}

export interface AnimalFilterState {
  strain: string;
  genotype: string;
  strainType: string;
  gender: string;
  status: string;
  generation: string;
  weaningStatus: string;
  genotypeStatus: GenotypeStatusFilter;
  animalId: string;
}

/** Aggregated cage cell for facility supervisor board */
export interface FacilityCageCell {
  cage: Cage;
  mice: ManagedAnimal[];
  claimedCount: number;
  purposeCounts: Record<AnimalPurpose, number>;
  dominantPurpose: AnimalPurpose | "mixed" | "empty";
}
