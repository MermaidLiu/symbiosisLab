import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { isAnimalOpsStaff } from "@/lib/roles";
import { displayName } from "@/lib/users";

/**
 * Emergency force-handle by caretaker / technician / collector.
 * Leaves animalDayActivity + audit log; notifies animal owners; optionally closes related tasks.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!isAnimalOpsStaff(user.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const animalIds: string[] = Array.isArray(body.animalIds)
    ? Array.from(
        new Set(
          (body.animalIds as unknown[])
            .map((x) => String(x ?? "").trim())
            .filter((x) => x.length > 0)
        )
      )
    : [];
  const note = String(body.note ?? "").trim();
  const completeRelatedTasks = body.completeRelatedTasks !== false;

  if (!animalIds.length) return jsonError("invalid_body", 400);
  if (!note) return jsonError("note_required", 400);

  const store = getStore();
  const missing = animalIds.filter((id) => !store.managedAnimals.some((a) => a.id === id));
  if (missing.length) return jsonError("animal_not_found", 404);

  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const actor = displayName(user);
  const closedTaskIds: string[] = [];

  await mutateStore((s) => {
    const idSet = new Set(animalIds);

    for (const id of animalIds) {
      const animal = s.managedAnimals.find((a) => a.id === id);
      if (!animal) continue;
      const details = `强制处理 ${id}：${note}`;
      s.animalDayActivities = [
        {
          id: uid("act"),
          date,
          timestamp: now,
          animalId: id,
          cageId: animal.cageId,
          action: "force_handle",
          details,
          userId: user.id,
          userName: actor,
        },
        ...(s.animalDayActivities ?? []),
      ].slice(0, 800);

      const ownerId = animal.claimantUserId;
      if (ownerId) {
        s.notifications.unshift({
          id: uid("ntf"),
          userId: ownerId,
          title: "动物强制处理通知",
          titleEn: "Emergency animal handling",
          message: `${actor} 对小鼠 ${id} 执行了强制处理：${note}`,
          messageEn: `${actor} force-handled mouse ${id}: ${note}`,
          read: false,
          link: "/animals/managed",
          kind: "info",
          handled: false,
          createdAt: now,
        });
      }
    }

    if (completeRelatedTasks && Array.isArray(s.animalOpTasks)) {
      s.animalOpTasks = s.animalOpTasks.map((task) => {
        if (task.status !== "scheduled") return task;
        if (task.assigneeUserId !== user.id) return task;
        const hit = task.animalIds.some((id) => idSet.has(id));
        if (!hit) return task;
        closedTaskIds.push(task.id);
        const receipt = `强制处理回执：${note}`;
        if (task.createdByUserId) {
          s.notifications.unshift({
            id: uid("ntf"),
            userId: task.createdByUserId,
            title: "动物操作完成回执（强制处理）",
            titleEn: "Animal op completed (force handle)",
            message: `${actor} 通过强制处理完成了你派发的任务（${task.animalIds.join(",")}）：${note}`,
            messageEn: `${actor} force-completed your assigned task (${task.animalIds.join(",")}): ${note}`,
            read: false,
            link: "/animals/managed",
            kind: "animal_task_receipt",
            animalTaskId: task.id,
            handled: false,
            createdAt: now,
          });
        }
        return {
          ...task,
          status: "done" as const,
          completedAt: now,
          receiptNote: receipt,
        };
      });
    }
  });

  await appendAuditLog({
    userId: user.id,
    userName: actor,
    action: "force_handle",
    entityType: "managed_animal",
    entityId: animalIds.join(","),
    details: `强制处理 ${animalIds.join(",")}：${note}${
      closedTaskIds.length ? `；关闭任务 ${closedTaskIds.join(",")}` : ""
    }`,
  });

  return jsonOk({
    ok: true,
    animalIds,
    closedTaskIds,
    activities: getStore().animalDayActivities,
    tasks: getStore().animalOpTasks,
  });
}
