import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };

// Preserve existing photo URLs and serve newly uploaded files without a rebuild.
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!/^expimg[-_][a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/.test(filename)) return new NextResponse(null, { status: 404 });
  for (const root of [path.join(process.cwd(), "data", "uploads", "experiments"), path.join(process.cwd(), "public", "uploads", "experiments")]) {
    try {
      const bytes = await readFile(path.join(root, filename));
      return new NextResponse(bytes, { headers: { "Content-Type": types[path.extname(filename)], "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400" } });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return new NextResponse(null, { status: 500 });
    }
  }
  return new NextResponse(null, { status: 404 });
}
