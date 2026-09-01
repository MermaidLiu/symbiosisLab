import { DbStore, uid } from "@/server/store";
import { ManagedAnimal } from "@/types/animal-management";
import {
  AnimalLifecycleTraceEvent,
  AnimalRegistrationStatus,
  ExperimentKind,
  ExperimentOperation,
  ExperimentOperationStatus,
} from "@/types/animal-lifecycle";

const ANIMAL_ID_RE = /^M\d{12}$/;

export function isPermanentAnimalId(id: string): boolean {
  return ANIMAL_ID_RE.test(id);
}

/** 生成永久 Animal ID：M + YYYYMMDD + 4 位序号 */
export function generateAnimalId(store: DbStore): string {
  const d = new Date();
  const prefix = `M${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const retired = new Set(store.retiredAnimalIds ?? []);
  let seq = 1;
  while (seq < 10000) {
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;
    const taken =
      store.managedAnimals.some((a) => a.id === candidate) || retired.has(candidate);
    if (!taken) return candidate;
    seq++;
  }
  throw new Error("animal_id_exhausted");
}

export function findAnimal(store: DbStore, animalId: string): ManagedAnimal | undefined {
  return store.managedAnimals.find((a) => a.id === animalId);
}

export function openOperationForAnimal(
  store: DbStore,
  animalId: string
): ExperimentOperation | undefined {
  return (store.experimentOperations ?? []).find(
    (op) =>
      op.animalId === animalId &&
      (op.status === "open" || op.status === "tech_submitted")
  );
}

export function appendLifecycleTrace(
  store: DbStore,
  evt: Omit<AnimalLifecycleTraceEvent, "id">
): AnimalLifecycleTraceEvent {
  const row: AnimalLifecycleTraceEvent = { id: uid("alt"), ...evt };
  store.animalLifecycleTraces = [row, ...(store.animalLifecycleTraces ?? [])];
  return row;
}

export function setRegistrationStatus(
  animal: ManagedAnimal,
  status: AnimalRegistrationStatus
): void {
  animal.registrationStatus = status;
  if (status === "in_experiment") {
    animal.animalLock = true;
  } else if (status === "awaiting_experiment" || status === "deceased") {
    animal.animalLock = false;
  }
}

/** 实验闭环结束后：若已登记死亡则进入 deceased，否则回到待实验 */
export function finalizeRegistrationAfterClose(animal: ManagedAnimal): void {
  const dead =
    Boolean(animal.deathAt) ||
    animal.recordingStatus === "dead" ||
    animal.status === "deceased";
  if (dead) {
    animal.status = "deceased";
    animal.recordingStatus = "dead";
    animal.lifecycleStatus = "euthanasia";
    setRegistrationStatus(animal, "deceased");
  } else {
    setRegistrationStatus(animal, "awaiting_experiment");
  }
}

export function assertCanCreateOperation(animal: ManagedAnimal, store: DbStore): string | null {
  if (animal.registrationStatus === "deceased" || animal.status === "deceased") {
    return "animal_deceased";
  }
  if (animal.animalLock || openOperationForAnimal(store, animal.id)) {
    return "animal_locked";
  }
  const rs = animal.registrationStatus;
  if (rs === "in_experiment") return "animal_locked";
  if (rs && rs !== "awaiting_experiment") return "not_ready_for_experiment";
  if (!animal.claimantUserId) return "no_claimant";
  return null;
}

export function normalizeLegacyRegistration(animal: ManagedAnimal): void {
  if (animal.registrationStatus) {
    // 已建档但缺植入时间：用录入时间补齐
    if (
      !animal.implantAt &&
      animal.registeredAt &&
      (animal.registrationStatus === "awaiting_experiment" ||
        animal.registrationStatus === "in_experiment")
    ) {
      animal.implantAt = animal.registeredAt;
    }
    return;
  }
  if (animal.status === "deceased") {
    animal.registrationStatus = "deceased";
    return;
  }
  if (animal.animalLock) {
    animal.registrationStatus = "in_experiment";
    return;
  }
  if (animal.claimantUserId && animal.registeredAt) {
    animal.registrationStatus = "awaiting_experiment";
    if (!animal.implantAt) animal.implantAt = animal.registeredAt;
    return;
  }
  if (animal.claimantUserId && animal.surgeryCompletedAt) {
    animal.registrationStatus = "awaiting_register";
    return;
  }
  if (animal.claimantUserId) {
    animal.registrationStatus = "blank_claimed";
    return;
  }
  if (animal.purpose === "blank" || !animal.claimantUserId) {
    animal.registrationStatus = "blank_available";
  }
}

export const REGISTRATION_LABELS: Record<AnimalRegistrationStatus, string> = {
  blank_available: "空白鼠待认领",
  blank_claimed: "已认领待手术",
  awaiting_register: "待扫码建档",
  awaiting_experiment: "待实验",
  in_experiment: "实验中",
  deceased: "已结束",
};

export const OPERATION_STATUS_LABELS: Record<ExperimentOperationStatus, string> = {
  open: "进行中",
  tech_submitted: "待学生闭环",
  closed: "已闭环",
  force_closed: "主管强制关闭",
};

export const EXPERIMENT_KIND_LABELS: Record<ExperimentKind, string> = {
  ephys: "电生理",
  behavior: "行为学",
  optotagging: "Optotagging",
  imaging: "成像",
  other: "其他",
};
