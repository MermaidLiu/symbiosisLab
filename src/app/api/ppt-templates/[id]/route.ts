import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore } from "@/server/store";
import { deleteTemplateFile } from "@/server/ppt";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/ppt-templates/[id]
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const { id } = await ctx.params;
  const store = getStore();
  if (!store.pptTemplates.some((t) => t.id === id)) return jsonError("not_found", 404);

  deleteTemplateFile(id);
  await mutateStore((s) => {
    s.pptTemplates = s.pptTemplates.filter((t) => t.id !== id);
  });

  return jsonOk({ ok: true });
}
