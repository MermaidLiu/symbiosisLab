import { RaTopicKeyword } from "@/types";
import { uid } from "@/server/crypto";

export function buildDefaultTopicKeywords(createdBy = "system"): RaTopicKeyword[] {
  const now = new Date().toISOString();
  const labels = [
    "脑机接口",
    "Brain-Computer Interface",
    "BCI",
    "Neural interface",
    "神经接口",
    "Bioelectronics",
  ];
  return labels.map((label) => ({
    id: uid("rtk"),
    label,
    source: "system" as const,
    createdBy,
    createdAt: now,
  }));
}
