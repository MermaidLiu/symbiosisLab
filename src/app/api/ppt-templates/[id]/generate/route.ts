import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore } from "@/server/store";
import { fillPptxTemplate, readTemplateFile } from "@/server/ppt";

type Ctx = { params: Promise<{ id: string }> };

function normalizeValues(body: Record<string, unknown>): Record<string, string> {
  const raw =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as Record<string, unknown>)
      : body;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "values") continue;
    const key = k.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
    if (!key) continue;
    out[key] = v == null ? "" : String(v);
  }
  return out;
}

/**
 * POST /api/ppt-templates/[id]/generate
 * Body JSON: { values: { date, funding_amount, achievements, ... } }
 * Returns filled PPTX for download.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const { id } = await ctx.params;
  const store = getStore();
  const template = store.pptTemplates.find((t) => t.id === id);
  if (!template) return jsonError("not_found", 404);

  const file = readTemplateFile(id);
  if (!file) return jsonError("file_missing", 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const values = normalizeValues(body);

  let filled: Buffer;
  try {
    filled = await fillPptxTemplate(file, values);
  } catch {
    return jsonError("fill_failed", 500);
  }

  const safeName = template.name.replace(/[^\w\u4e00-\u9fff\-]+/g, "_");
  const filename = `${safeName}_${new Date().toISOString().slice(0, 10)}.pptx`;

  return new NextResponse(new Uint8Array(filled), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
