import { AppNotification } from "@/types";
import { DbStore } from "@/server/store";

/** Derive task badges from the recipient's remaining work, including old notices. */
export function notificationState(n: AppNotification, store: DbStore): AppNotification {
  const task = n.animalTaskId ? store.animalOpTasks?.find(t => t.id === n.animalTaskId) : undefined;
  const op = n.operationId ? store.experimentOperations?.find(o => o.id === n.operationId) : undefined;
  let pending: boolean | undefined;
  const operationPending = (o: NonNullable<typeof op>) => {
    if (o.status === "closed" || o.status === "force_closed") return false;
    // Result receipts belong to the student; dispatch notices belong to the technician.
    if (n.link?.includes("task-handle")) return o.status === "open";
    if (o.studentUserId === n.userId) return o.status === "tech_submitted";
    return o.status === "open" || o.studentFileSeen === false;
  };
  if (n.kind === "experiment_operation" && op) pending = operationPending(op);
  else if (task && n.kind !== "animal_task_receipt") {
    pending = task.status === "scheduled";
    if (pending && n.kind === "experiment_operation") {
      const operations = task.animalIds.map(id => (store.experimentOperations ?? []).find(o =>
        o.animalId === id && o.technicianUserId === task.assigneeUserId && o.createdAt === task.createdAt));
      // Do not clear a batch while even one animal is still waiting for submission.
      if (operations.every(Boolean)) pending = operations.some(o => operationPending(o!));
    }
  } else if (n.kind === "booking_pending") {
    const booking = store.bookings.find(b => b.id === n.bookingId);
    if (booking) pending = booking.status === "pending";
  }
  return pending === undefined ? n : { ...n, read: !pending, handled: !pending };
}
