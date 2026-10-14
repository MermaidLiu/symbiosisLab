import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { buildInstrumentFromRow } from "@/server/instrument-import";
import { canSuperviseInstruments } from "@/lib/roles";
import { parseCsvRecords } from "@/lib/csv";
import { Instrument } from "@/types";

/** Only instrument super admin may batch-import devices. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canSuperviseInstruments(user.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const csv = String(body.csv ?? "");
  if (!csv.trim()) return jsonError("invalid_body", 400);

  const rows = parseCsvRecords(csv);
  const created: Instrument[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const item = buildInstrumentFromRow(rows[i], {
        id: user.id,
        name: user.name,
        phone: user.phone,
      });
      if (!item) {
        errors.push(`row ${i + 2}: missing name`);
        continue;
      }
      // ensure unique id
      item.id = uid("inst");
      created.push(item);
    } catch (e) {
      errors.push(`row ${i + 2}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  if (created.length === 0) {
    return jsonError(errors[0] || "no_rows", 400);
  }

  await mutateStore((s) => {
    s.instruments.push(...created);
  });
  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "import",
    entityType: "instrument",
    details: `导入仪器 ${created.length} 台`,
  });

  return jsonOk({ created: created.length, errors, instruments: created });
}
