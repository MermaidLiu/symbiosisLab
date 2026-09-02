import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { canManageUsers } from "@/lib/roles";
import { isValidCnMobile, normalizePhone } from "@/server/sms";
import { normalizePersonName, normalizeRosterPhone } from "@/lib/research-group-roster";
import { ResearchGroupRosterEntry } from "@/types";
import { displayName } from "@/lib/users";

function listRoster() {
  return [...(getStore().researchGroupRoster ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "zh")
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageUsers(user.roles)) return jsonError("forbidden", 403);
  return jsonOk({ roster: listRoster() });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canManageUsers(user.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "upsert").trim();

  if (action === "bulk_upsert") {
    const rows = Array.isArray(body.entries) ? body.entries : [];
    if (rows.length === 0) return jsonError("invalid_body", 400);
    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;
    let skipped = 0;

    await mutateStore((s) => {
      if (!Array.isArray(s.researchGroupRoster)) s.researchGroupRoster = [];
      for (const row of rows) {
        const name = String(row?.name ?? "").trim();
        const phone = normalizeRosterPhone(String(row?.phone ?? ""));
        const groupName = String(row?.groupName ?? "").trim() || undefined;
        const note = String(row?.note ?? "").trim() || undefined;
        if (!name || !isValidCnMobile(phone)) {
          skipped += 1;
          continue;
        }
        const existing = s.researchGroupRoster.find((e) => normalizePhone(e.phone) === phone);
        if (existing) {
          existing.name = name;
          existing.groupName = groupName ?? existing.groupName;
          existing.note = note ?? existing.note;
          existing.updatedAt = now;
          updated += 1;
        } else {
          s.researchGroupRoster.push({
            id: uid("roster"),
            name,
            phone,
            groupName,
            note,
            createdAt: now,
            updatedAt: now,
            createdByUserId: user.id,
            createdByName: displayName(user),
          });
          added += 1;
        }
      }
    });

    await appendAuditLog({
      userId: user.id,
      userName: displayName(user),
      action: "roster_bulk_upsert",
      entityType: "research_group_roster",
      details: `批量导入名单 +${added} ~${updated} skip=${skipped}`,
    });

    return jsonOk({ roster: listRoster(), added, updated, skipped });
  }

  if (action === "delete") {
    const id = String(body.id ?? "").trim();
    if (!id) return jsonError("invalid_body", 400);
    let removed: ResearchGroupRosterEntry | null = null;
    await mutateStore((s) => {
      const before = s.researchGroupRoster ?? [];
      const hit = before.find((e) => e.id === id);
      if (!hit) return;
      removed = hit;
      s.researchGroupRoster = before.filter((e) => e.id !== id);
    });
    if (!removed) return jsonError("not_found", 404);
    await appendAuditLog({
      userId: user.id,
      userName: displayName(user),
      action: "roster_delete",
      entityType: "research_group_roster",
      entityId: id,
      details: `删除名单 ${(removed as ResearchGroupRosterEntry).name} ${(removed as ResearchGroupRosterEntry).phone}`,
    });
    return jsonOk({ roster: listRoster() });
  }

  // upsert single
  const name = String(body.name ?? "").trim();
  const phone = normalizeRosterPhone(String(body.phone ?? ""));
  const groupName = String(body.groupName ?? "").trim() || undefined;
  const note = String(body.note ?? "").trim() || undefined;
  const id = body.id ? String(body.id).trim() : "";

  if (!name || !isValidCnMobile(phone)) return jsonError("invalid_body", 400);

  const now = new Date().toISOString();
  let entry: ResearchGroupRosterEntry | undefined;
  let phoneConflict = false;

  await mutateStore((s) => {
    if (!Array.isArray(s.researchGroupRoster)) s.researchGroupRoster = [];
    const byId = id ? s.researchGroupRoster.find((e) => e.id === id) : undefined;
    const byPhone = s.researchGroupRoster.find((e) => normalizePhone(e.phone) === phone);

    if (byId) {
      if (byPhone && byPhone.id !== byId.id) {
        phoneConflict = true;
        return;
      }
      byId.name = name;
      byId.phone = phone;
      byId.groupName = groupName;
      byId.note = note;
      byId.updatedAt = now;
      entry = { ...byId };
      return;
    }

    if (byPhone) {
      byPhone.name = name;
      byPhone.groupName = groupName;
      byPhone.note = note;
      byPhone.updatedAt = now;
      entry = { ...byPhone };
      return;
    }

    const created: ResearchGroupRosterEntry = {
      id: uid("roster"),
      name,
      phone,
      groupName,
      note,
      createdAt: now,
      updatedAt: now,
      createdByUserId: user.id,
      createdByName: displayName(user),
    };
    s.researchGroupRoster.push(created);
    entry = created;
  });

  if (phoneConflict) return jsonError("phone_exists", 409);
  if (!entry) return jsonError("save_failed", 400);

  await appendAuditLog({
    userId: user.id,
    userName: displayName(user),
    action: "roster_upsert",
    entityType: "research_group_roster",
    entityId: entry.id,
    details: `录入/更新名单 ${normalizePersonName(name)} ${phone}`,
  });

  return jsonOk({ entry, roster: listRoster() });
}
