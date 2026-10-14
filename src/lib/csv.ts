/** RFC 4180-style CSV parse (supports quoted fields with embedded newlines). */

function parseCsvMatrix(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // skip
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.length > 0)) rows.push(row);

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function parseCsvRecords(text: string): Record<string, string>[] {
  const matrix = parseCsvMatrix(text);
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => h.trim());
  return matrix.slice(1).map((cols) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function recordsToCsv(headers: string[], rows: Record<string, string>[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}
