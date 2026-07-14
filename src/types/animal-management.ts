export type AnimalGender = "male" | "female" | "mixed";
export type StrainTypeFilter = "contains_public" | "excludes_public";
export type GenotypeStatusFilter = "all" | "unidentified" | "identified";
export type WeaningStatus = "weaned" | "not_weaned" | "all";
export type ManagedAnimalStatus = "active" | "breeding" | "quarantine" | "reserved" | "deceased";

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
  cageLocation: string;
  status: ManagedAnimalStatus;
  strainType: "public" | "private";
  generation: number;
  weaningStatus: "weaned" | "not_weaned";
  genotypeStatus: "identified" | "unidentified";
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
}

export type ApplicationWorkflowStatus =
  | "pending_receipt"
  | "received"
  | "awaiting_conditions"
  | "completed"
  | "rejected";

export type ApplicationType =
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
  pi: string;
  type: ApplicationType;
  description: string;
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
