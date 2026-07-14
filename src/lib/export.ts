import { Booking } from "@/types";

export function exportToCsv(filename: string, headers: string[], rows: string[][]): void {
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  rows.forEach((row) => {
    lines.push(row.map(escape).join(","));
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportBookingsToCsv(
  rows: Booking[],
  headers: string[],
  rowMapper: (b: Booking, index: number) => string[]
): void {
  exportToCsv(
    `bookings-${Date.now()}.csv`,
    headers,
    rows.map((b, i) => rowMapper(b, i))
  );
}
