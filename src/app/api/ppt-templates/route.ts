import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import {
  ensureSeedPptTemplates,
  extractPlaceholders,
  writeTemplateFile,
} from "@/server/ppt";

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

/** Ensure seed templates are on disk + in store (lazy). */
async function ensureTemplates() {
  const store = getStore();
  const next = await ensureSeedPptTemplates(store.pptTemplates);
  if (next.length !== store.pptTemplates.length) {
    await mutateStore((s) => {
      s.pptTemplates = next;
    });
  }
  return getStore().pptTemplates;
}

/**
 * GET /api/ppt-templates — list templates (RA only)
 */
export async function GET() {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const templates = await ensureTemplates();
  return jsonOk({ templates });
}

/**
 * POST /api/ppt-templates — upload a PPTX template
 * multipart: name (string), file (.pptx)
 */
export async function POST(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("invalid_body", 400);

  const name = String(form.get("name") ?? "").trim();
  const file = form.get("file");
  if (!name) return jsonError("name_required", 400);
  if (!(file instanceof File)) return jsonError("file_required", 400);
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    return jsonError("invalid_file_type", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 100) return jsonError("invalid_file", 400);

  let placeholders: string[];
  try {
    placeholders = await extractPlaceholders(buffer);
  } catch {
    return jsonError("invalid_pptx", 400);
  }

  const id = uid("ppt");
  writeTemplateFile(id, buffer);

  const template = {
    id,
    name,
    placeholders,
    uploadedBy: auth.user.id,
    createdAt: new Date().toISOString(),
  };

  await mutateStore((s) => {
    s.pptTemplates.push(template);
  });

  return jsonOk({ template }, { status: 201 });
}
