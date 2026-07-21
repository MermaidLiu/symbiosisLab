import { StatusJellyColor, STATUS_JELLY_COLORS } from "@/types/animal-management";

/** Inline styles so colors work without relying on Tailwind content scanning of this file */
export const JELLY_TIP_STYLE: Record<
  StatusJellyColor,
  { backgroundColor: string; color: string; boxShadow: string }
> = {
  mint: {
    backgroundColor: "#C8F7E0",
    color: "#1B7A5A",
    boxShadow: "inset 0 0 0 1px #7DDBB0",
  },
  peach: {
    backgroundColor: "#FFE0C8",
    color: "#C45C26",
    boxShadow: "inset 0 0 0 1px #FFB088",
  },
  lavender: {
    backgroundColor: "#EDE0FF",
    color: "#6B3FA0",
    boxShadow: "inset 0 0 0 1px #C9A8F5",
  },
  sky: {
    backgroundColor: "#D0EEFF",
    color: "#1A6B8A",
    boxShadow: "inset 0 0 0 1px #8ACDEB",
  },
  lemon: {
    backgroundColor: "#FFF6C2",
    color: "#8A7A12",
    boxShadow: "inset 0 0 0 1px #F0E08A",
  },
  rose: {
    backgroundColor: "#FFD6E0",
    color: "#B83B5E",
    boxShadow: "inset 0 0 0 1px #F5A0B5",
  },
  grape: {
    backgroundColor: "#E2D4FF",
    color: "#5B3A9E",
    boxShadow: "inset 0 0 0 1px #B8A0F0",
  },
};

/** @deprecated Prefer JELLY_TIP_STYLE — kept for any className callers */
export const JELLY_TIP_CLASS: Record<StatusJellyColor, string> = {
  mint: "bg-[#C8F7E0] text-[#1B7A5A] ring-[#7DDBB0]",
  peach: "bg-[#FFE0C8] text-[#C45C26] ring-[#FFB088]",
  lavender: "bg-[#EDE0FF] text-[#6B3FA0] ring-[#C9A8F5]",
  sky: "bg-[#D0EEFF] text-[#1A6B8A] ring-[#8ACDEB]",
  lemon: "bg-[#FFF6C2] text-[#8A7A12] ring-[#F0E08A]",
  rose: "bg-[#FFD6E0] text-[#B83B5E] ring-[#F5A0B5]",
  grape: "bg-[#E2D4FF] text-[#5B3A9E] ring-[#B8A0F0]",
};

export const JELLY_SWATCH: Record<StatusJellyColor, string> = {
  mint: "#C8F7E0",
  peach: "#FFE0C8",
  lavender: "#EDE0FF",
  sky: "#D0EEFF",
  lemon: "#FFF6C2",
  rose: "#FFD6E0",
  grape: "#E2D4FF",
};

const DEFAULT_BY_RECORDING: Record<string, StatusJellyColor> = {
  living: "mint",
  dead: "rose",
  waiting: "lemon",
  optotagging: "lavender",
};

export function isJellyColor(v: unknown): v is StatusJellyColor {
  return typeof v === "string" && (STATUS_JELLY_COLORS as readonly string[]).includes(v);
}

export function resolveStatusColor(
  statusColor?: StatusJellyColor,
  recordingStatus?: string
): StatusJellyColor {
  if (statusColor && isJellyColor(statusColor)) return statusColor;
  if (recordingStatus && DEFAULT_BY_RECORDING[recordingStatus]) {
    return DEFAULT_BY_RECORDING[recordingStatus];
  }
  return "sky";
}
