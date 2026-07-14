import { getStore, mutateStore, uid } from "@/server/store";
import { AuditLog } from "@/types";

export async function appendAuditLog(input: {
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  details: string;
  entityId?: string;
}): Promise<AuditLog> {
  const log: AuditLog = {
    id: uid("log"),
    userId: input.userId,
    userName: input.userName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    details: input.details,
    timestamp: new Date().toISOString(),
  };
  await mutateStore((s) => {
    s.logs = [log, ...s.logs].slice(0, 500);
  });
  return log;
}

export function listLogs() {
  return getStore().logs;
}
