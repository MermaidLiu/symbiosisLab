import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getWorkbenchTemplate } from "@/lib/ra/ppt-editor-templates";
import { buildPptxFromWorkbench, workbenchExportFilename } from "@/server/ppt-editor";

function normalizePages(body: Record<string, unknown>): Record<number, Record<string, string>> {
  const raw = body.pages;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Record<number, Record<string, string>> = {};
  for (const [pageKey, pageVal] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(pageKey);
    if (!Number.isFinite(index) || index < 0) continue;
    if (!pageVal || typeof pageVal !== "object" || Array.isArray(pageVal)) continue;
    out[index] = {};
    for (const [k, v] of Object.entries(pageVal as Record<string, unknown>)) {
      out[index][k] = v == null ? "" : String(v);
    }
  }
  return out;
}

/**
 * POST /api/ppt-workbench/export
 * Body: { templateId, pages: { "0": { title, ... }, ... } }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("invalid_body", 400);

  const templateId = String(body.templateId ?? "").trim();
  const template = getWorkbenchTemplate(templateId);
  if (!template) return jsonError("unknown_template", 400);

  const pages = normalizePages(body);
  if (Object.keys(pages).length === 0) return jsonError("pages_required", 400);

  try {
    const buffer = await buildPptxFromWorkbench(templateId, pages);
    const filename = workbenchExportFilename(template);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch {
    return jsonError("export_failed", 500);
  }
}
