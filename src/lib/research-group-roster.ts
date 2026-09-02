import { AppliedBusinessRole, ResearchGroupRosterEntry } from "@/types";

/** 手机号归一：仅保留数字，去掉 +86 */
export function normalizeRosterPhone(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  if (digits.length === 13 && digits.startsWith("86")) return digits.slice(2);
  return digits;
}

/** 姓名比对：去空白、全角空格，小写（英文名） */
export function normalizePersonName(raw: string): string {
  return String(raw ?? "")
    .replace(/[\s\u3000]+/g, "")
    .trim()
    .toLowerCase();
}

export function requiresRosterMatch(appliedRole: AppliedBusinessRole): boolean {
  return appliedRole === "student" || appliedRole === "technician";
}

export function findRosterEntry(
  roster: ResearchGroupRosterEntry[] | undefined | null,
  name: string,
  phoneRaw: string
): ResearchGroupRosterEntry | undefined {
  const phone = normalizeRosterPhone(phoneRaw);
  const nameKey = normalizePersonName(name);
  if (!phone || !nameKey) return undefined;
  return (roster ?? []).find(
    (e) => normalizeRosterPhone(e.phone) === phone && normalizePersonName(e.name) === nameKey
  );
}

export function isOnRoster(
  roster: ResearchGroupRosterEntry[] | undefined | null,
  name: string,
  phoneRaw: string
): boolean {
  return Boolean(findRosterEntry(roster, name, phoneRaw));
}

export function phoneOnRoster(
  roster: ResearchGroupRosterEntry[] | undefined | null,
  phoneRaw: string
): boolean {
  const phone = normalizeRosterPhone(phoneRaw);
  if (!phone) return false;
  return (roster ?? []).some((e) => normalizeRosterPhone(e.phone) === phone);
}
