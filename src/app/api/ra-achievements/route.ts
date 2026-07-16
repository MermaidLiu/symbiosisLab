import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import {
  deleteAchievementFile,
  extFromFileName,
  writeAchievementFile,
} from "@/server/ra-files";
import { RaAchievementCategory, RaAchievementRecord } from "@/types";

const CATEGORIES: RaAchievementCategory[] = ["certificate", "patent", "paper", "ppt"];
const ALLOWED_EXT = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pptx",
  ".ppt",
]);

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

/** GET /api/ra-achievements */
export async function GET() {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;
  const items = [...getStore().raAchievements].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return jsonOk({ items });
}

/** POST /api/ra-achievements — multipart: category, title, note?, file */
export async function POST(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("invalid_body", 400);

  const category = String(form.get("category") ?? "").trim() as RaAchievementCategory;
  const title = String(form.get("title") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const file = form.get("file");

  if (!CATEGORIES.includes(category)) return jsonError("invalid_category", 400);
  if (!title) return jsonError("title_required", 400);
  if (!(file instanceof File)) return jsonError("file_required", 400);

  const ext = extFromFileName(file.name);
  if (!ALLOWED_EXT.has(ext)) return jsonError("invalid_file_type", 400);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 20) return jsonError("invalid_file", 400);
  if (buffer.length > 25 * 1024 * 1024) return jsonError("file_too_large", 400);

  const id = uid("ach");
  const storedName = `${id}${ext}`;
  writeAchievementFile(id, ext, buffer);

  const item: RaAchievementRecord = {
    id,
    category,
    title,
    note,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    uploadedBy: auth.user.id,
    createdAt: new Date().toISOString(),
  };
  // persist stored filename via id+ext convention — store original name in fileName
  // disk uses `${id}${ext}`
  void storedName;

  await mutateStore((s) => {
    s.raAchievements.push(item);
  });

  return jsonOk({ item }, { status: 201 });
}

/** DELETE /api/ra-achievements?id= */
export async function DELETE(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("id_required", 400);

  const store = getStore();
  const item = store.raAchievements.find((x) => x.id === id);
  if (!item) return jsonError("not_found", 404);

  const ext = extFromFileName(item.fileName);
  deleteAchievementFile(`${id}${ext}`);

  await mutateStore((s) => {
    s.raAchievements = s.raAchievements.filter((x) => x.id !== id);
  });

  return jsonOk({ ok: true });
}
