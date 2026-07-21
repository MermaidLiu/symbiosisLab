function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function trackingDays(collectionAt, lastCollectionAt, implantAt) {
  const start = collectionAt || lastCollectionAt || implantAt;
  if (!start) return null;
  const t = new Date(start).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function trackingStageFromDays(days) {
  if (days === null || !Number.isFinite(days) || days < 0) return "—";
  if (days < 30) return "1M";
  const months = Math.floor(days / 30);
  if (months < 12) return `${Math.max(1, months)}M`;
  return `${Math.max(1, Math.floor(months / 12))}Y`;
}

const JELLY = {
  mint: { bg: "#C8F7E0", fg: "#1B7A5A" },
  peach: { bg: "#FFE0C8", fg: "#C45C26" },
  lavender: { bg: "#EDE0FF", fg: "#6B3FA0" },
  sky: { bg: "#D0EEFF", fg: "#1A6B8A" },
  lemon: { bg: "#FFF6C2", fg: "#8A7A12" },
  rose: { bg: "#FFD6E0", fg: "#B83B5E" },
  grape: { bg: "#E2D4FF", fg: "#5B3A9E" },
};

const DEFAULT_BY_RECORDING = {
  living: "mint",
  dead: "rose",
  waiting: "lemon",
  optotagging: "lavender",
};

function resolveStatusColor(statusColor, recordingStatus) {
  if (statusColor && JELLY[statusColor]) return statusColor;
  if (recordingStatus && DEFAULT_BY_RECORDING[recordingStatus]) {
    return DEFAULT_BY_RECORDING[recordingStatus];
  }
  return "sky";
}

const RECORDING_LABEL = {
  living: "存活",
  dead: "死亡",
  waiting: "等待",
  optotagging: "光标",
};

function statusLabel(row) {
  if (row.statusLabel && String(row.statusLabel).trim()) return String(row.statusLabel).trim();
  if (row.recordingStatus && RECORDING_LABEL[row.recordingStatus]) {
    return RECORDING_LABEL[row.recordingStatus];
  }
  return row.recordingStatus || "—";
}

function displayName(user) {
  if (!user) return "";
  return (user.nickname && user.nickname.trim()) || user.name || user.email || "";
}

module.exports = {
  formatDateTime,
  formatDate,
  trackingDays,
  trackingStageFromDays,
  JELLY,
  resolveStatusColor,
  statusLabel,
  displayName,
  JELLY_KEYS: Object.keys(JELLY),
};
