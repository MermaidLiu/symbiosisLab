import fs from "fs";
import path from "path";
import { ManagedAnimal } from "@/types/animal-management";
import {
  parseChineseDate,
  parseRecordingStatus,
  recordingStatusToManaged,
} from "@/lib/animals/wsy-csv";

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

function loadWsyCsvText(): string {
  const candidates = [
    path.join(process.cwd(), "src/lib/mock/wsy-surgery-recording.csv"),
    path.join(process.cwd(), "docs/import-templates/小鼠批量导入模板.csv"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  }
  return "";
}

/** Build ManagedAnimal rows from 吴淑颖 Surgery & Recording CSV */
export function buildWsySurgeryMice(claimant: {
  id: string;
  name: string;
}): ManagedAnimal[] {
  const text = loadWsyCsvText();
  if (!text.trim()) return [];

  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const now = new Date().toISOString();
  const out: ManagedAnimal[] = [];

  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });

    const id = String(row.Name ?? "").trim();
    if (!id) continue;

    const recordingStatus = parseRecordingStatus(row.Status);
    const mapped = recordingStatusToManaged(recordingStatus);
    const implantAt = parseChineseDate(row["Implantation Day"]);
    const lastCollectionAt = parseChineseDate(row["Previous date"]);
    const nextCollectionAt = parseChineseDate(row["Next date"]);
    const stageRaw = String(row.Stages ?? "").trim();
    const repeatRaw = String(row.Repeat ?? "").trim();
    const repeatDays =
      repeatRaw && !Number.isNaN(Number(repeatRaw)) ? Number(repeatRaw) : undefined;
    const birthDate = implantAt?.slice(0, 10) ?? now.slice(0, 10);

    let lifecycleStatus: ManagedAnimal["lifecycleStatus"] = "entered";
    if (mapped.status === "deceased") lifecycleStatus = "euthanasia";
    else if (lastCollectionAt || nextCollectionAt) lifecycleStatus = "signal_recording";
    else if (implantAt) lifecycleStatus = "electrode_implant";

    out.push({
      id,
      gender: "female",
      strain: "未知",
      genotype: "未知",
      sireId: "—",
      sireGenotype: "—",
      damId: "—",
      damGenotype: "—",
      birthDate,
      ageWeeks: Math.max(
        0,
        Math.floor((Date.now() - new Date(birthDate).getTime()) / (7 * 24 * 3600 * 1000)) || 0
      ),
      cageLocation: "未分配",
      status: mapped.status,
      strainType: "public",
      generation: 1,
      weaningStatus: "weaned",
      genotypeStatus: "identified",
      purpose: "signal_processing",
      lifecycleStatus,
      claimantUserId: claimant.id,
      claimantName: claimant.name,
      ephysStatus: mapped.ephysStatus,
      cageEntryAt: implantAt || now,
      implantAt,
      lastCollectionAt,
      recordingStatus,
      trackingStage: stageRaw || undefined,
      repeatDays,
      nextCollectionAt,
      deathMethod: recordingStatus === "dead" ? "found_dead" : undefined,
    });
  }

  return out;
}
