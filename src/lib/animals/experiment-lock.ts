import type { ManagedAnimal } from "@/types/animal-management";

/**
 * 实验未闭环锁定：学生不可派发 / 删除 / 改状态等，防止篡改一生记录。
 * 学生仍可在实验追溯中填写 NAS 完成闭环。
 */
export function isAnimalExperimentLocked(
  animal: Pick<ManagedAnimal, "animalLock" | "registrationStatus">
): boolean {
  return Boolean(animal.animalLock) || animal.registrationStatus === "in_experiment";
}

/** 本地自然日 YYYY-MM-DD（用于判断是否「当天处理」） */
export function calendarDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 处理日与开始日是否同一天；不同则视为补录 */
export function isBackfillProcessing(startedAt: string, processedAt: string): boolean {
  return calendarDayKey(startedAt) !== calendarDayKey(processedAt);
}
