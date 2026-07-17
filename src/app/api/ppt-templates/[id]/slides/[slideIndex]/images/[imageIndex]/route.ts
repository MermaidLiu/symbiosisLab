import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore } from "@/server/store";
import { readTemplateFile, readTemplateSlideImage } from "@/server/ppt";

type Ctx = { params: Promise<{ id: string; slideIndex: string; imageIndex: string }> };

/** GET /api/ppt-templates/[id]/slides/[slideIndex]/images/[imageIndex] */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const { id, slideIndex: slideIndexStr, imageIndex: imageIndexStr } = await ctx.params;
  const slideIndex = Number(slideIndexStr);
  const imageIndex = Number(imageIndexStr);
  if (!Number.isFinite(slideIndex) || !Number.isFinite(imageIndex)) {
    return jsonError("invalid_index", 400);
  }

  const template = getStore().pptTemplates.find((t) => t.id === id);
  if (!template) return jsonError("not_found", 404);

  const file = readTemplateFile(id);
  if (!file) return jsonError("file_missing", 404);

  const img = await readTemplateSlideImage(file, slideIndex, imageIndex);
  if (!img) return jsonError("image_missing", 404);

  return new NextResponse(new Uint8Array(img.buffer), {
    headers: {
      "Content-Type": img.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
