/**
 * Client-side audit logging is handled by the API.
 * Kept as a no-op shim so legacy imports still type-check.
 */
import { AuditLog } from "@/types";

export function recordLog(
  _userId: string,
  _userName: string,
  _action: string,
  _entityType: string,
  _details: string,
  _entityId?: string
): AuditLog {
  return {
    id: `log-local-${Date.now()}`,
    userId: _userId,
    userName: _userName,
    action: _action,
    entityType: _entityType,
    entityId: _entityId,
    details: _details,
    timestamp: new Date().toISOString(),
  };
}
