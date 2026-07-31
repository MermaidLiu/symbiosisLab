import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { getStore } from "@/server/store";

export type DailyLogEvent = {
  id: string;
  date: string;
  time: string;
  type: "notification" | "booking" | "activity";
  title: string;
  detail: string;
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inMonth(dateStr: string, year: number, month: number): boolean {
  if (!dateStr || dateStr.length < 7) return false;
  const [y, m] = dateStr.split("-").map(Number);
  return y === year && m === month;
}

/** GET /api/daily-log?year=2026&month=7 — personal daily diary for mini-program / mobile */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year") || now.getFullYear());
  const month = Number(url.searchParams.get("month") || now.getMonth() + 1);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return jsonError("invalid_query", 400);
  }

  const store = getStore();
  const myAnimalIds = new Set(
    store.managedAnimals
      .filter((a) => a.claimantUserId === user.id || a.technicianUserId === user.id)
      .map((a) => a.id)
  );

  const events: DailyLogEvent[] = [];

  for (const n of store.notifications || []) {
    if (n.userId !== user.id) continue;
    const date = dayKey(n.createdAt);
    if (!inMonth(date, year, month)) continue;
    events.push({
      id: n.id,
      date,
      time: n.createdAt,
      type: "notification",
      title: n.title || "通知",
      detail: n.message || "",
    });
  }

  for (const b of store.bookings || []) {
    if (b.userId !== user.id) continue;
    const date = dayKey(b.startTime);
    if (!inMonth(date, year, month)) continue;
    const inst = store.instruments.find((i) => i.id === b.resourceId);
    events.push({
      id: b.id,
      date,
      time: b.startTime,
      type: "booking",
      title: `预约 · ${inst?.name || b.resourceId}`,
      detail: `${b.purpose || ""}（${b.status}）`,
    });
  }

  for (const a of store.animalDayActivities || []) {
    const mine = a.userId === user.id || (a.animalId && myAnimalIds.has(a.animalId));
    if (!mine) continue;
    const date = a.date || dayKey(a.timestamp);
    if (!inMonth(date, year, month)) continue;
    events.push({
      id: a.id,
      date,
      time: a.timestamp,
      type: "activity",
      title: a.action || "动物动态",
      detail: a.details || (a.animalId ? `动物 ${a.animalId}` : ""),
    });
  }

  events.sort((x, y) => new Date(y.time).getTime() - new Date(x.time).getTime());

  const byDate: Record<string, DailyLogEvent[]> = {};
  for (const e of events) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }

  return jsonOk({
    year,
    month,
    markedDates: Object.keys(byDate).sort(),
    byDate,
    events,
  });
}
