"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Booking } from "@/types";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getUsers } from "@/lib/storage/db";

export type SlotInterval = 15 | 30 | 60;

interface WeekCalendarProps {
  bookings: Booking[];
  onSelectSlot: (start: Date, end: Date) => void;
  selectedSlot?: { start: Date; end: Date } | null;
  currentUserId?: string;
}

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function slotToDate(day: Date, slotIndex: number, interval: SlotInterval): Date {
  const d = new Date(day);
  d.setHours(DAY_START_HOUR, 0, 0, 0);
  d.setMinutes(d.getMinutes() + slotIndex * interval);
  return d;
}

function slotsPerDay(interval: SlotInterval): number {
  return ((DAY_END_HOUR - DAY_START_HOUR) * 60) / interval;
}

function formatSlotLabel(slotIndex: number, interval: SlotInterval): string {
  const totalMinutes = DAY_START_HOUR * 60 + slotIndex * interval;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (interval === 60) return `${String(h).padStart(2, "0")}:00`;
  if (m === 0) return `${String(h).padStart(2, "0")}:00`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function WeekCalendar({ bookings, onSelectSlot, selectedSlot, currentUserId }: WeekCalendarProps) {
  const { locale, t } = useLocale();
  const users = getUsers();
  // getUsers() reads hydrated API cache; refresh when bookings change so names stay current
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const userMap = useMemo(() => users, [bookings.length, selectedSlot?.start?.getTime()]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [interval, setInterval] = useState<SlotInterval>(60);
  const [dragDay, setDragDay] = useState<Date | null>(null);
  const [dragStartSlot, setDragStartSlot] = useState<number | null>(null);
  const [dragEndSlot, setDragEndSlot] = useState<number | null>(null);
  const dragging = useRef(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";
  const totalSlots = slotsPerDay(interval);

  const activeBookings = useMemo(
    () => bookings.filter((b) => b.status !== "cancelled" && b.status !== "rejected"),
    [bookings]
  );

  const slotIndices = useMemo(() => Array.from({ length: totalSlots }, (_, i) => i), [totalSlots]);

  function getSlotBooking(day: Date, slotIndex: number): Booking | undefined {
    const start = slotToDate(day, slotIndex, interval);
    const end = slotToDate(day, slotIndex + 1, interval);
    return activeBookings.find(
      (b) => new Date(b.startTime) < end && new Date(b.endTime) > start
    );
  }

  function isSlotBooked(day: Date, slotIndex: number): boolean {
    return !!getSlotBooking(day, slotIndex);
  }

  function slotBookerName(booking: Booking): string {
    return userMap.find((u) => u.id === booking.userId)?.name ?? booking.userId;
  }

  function slotTitle(day: Date, slotIndex: number): string | undefined {
    const booking = getSlotBooking(day, slotIndex);
    if (!booking) return undefined;
    const name = slotBookerName(booking);
    if (currentUserId && booking.userId === currentUserId) {
      return t.instruments.bookedBySelf;
    }
    return t.instruments.bookedByOther.replace("{name}", name);
  }

  function rangeHasBooked(day: Date, s1: number, s2: number): boolean {
    const min = Math.min(s1, s2);
    const max = Math.max(s1, s2);
    for (let i = min; i <= max; i++) {
      if (isSlotBooked(day, i)) return true;
    }
    return false;
  }

  function isInDragRange(day: Date, slotIndex: number): boolean {
    if (!dragDay || dragStartSlot === null || dragEndSlot === null) return false;
    if (!sameDay(day, dragDay)) return false;
    const min = Math.min(dragStartSlot, dragEndSlot);
    const max = Math.max(dragStartSlot, dragEndSlot);
    return slotIndex >= min && slotIndex <= max;
  }

  function isInConfirmedSelection(day: Date, slotIndex: number): boolean {
    if (!selectedSlot) return false;
    const slotStart = slotToDate(day, slotIndex, interval);
    const slotEnd = slotToDate(day, slotIndex + 1, interval);
    return (
      sameDay(day, selectedSlot.start) &&
      slotStart.getTime() < selectedSlot.end.getTime() &&
      slotEnd.getTime() > selectedSlot.start.getTime()
    );
  }

  const finishDrag = useCallback(() => {
    if (!dragging.current || !dragDay || dragStartSlot === null || dragEndSlot === null) {
      dragging.current = false;
      setDragDay(null);
      setDragStartSlot(null);
      setDragEndSlot(null);
      return;
    }

    const day = dragDay;
    const minS = Math.min(dragStartSlot, dragEndSlot);
    const maxS = Math.max(dragStartSlot, dragEndSlot);

    if (!rangeHasBooked(day, minS, maxS)) {
      const start = slotToDate(day, minS, interval);
      const end = slotToDate(day, maxS + 1, interval);
      onSelectSlot(start, end);
    }

    dragging.current = false;
    setDragDay(null);
    setDragStartSlot(null);
    setDragEndSlot(null);
  }, [dragDay, dragStartSlot, dragEndSlot, interval, onSelectSlot, activeBookings]);

  useEffect(() => {
    const onUp = () => {
      if (dragging.current) finishDrag();
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [finishDrag]);

  function handleMouseDown(day: Date, slotIndex: number) {
    if (isSlotBooked(day, slotIndex)) return;
    dragging.current = true;
    setDragDay(day);
    setDragStartSlot(slotIndex);
    setDragEndSlot(slotIndex);
  }

  function handleMouseEnter(day: Date, slotIndex: number) {
    if (!dragging.current || !dragDay || !sameDay(day, dragDay)) return;
    if (isSlotBooked(day, slotIndex)) return;
    if (dragStartSlot !== null && rangeHasBooked(dragDay, dragStartSlot, slotIndex)) return;
    setDragEndSlot(slotIndex);
  }

  const rowHeight = interval === 15 ? "min-h-[14px]" : interval === 30 ? "min-h-[22px]" : "min-h-[36px]";

  return (
    <div className="select-none overflow-x-auto">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded px-2 py-1 text-sm text-thu hover:bg-thu-muted">
            ←
          </button>
          <span className="text-sm font-medium text-lab-text">
            {weekStart.toLocaleDateString(localeStr, { month: "long", year: "numeric" })}
          </span>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded px-2 py-1 text-sm text-thu hover:bg-thu-muted">
            →
          </button>
        </div>
        <div className="flex rounded-lg border border-lab-border bg-white/60 p-0.5 text-xs">
          {([15, 30, 60] as SlotInterval[]).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={clsx(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                interval === iv ? "bg-thu-dark text-white shadow-sm" : "text-lab-muted hover:text-thu"
              )}
            >
              {iv === 15 ? t.instruments.interval15 : iv === 30 ? t.instruments.interval30 : t.instruments.interval60}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-[640px] grid grid-cols-8 gap-px overflow-hidden rounded-lg border border-lab-border bg-lab-border">
        <div className="bg-thu-muted p-2 text-[10px] font-medium text-thu" />
        {days.map((day) => (
          <div key={day.toISOString()} className="bg-thu-muted p-2 text-center">
            <p className="text-[10px] text-lab-muted">{day.toLocaleDateString(localeStr, { weekday: "short" })}</p>
            <p className="text-xs font-semibold text-thu">{day.getDate()}</p>
          </div>
        ))}

        {slotIndices.map((slotIndex) => {
          const showLabel = interval === 60 || slotIndex % (60 / interval) === 0;
          return (
            <div key={`row-${slotIndex}`} className="contents">
              <div className={clsx("bg-white p-1 text-[9px] text-lab-muted", rowHeight, "flex items-center")}>
                {showLabel ? formatSlotLabel(slotIndex, interval) : ""}
              </div>
              {days.map((day) => {
                const booking = getSlotBooking(day, slotIndex);
                const booked = !!booking;
                const bookedByOther = booked && booking.userId !== currentUserId;
                const bookedBySelf = booked && currentUserId && booking.userId === currentUserId;
                const draggingSel = isInDragRange(day, slotIndex);
                const confirmed = isInConfirmedSelection(day, slotIndex);
                return (
                  <div
                    key={`${day.toISOString()}-${slotIndex}`}
                    role="button"
                    aria-disabled={booked}
                    tabIndex={booked ? -1 : 0}
                    title={slotTitle(day, slotIndex)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleMouseDown(day, slotIndex);
                    }}
                    onMouseEnter={() => handleMouseEnter(day, slotIndex)}
                    className={clsx(
                      rowHeight,
                      "transition-colors",
                      booked && "cursor-not-allowed",
                      bookedByOther && "bg-thu-subtle ring-1 ring-inset ring-thu-light/25",
                      bookedBySelf && "bg-thu-muted ring-1 ring-inset ring-thu-light/40",
                      booked && !bookedByOther && !bookedBySelf && "bg-thu-subtle ring-1 ring-inset ring-thu-light/25",
                      !booked && "cursor-crosshair",
                      !booked && (draggingSel || confirmed) && "bg-thu-dark text-white ring-1 ring-inset ring-[#4a0654]",
                      !booked && !draggingSel && !confirmed && "bg-white hover:bg-thu-muted/40"
                    )}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
