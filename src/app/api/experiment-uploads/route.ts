import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireActiveUser } from "@/server/auth";
import { uid } from "@/server/store";

const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** POST /api/experiment-uploads — multipart file → /uploads/experiments/... */
export async function POST(req: NextRequest) {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("invalid_body", 400);

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("file_required", 400);

  const name = file.name || "photo.jpg";
  const ext = path.extname(name).toLowerCase() || ".jpg";
  if (!ALLOWED.has(ext)) return jsonError("invalid_type", 400);
  if (file.size > 12 * 1024 * 1024) return jsonError("file_too_large", 400);

  const dir = path.join(process.cwd(), "public", "uploads", "experiments");
  await mkdir(dir, { recursive: true });
  const filename = `${uid("expimg")}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buf);

  const url = `/uploads/experiments/${filename}`;
  return jsonOk({ url, filename }, { status: 201 });
}
