import { Instrument, InstrumentStepContact } from "@/types";
import {
  BOOKING_HOURS_CEILING,
  BOOKING_HOURS_FLOOR,
  clampBookingHours,
  defaultInstrumentContacts,
  normalizeInstrument,
} from "@/lib/instruments";
import { uid } from "@/server/store";

export function buildInstrumentFromRow(
  row: Record<string, string>,
  actor: { id: string; name: string; phone?: string }
): Instrument | null {
  const name = (row.name || row.nameZh || row["名称"] || "").trim();
  if (!name) return null;
  const now = new Date().toISOString();
  const phone = (row.contactPhone || row.phone || row["电话"] || actor.phone || "").trim();
  const hours = clampBookingHours(
    Number(row.minBookingHours || row.minHours || BOOKING_HOURS_FLOOR),
    Number(row.maxBookingHours || row.maxHours || BOOKING_HOURS_CEILING)
  );
  const statusRaw = (row.status || row["状态"] || "available").trim().toLowerCase();
  const status =
    statusRaw === "maintenance" || statusRaw === "维护中" || statusRaw === "维护"
      ? "maintenance"
      : statusRaw === "retired" || statusRaw === "退役"
        ? "retired"
        : "available";
  const contacts = defaultInstrumentContacts(
    (row.contactName || row["联系人"] || actor.name).trim(),
    phone,
    actor.id
  );
  const stepMap: { key: string; step: InstrumentStepContact["step"] }[] = [
    { key: "approval", step: "approval" },
    { key: "training", step: "training" },
    { key: "operations", step: "operations" },
    { key: "repair", step: "repair" },
  ];
  for (const { key, step } of stepMap) {
    const n = (row[`${key}Name`] || row[`${key}_name`] || "").trim();
    const p = (row[`${key}Phone`] || row[`${key}_phone`] || "").trim();
    if (n || p) {
      const idx = contacts.findIndex((c) => c.step === step);
      if (idx >= 0) {
        contacts[idx] = {
          ...contacts[idx],
          name: n || contacts[idx].name,
          phone: p || contacts[idx].phone,
        };
      }
    }
  }
  const trainingRaw = (row.trainingRequired || row["需培训"] || "").trim().toLowerCase();
  const trainingRequired =
    trainingRaw === "1" ||
    trainingRaw === "true" ||
    trainingRaw === "yes" ||
    trainingRaw === "是" ||
    trainingRaw === "需培训";

  return normalizeInstrument({
    id: uid("inst"),
    name,
    nameEn: (row.nameEn || row["英文名"] || name).trim(),
    model: (row.model || row["型号"] || "").trim(),
    location: (row.location || row["位置"] || "").trim(),
    description: (row.description || row["描述"] || "").trim(),
    descriptionEn: (row.descriptionEn || row.description || "").trim(),
    status,
    contactUserId: actor.id,
    contactPhone: phone,
    contacts,
    tags: (row.tags || row["标签"] || "")
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean),
    specs: [],
    accessories: [],
    trainingRequired,
    minBookingHours: hours.min,
    maxBookingHours: hours.max,
    maintenanceUntil:
      status === "maintenance"
        ? (row.maintenanceUntil || row["预计修好"] || "").trim() || undefined
        : undefined,
    maintenanceNote:
      status === "maintenance"
        ? (row.maintenanceNote || row["维护说明"] || "").trim() || undefined
        : undefined,
    createdAt: now,
    updatedAt: now,
  });
}
