/**
 * Re-parse 仪器信息统计 CSV with multiline-safe parser; map 仪器名称 → 名称 only, 英文名留空.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const inputPath = path.join(
  root,
  "docs/import-templates/仪器信息统计-20260628-导入.csv"
);

function parseCsvMatrix(text) {
  const s = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      /* skip */
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

function escapeCsvField(value) {
  const v = String(value ?? "");
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function flatten(v) {
  return String(v ?? "")
    .replace(/\r\n/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const raw = fs.readFileSync(inputPath, "utf8");
const matrix = parseCsvMatrix(raw);
const headers = matrix[0].map((h) => h.trim());
const nameIdx = headers.indexOf("名称");
if (nameIdx < 0) {
  console.error("Missing 名称 column");
  process.exit(1);
}

const outHeaders = headers.includes("name") ? [...headers] : ["name", ...headers];
const outRows = [];

for (const cols of matrix.slice(1)) {
  const row = {};
  headers.forEach((h, i) => {
    row[h] = flatten(cols[i] ?? "");
  });
  const instrumentName = row["名称"];
  if (!instrumentName) continue;
  row["名称"] = instrumentName;
  row["name"] = instrumentName;
  row["英文名"] = "";
  row["nameEn"] = "";
  outRows.push(row);
}

const lines = [outHeaders.join(",")];
for (const row of outRows) {
  lines.push(outHeaders.map((h) => escapeCsvField(row[h] ?? "")).join(","));
}
fs.writeFileSync(inputPath, lines.join("\n") + "\n", "utf8");
console.log(`Fixed ${outRows.length} rows → ${inputPath}`);
