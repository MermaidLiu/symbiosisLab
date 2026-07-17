import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore } from "@/server/store";
import { extFromFileName } from "@/server/ra-files";
import { readImageLibraryFile } from "@/server/ra-images";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/ra-image-library/[id]/file */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const { id } = await ctx.params;
  const item = getStore().raImageLibrary.find((x) => x.id === id);
  if (!item) return jsonError("not_found", 404);

  const ext = extFromFileName(item.fileName);
  const buf = readImageLibraryFile(`${id}${ext}`);
  if (!buf) return jsonError("file_missing", 404);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": item.mimeType || "image/png",
      "Content-Disposition": `inline; filename="${encodeURIComponent(item.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
