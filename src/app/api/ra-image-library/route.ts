import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import {
  deleteImageLibraryFile,
  extFromFileName,
  writeImageLibraryFile,
} from "@/server/ra-images";
import { RaImageLibraryItem, RaImageLibraryTag } from "@/types";

const TAGS: RaImageLibraryTag[] = ["lab", "equipment", "experiment"];
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

/** GET /api/ra-image-library */
export async function GET() {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;
  const items = [...getStore().raImageLibrary].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return jsonOk({ items });
}

/** POST /api/ra-image-library — multipart: title, tag, note?, file */
export async function POST(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("invalid_body", 400);

  const title = String(form.get("title") ?? "").trim();
  const tag = String(form.get("tag") ?? "lab").trim() as RaImageLibraryTag;
  const note = String(form.get("note") ?? "").trim();
  const file = form.get("file");

  if (!title) return jsonError("title_required", 400);
  if (!TAGS.includes(tag)) return jsonError("invalid_tag", 400);
  if (!(file instanceof File)) return jsonError("file_required", 400);

  const ext = extFromFileName(file.name);
  if (!ALLOWED_EXT.has(ext)) return jsonError("invalid_file_type", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 20) return jsonError("invalid_file", 400);
  if (buffer.length > 15 * 1024 * 1024) return jsonError("file_too_large", 400);

  const id = uid("img");
  writeImageLibraryFile(id, ext, buffer);

  const item: RaImageLibraryItem = {
    id,
    title,
    tag,
    note,
    fileName: file.name,
    mimeType: file.type || "image/png",
    uploadedBy: auth.user.id,
    createdAt: new Date().toISOString(),
  };

  await mutateStore((s) => {
    s.raImageLibrary.push(item);
  });

  return jsonOk({ item }, { status: 201 });
}

/** DELETE /api/ra-image-library?id= */
export async function DELETE(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("id_required", 400);

  const store = getStore();
  const item = store.raImageLibrary.find((x) => x.id === id);
  if (!item) return jsonError("not_found", 404);

  const ext = extFromFileName(item.fileName);
  deleteImageLibraryFile(`${id}${ext}`);

  await mutateStore((s) => {
    s.raImageLibrary = s.raImageLibrary.filter((x) => x.id !== id);
  });

  return jsonOk({ ok: true });
}
