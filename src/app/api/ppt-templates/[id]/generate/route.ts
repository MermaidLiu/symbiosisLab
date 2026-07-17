import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore } from "@/server/store";
import {
  appendTextSlides,
  fillPptxTemplate,
  readTemplateFile,
  replaceSlideImages,
} from "@/server/ppt";
import { extFromFileName, readAchievementFile } from "@/server/ra-files";
import { readImageLibraryFile } from "@/server/ra-images";
import { isImagePlaceholder } from "@/lib/ra/ppt-placeholders";

type Ctx = { params: Promise<{ id: string }> };

function normalizeValues(body: Record<string, unknown>): Record<string, string> {
  const raw =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as Record<string, unknown>)
      : body;

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "values" || k === "extraSlides" || k === "slideImages") continue;
    const key = k.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
    if (!key) continue;
    out[key] = v == null ? "" : String(v);
  }
  return out;
}

function resolveAssetBuffer(ref: string): Buffer | null {
  if (!ref) return null;
  const store = getStore();

  if (ref.startsWith("ach:")) {
    const id = ref.slice(4);
    const item = store.raAchievements.find((x) => x.id === id);
    if (!item || !item.mimeType.startsWith("image/")) return null;
    const ext = extFromFileName(item.fileName);
    return readAchievementFile(`${id}${ext}`);
  }

  if (ref.startsWith("lib:")) {
    const id = ref.slice(4);
    const item = store.raImageLibrary.find((x) => x.id === id);
    if (!item) return null;
    const ext = extFromFileName(item.fileName);
    return readImageLibraryFile(`${id}${ext}`);
  }

  return null;
}

/**
 * POST /api/ppt-templates/[id]/generate
 * Body: { values, slideImages?: { "0": ["ach:xx", "lib:yy"] }, extraSlides? }
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

  // Also collect image refs stored inside values for image placeholder keys
  const slideImagesFromValues: Record<number, Buffer[]> = {};
  for (const slide of template.slides ?? []) {
    const buffers: Buffer[] = [];
    for (const key of slide.imageKeys ?? []) {
      const ref = values[key] ?? "";
      const buf = resolveAssetBuffer(ref);
      if (buf) buffers.push(buf);
      else buffers.push(Buffer.alloc(0));
    }
    // trim trailing empty
    while (buffers.length && buffers[buffers.length - 1].length === 0) buffers.pop();
    const real = buffers.filter((b) => b.length > 0);
    if (real.length) slideImagesFromValues[slide.index] = real;
  }

  // Explicit slideImages map overrides / supplements
  const rawMap = body.slideImages;
  if (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) {
    for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
      const index = Number(k);
      if (!Number.isFinite(index) || !Array.isArray(v)) continue;
      const buffers = v
        .map((ref) => resolveAssetBuffer(String(ref ?? "")))
        .filter((b): b is Buffer => !!b && b.length > 0);
      if (buffers.length) slideImagesFromValues[index] = buffers;
    }
  }

  // Strip image refs from text fill values
  const textValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (isImagePlaceholder(k) || /^(ach|lib):/.test(v)) {
      textValues[k] = "";
    } else {
      textValues[k] = v;
    }
  }

  const extraRaw = Array.isArray(body.extraSlides) ? body.extraSlides : [];
  const extraSlides = extraRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        title: row.title == null ? "" : String(row.title),
        body: row.body == null ? "" : String(row.body),
      };
    })
    .filter((x): x is { title: string; body: string } => !!x);

  let filled: Buffer;
  try {
    filled = await fillPptxTemplate(file, textValues);
    if (Object.keys(slideImagesFromValues).length > 0) {
      filled = await replaceSlideImages(filled, slideImagesFromValues);
    }
    if (extraSlides.length > 0) {
      filled = await appendTextSlides(filled, extraSlides);
    }
  } catch {
    return jsonError("fill_failed", 500);
  }

  const safeName = template.name.replace(/[^\w\u4e00-\u9fff\-]+/g, "_");
  const filename = `${safeName}_${new Date().toISOString().slice(0, 10)}.pptx`;

  return new NextResponse(new Uint8Array(filled), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
