/** ISO week number (1–53) for a given date */
export function getISOWeekNum(date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Lab "students": plain users without manager/RA/admin roles */
export function isLabStudent(roles: string[]): boolean {
  return (
    roles.includes("user") &&
    !roles.includes("super_admin") &&
    !roles.includes("instrument_manager") &&
    !roles.includes("animal_manager") &&
    !roles.includes("research_assistant")
  );
}
