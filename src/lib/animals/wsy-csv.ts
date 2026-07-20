/** Parse Chinese calendar dates like 2023年12月27日 → ISO date string */
export function parseChineseDate(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}T00:00:00.000Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(s)) {
    const normalized = s.replace(" ", "T");
    const dt = new Date(normalized.length === 16 ? `${normalized}:00` : normalized);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  return undefined;
}

export type RecordingStatus = "living" | "dead" | "waiting" | "optotagging";

export function parseRecordingStatus(raw: unknown): RecordingStatus | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (s === "dead" || s === "死亡" || s.includes("dead")) return "dead";
  if (s === "living" || s === "存活" || s === "live") return "living";
  if (s === "waiting" || s === "等待" || s === "wait") return "waiting";
  if (s.startsWith("opto") || s.includes("光遗") || s.includes("optotag")) return "optotagging";
  return undefined;
}

export function recordingStatusToManaged(
  rs: RecordingStatus | undefined
): { status: "active" | "reserved" | "deceased"; ephysStatus?: "dead" } {
  if (rs === "dead") return { status: "deceased", ephysStatus: "dead" };
  if (rs === "waiting") return { status: "reserved" };
  return { status: "active" };
}

/** Standard import header (吴淑颖 Surgery & Recording format) */
export const WSY_CSV_HEADER =
  "Status,Name,Implantation Day,Tracking Days,Stages,Previous date,Repeat,Next date";

export const WSY_CSV_HEADER_ZH =
  "状态,编号,植入日期,追踪天数,阶段,上次日期,重复间隔,下次日期";
