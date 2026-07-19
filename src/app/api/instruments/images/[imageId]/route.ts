import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { readInstrumentImageFile } from "@/server/instrument-images";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const { imageId } = await params;
  const file = readInstrumentImageFile(imageId);
  if (!file) return jsonError("not_found", 404);

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": MIME[file.ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
