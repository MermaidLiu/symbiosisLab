/** ISO week key: 2026-W31 (client-safe, no Node deps) */
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function shiftWeekKey(weekKey: string, delta: number): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return isoWeekKey();
  const year = Number(m[1]);
  const week = Number(m[2]);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  simple.setUTCDate(simple.getUTCDate() + 4 - day);
  simple.setUTCDate(simple.getUTCDate() + delta * 7);
  return isoWeekKey(new Date(simple.getUTCFullYear(), simple.getUTCMonth(), simple.getUTCDate()));
}
