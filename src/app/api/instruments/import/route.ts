import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { buildInstrumentFromRow } from "@/server/instrument-import";
import { Instrument } from "@/types";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!requireRole(user, "instrument_manager")) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const csv = String(body.csv ?? "");
  if (!csv.trim()) return jsonError("invalid_body", 400);

  const rows = parseCsv(csv);
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
