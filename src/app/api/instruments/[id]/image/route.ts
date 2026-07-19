import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk, requireRole } from "@/server/auth";
import { mutateStore, uid } from "@/server/store";
import { appendAuditLog } from "@/server/audit";
import {
  deleteInstrumentImageFile,
  extFromFileName,
  writeInstrumentImageFile,
} from "@/server/instrument-images";
import { normalizeInstrument } from "@/lib/instruments";

const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!requireRole(user, "instrument_manager")) return jsonError("forbidden", 403);

  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("invalid_body", 400);
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("missing_file", 400);

  const ext = extFromFileName(file.name);
  if (!ALLOWED.has(ext)) return jsonError("invalid_file_type", 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) return jsonError("file_too_large", 400);

  const imageId = uid("img");
  writeInstrumentImageFile(imageId, ext, buffer);

  let updated = null as ReturnType<typeof normalizeInstrument> | null;
  let oldImageId: string | undefined;
  await mutateStore((s) => {
    const idx = s.instruments.findIndex((i) => i.id === id);
    if (idx < 0) return;
    oldImageId = s.instruments[idx].imageId;
    s.instruments[idx] = normalizeInstrument({
      ...s.instruments[idx],
      imageId,
      updatedAt: new Date().toISOString(),
    });
    updated = s.instruments[idx];
  });

  if (!updated) {
    deleteInstrumentImageFile(imageId);
    return jsonError("not_found", 404);
  }
  if (oldImageId) deleteInstrumentImageFile(oldImageId);

  await appendAuditLog({
    userId: user.id,
    userName: user.name,
    action: "upload_image",
    entityType: "instrument",
    entityId: id,
    details: `上传仪器图片 ${id}`,
  });

  return jsonOk({ instrument: updated });
}
