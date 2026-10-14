import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireActiveUser } from "@/server/auth";
import { uid } from "@/server/store";

const ALLOWED = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_BYTES = 12 * 1024 * 1024;

function detectImageExt(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return ".jpg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return ".png";
  }
  if (buf.length >= 6 && buf.slice(0, 6).toString("ascii") === "GIF87a") return ".gif";
  if (buf.length >= 6 && buf.slice(0, 6).toString("ascii") === "GIF89a") return ".gif";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") {
    return ".webp";
  }
  return null;
}

function resolveExt(filename: string | undefined, buf: Buffer): string | null {
  const fromName = path.extname(String(filename ?? "")).toLowerCase();
  if (fromName && ALLOWED.has(fromName)) return fromName;
  const detected = detectImageExt(buf);
  if (detected && ALLOWED.has(detected)) return detected;
  return ".jpg";
}

async function saveExperimentImage(buf: Buffer, ext: string) {
  if (buf.length > MAX_BYTES) return { error: "file_too_large" as const };
  if (!ALLOWED.has(ext)) return { error: "invalid_type" as const };

  const dir = path.join(process.cwd(), "public", "uploads", "experiments");
  await mkdir(dir, { recursive: true });
  const filename = `${uid("expimg")}${ext}`;
  await writeFile(path.join(dir, filename), buf);
  const url = `/uploads/experiments/${filename}`;
  return { url, filename };
}

/** POST /api/experiment-uploads — multipart file or JSON base64 → /uploads/experiments/... */
export async function POST(req: NextRequest) {
  const auth = await requireActiveUser();
  if ("error" in auth) return auth.error;

  const contentType = req.headers.get("content-type") || "";

  // 小程序：走 wx.request + base64（与登录同域，不依赖 uploadFile 合法域名）
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    const raw = String(body.imageBase64 ?? body.base64 ?? "")
      .replace(/^data:image\/\w+;base64,/, "")
      .trim();
    if (!raw) return jsonError("file_required", 400);

    let buf: Buffer;
    try {
      buf = Buffer.from(raw, "base64");
    } catch {
      return jsonError("invalid_body", 400);
    }
    if (buf.length === 0) return jsonError("file_required", 400);

    const ext = resolveExt(body.filename ? String(body.filename) : undefined, buf);
    if (!ext) return jsonError("invalid_type", 400);

    const saved = await saveExperimentImage(buf, ext);
    if ("error" in saved) return jsonError(saved.error ?? "failed", 400);
    return jsonOk(saved, { status: 201 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("invalid_body", 400);

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("file_required", 400);

  const name = file.name || "photo.jpg";
  const extFromName = path.extname(name).toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extFromName && ALLOWED.has(extFromName) ? extFromName : resolveExt(name, buf);
  if (!ext) return jsonError("invalid_type", 400);

  const saved = await saveExperimentImage(buf, ext);
  if ("error" in saved) return jsonError(saved.error ?? "failed", 400);
  return jsonOk(saved, { status: 201 });
}
