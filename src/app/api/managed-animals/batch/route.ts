import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore, mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import { canSuperviseAnimalFacility, canManageAnimals } from "@/lib/roles";
import {
  AnimalPurpose,
  ANIMAL_PURPOSES,
  ManagedAnimal,
} from "@/types/animal-management";
import { buildFacilityCageCells } from "@/lib/animals/facility-board";
import { displayName, findUserByKey } from "@/lib/users";

/**
 * POST /api/managed-animals/batch
 * body: { rows: Array<partial animal fields> } or { csv: string }
 * Any logged-in user may upload; non-staff auto-claim unassigned non-blank mice.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  const isStaff = canSuperviseAnimalFacility(user.roles) || canManageAnimals(user.roles);

  const body = await req.json().catch(() => ({}));
  let rows: Record<string, string>[] = [];

  if (typeof body.csv === "string" && body.csv.trim()) {
    rows = parseCsv(body.csv);
  } else if (Array.isArray(body.rows)) {
    rows = body.rows as Record<string, string>[];
  }
  if (!rows.length) return jsonError("invalid_body", 400);

  const created: ManagedAnimal[] = [];
  const errors: string[] = [];
  const now = new Date().toISOString();

  await mutateStore((s) => {
    for (const [i, row] of rows.entries()) {
      const id = String(row.id ?? row.ID ?? "").trim();
      if (!id) {
        errors.push(`行 ${i + 1}: 缺少 ID`);
        continue;
      }
      if (s.managedAnimals.some((a) => a.id === id) || created.some((a) => a.id === id)) {
        errors.push(`行 ${i + 1}: ID ${id} 已存在`);
        continue;
      }

      const genderRaw = String(row.gender ?? row.性别 ?? "male").toLowerCase();
      const gender = genderRaw.includes("f") || genderRaw.includes("雌") ? "female" : "male";
      const strain = String(row.strain ?? row.品系 ?? "").trim() || "未知";
      const purposeRaw = String(row.purpose ?? row.用途 ?? "blank").trim().toLowerCase();
      let purpose: AnimalPurpose = "blank";
      if (purposeRaw.includes("signal") || purposeRaw.includes("信号")) purpose = "signal_processing";
      else if (purposeRaw.includes("immun") || purposeRaw.includes("免疫")) purpose = "immunity";
      else if (purposeRaw.includes("breed") || purposeRaw.includes("繁殖")) purpose = "breeding";
      else if (ANIMAL_PURPOSES.includes(purposeRaw as AnimalPurpose)) {
        purpose = purposeRaw as AnimalPurpose;
      }

      const cageKey = String(row.cageId ?? row.cage ?? row.笼位 ?? "").trim();
      let cageId: string | undefined;
      let cageLocation = "未分配";
      if (cageKey && cageKey !== "未分配" && cageKey.toLowerCase() !== "unassigned") {
        const cage =
          s.cages.find((c) => c.id === cageKey) ||
          s.cages.find((c) => c.number === cageKey) ||
          s.cages.find((c) => `${c.rack}/${c.number}` === cageKey.replace(/\s/g, ""));
        if (cage) {
          cageId = cage.id;
          cageLocation = `${cage.rack} / ${cage.number}`;
        } else {
          cageLocation = cageKey;
        }
      }

      const claimantKey = String(row.claimant ?? row.申领人 ?? "").trim();
      let claimantUserId: string | undefined;
      let claimantName: string | undefined;
      const claimantEmpty =
        !claimantKey ||
        claimantKey === "未分配" ||
        claimantKey.toLowerCase() === "unassigned";
      if (!claimantEmpty) {
        const u = findUserByKey(s.users, claimantKey);
        if (u) {
          claimantUserId = u.id;
          claimantName = displayName(u);
        } else {
          claimantName = claimantKey;
        }
      } else if (!isStaff && purpose !== "blank") {
        claimantUserId = user.id;
        claimantName = displayName(user);
      }

      const techKey = String(row.technician ?? row.技术员 ?? "").trim();
      let technicianUserId: string | undefined;
      let technicianName: string | undefined;
      if (
        techKey &&
        techKey !== "未分配" &&
        techKey.toLowerCase() !== "unassigned"
      ) {
        const u = findUserByKey(s.users, techKey);
        if (u) {
          technicianUserId = u.id;
          technicianName = displayName(u);
        } else {
          technicianName = techKey;
        }
      }

      const birthDate = String(row.birthDate ?? row.出生日期 ?? now.slice(0, 10)).trim();
      const implantAt = parseOptionalTime(
        row.implantAt ?? row.植入时间 ?? row.植入日期
      );
      const collectionAt = parseOptionalTime(
        row.collectionAt ?? row.采集时间 ?? row.采集日期
      );
      const lastCollectionAt = parseOptionalTime(
        row.lastCollectionAt ?? row.上次采集时间 ?? row.上次采集日期 ?? row.lastCollection
      );
      const cageEntryAt =
        parseOptionalTime(row.cageEntryAt ?? row.进笼时间 ?? row.进笼日期) || now;

      let lifecycleStatus: ManagedAnimal["lifecycleStatus"] = "entered";
      if (collectionAt || lastCollectionAt) lifecycleStatus = "signal_recording";
      else if (implantAt) lifecycleStatus = "electrode_implant";

      const animal: ManagedAnimal = {
        id,
        gender,
        strain,
        genotype: String(row.genotype ?? row.基因型 ?? "未知").trim() || "未知",
        sireId: "—",
        sireGenotype: "—",
        damId: "—",
        damGenotype: "—",
        birthDate,
        ageWeeks: Math.max(
          0,
          Math.floor((Date.now() - new Date(birthDate).getTime()) / (7 * 24 * 3600 * 1000)) || 0
        ),
        cageLocation,
        cageId,
        status: "active",
        strainType: "public",
        generation: 1,
        weaningStatus: "weaned",
        genotypeStatus: "identified",
        purpose,
        lifecycleStatus,
        claimantUserId,
        claimantName,
        technicianUserId,
        technicianName,
        cageEntryAt,
        implantAt,
        collectionAt,
        lastCollectionAt,
      };
      created.push(animal);
    }

    if (created.length) {
      s.managedAnimals = [...created, ...s.managedAnimals];
      // refresh occupied counts lightly
      for (const cage of s.cages) {
        cage.occupied = s.managedAnimals.filter((m) => m.cageId === cage.id).length;
      }
      s.animalDayActivities = [
        {
          id: uid("act"),
          date: now.slice(0, 10),
          timestamp: now,
          action: "batch_upload",
          details: `${user.name} 批量上传 ${created.length} 只小鼠`,
          userId: user.id,
          userName: user.name,
        },
        ...(s.animalDayActivities ?? []),
      ];
    }
  });

  if (created.length) {
    await appendAuditLog({
      userId: user.id,
      userName: user.name,
      action: "batch_create",
      entityType: "managed_animal",
      details: `批量上传 ${created.length} 只小鼠`,
    });
  }

  return jsonOk({
    created: created.length,
    errors,
    managedAnimals: getStore().managedAnimals,
    cells: buildFacilityCageCells(getStore().cages, getStore().managedAnimals),
    activities: getStore().animalDayActivities,
  }, { status: created.length ? 201 : 400 });
}

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
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Accept ISO, YYYY-MM-DD, or YYYY-MM-DD HH:mm — empty → undefined */
function parseOptionalTime(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  // date only → start of day UTC-ish ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00.000Z`;
  }
  // datetime without T
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(s)) {
    const normalized = s.replace(" ", "T");
    const d = new Date(normalized.length === 16 ? `${normalized}:00` : normalized);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return undefined;
}
