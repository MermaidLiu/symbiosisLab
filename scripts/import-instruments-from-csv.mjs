/**
 * 一次性本地导入：把 CSV 写入 data/db.json，无需部署新代码。
 * 用法：node scripts/import-instruments-from-csv.mjs [csv路径]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const defaultCsv = path.join(
  root,
  "docs/import-templates/仪器信息统计-20260628-导入.csv"
);
const dbPath = path.join(root, "data/db.json");

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const matrix = parseCsvMatrix(text);
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => h.trim());
  return matrix.slice(1).map((cols) => {
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

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

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampHours(min, max) {
  const lo = Math.max(0.5, Math.min(24, Number(min) || 0.5));
  const hi = Math.max(lo, Math.min(24, Number(max) || 8));
  return { min: lo, max: hi };
}

function buildInstrument(row, actor) {
  const name = (row.name || row["名称"] || "").trim();
  if (!name) return null;
  const now = new Date().toISOString();
  const phone = (row.contactPhone || row["电话"] || actor.phone || "00000000000").trim();
  const hours = clampHours(row["最短时长"] || row.minBookingHours, row["最长时长"] || row.maxBookingHours);
  const statusRaw = (row.status || row["状态"] || "available").trim();
  const status =
    statusRaw === "maintenance" || statusRaw === "维护中" || statusRaw === "维护"
      ? "maintenance"
      : statusRaw === "retired" || statusRaw === "退役"
        ? "retired"
        : "available";
  const owner = (row["联系人"] || row.contactName || actor.name).trim();
  const trainingRaw = (row["需培训"] || row.trainingRequired || "").trim();
  const trainingRequired = ["1", "true", "yes", "是", "需培训"].includes(trainingRaw.toLowerCase());

  const contacts = [
    { step: "approval", name: row.approvalName || owner, phone: row.approvalPhone || phone },
    { step: "training", name: row.trainingName || owner, phone: row.trainingPhone || phone },
    { step: "operations", name: row.operationsName || owner, phone: row.operationsPhone || phone },
    { step: "repair", name: row.repairName || owner, phone: row.repairPhone || phone },
  ];

  return {
    id: uid("inst"),
    name,
    nameEn: (row["英文名"] || row.nameEn || "").trim(),
    model: (row["型号"] || row.model || "").trim(),
    location: (row["位置"] || row.location || "").trim(),
    description: (row["描述"] || row.description || "").trim(),
    descriptionEn: (row.descriptionEn || row["描述"] || "").trim(),
    status,
    contactUserId: actor.id,
    contactPhone: phone,
    contacts,
    tags: (row["标签"] || row.tags || "")
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean),
    specs: [],
    accessories: [],
    trainingRequired,
    minBookingHours: hours.min,
    maxBookingHours: hours.max,
    maintenanceNote:
      status === "maintenance" ? (row["维护说明"] || row.maintenanceNote || "").trim() || undefined : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultCsv;
if (!fs.existsSync(csvPath)) {
  console.error("CSV not found:", csvPath);
  process.exit(1);
}
if (!fs.existsSync(dbPath)) {
  console.error("data/db.json not found — start the app once or copy db from server.");
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, "utf8");
const rows = parseCsv(csv);
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const actor =
  db.users.find((u) => u.email === "admin@lab.edu.cn") ||
  db.users.find((u) => u.roles?.includes("instrument_super_admin")) ||
  db.users.find((u) => u.email === "instrument@lab.edu.cn") ||
  db.users[0];

if (!Array.isArray(db.instruments)) db.instruments = [];
const existingNames = new Set(db.instruments.map((i) => i.name.trim()));

let created = 0;
let skipped = 0;
for (const row of rows) {
  const item = buildInstrument(row, { id: actor.id, name: actor.name, phone: actor.phone });
  if (!item) continue;
  if (existingNames.has(item.name)) {
    skipped++;
    continue;
  }
  db.instruments.push(item);
  existingNames.add(item.name);
  created++;
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`Done. Added ${created} instruments, skipped ${skipped} duplicates. Total: ${db.instruments.length}`);
