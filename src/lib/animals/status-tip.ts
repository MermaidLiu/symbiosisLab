import { StatusJellyColor, STATUS_JELLY_COLORS } from "@/types/animal-management";

/** 7 jelly (pastel candy) tip styles: bg + text + ring */
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
