import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore } from "@/server/store";
import { extFromFileName, readAchievementFile } from "@/server/ra-files";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/ra-achievements/[id]/file — download scan */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const { id } = await ctx.params;
  const item = getStore().raAchievements.find((x) => x.id === id);
  if (!item) return jsonError("not_found", 404);

  const ext = extFromFileName(item.fileName);
  const buf = readAchievementFile(`${id}${ext}`);
  if (!buf) return jsonError("file_missing", 404);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": item.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(item.fileName)}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
