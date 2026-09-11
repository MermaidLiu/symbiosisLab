import { DbStore } from "@/server/store";
import { openOperationForAnimal, isExperimentActiveForAnimal } from "@/server/animal-lifecycle";
import { ManagedAnimal } from "@/types/animal-management";
import { AnimalOpTask } from "@/types/animal-ops";

const OP_TYPE_LABEL: Record<string, string> = {
  fasting: "禁食",
  water_deprivation: "禁水",
  signal_collection: "数据采集",
  euthanasia: "安乐死",
  perfusion: "灌流",
  surgery: "手术",
  other: "其他实验",
};

/** 小鼠上最新一条仍有效的派发任务（scheduled） */
export function activeScheduledTaskForAnimal(
  store: DbStore,
  animalId: string
): AnimalOpTask | undefined {
  const list = store.animalOpTasks ?? [];
  return list.find((t) => t.status === "scheduled" && t.animalIds.includes(animalId));
}

/**
 * 为列表补充「派发给谁 / 当前进度 / 可否撤销」。
 * 仅用于 API 响应，勿写回持久化语义字段。
 */
export function withDispatchListFields(
  animal: ManagedAnimal,
  store: DbStore,
  viewerUserId?: string
): ManagedAnimal {
  const op = openOperationForAnimal(store, animal.id);
  const task = activeScheduledTaskForAnimal(store, animal.id);
  const experimentActive = isExperimentActiveForAnimal(store, animal.id);

  const assigneeName = experimentActive
    ? op?.technicianName || animal.technicianName || task?.assigneeName || undefined
    : undefined;

  let progress = "";
  if (op?.status === "open") {
    const opLabel = task ? OP_TYPE_LABEL[task.opType] || task.opType : op.title || "实验";
    progress = `待技术员处理（${opLabel}）`;
  } else if (op?.status === "tech_submitted") {
    progress = "待学生 NAS 闭环";
  } else if (task && experimentActive) {
    const opLabel = OP_TYPE_LABEL[task.opType] || task.opType;
    progress = `已派发·待执行（${opLabel}）`;
  } else if (experimentActive) {
    progress = "实验中";
  }

  const canCancel =
    Boolean(viewerUserId) &&
    Boolean(task) &&
    task!.status === "scheduled" &&
    task!.createdByUserId === viewerUserId &&
    (!op || op.status === "open");

  return {
    ...animal,
    dispatchAssigneeName: assigneeName,
    dispatchProgress: progress || undefined,
    canCancelDispatch: canCancel,
    activeDispatchTaskId: canCancel ? task!.id : task?.id,
  };
}
