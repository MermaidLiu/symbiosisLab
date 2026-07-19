import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data", "instrument-images");

export function ensureInstrumentImageDir(): void {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

export function instrumentImageFilePath(id: string, ext: string): string {
  return path.join(DIR, `${id}${ext.startsWith(".") ? ext : `.${ext}`}`);
}

export function writeInstrumentImageFile(id: string, ext: string, buffer: Buffer): string {
  ensureInstrumentImageDir();
  const filePath = instrumentImageFilePath(id, ext);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function findInstrumentImageFile(id: string): { path: string; ext: string } | null {
  ensureInstrumentImageDir();
  const entries = fs.readdirSync(DIR);
  const match = entries.find((f) => f.startsWith(`${id}.`));
  if (!match) return null;
  return { path: path.join(DIR, match), ext: path.extname(match) };
}

export function readInstrumentImageFile(id: string): { buffer: Buffer; ext: string } | null {
  const found = findInstrumentImageFile(id);
  if (!found) return null;
  return { buffer: fs.readFileSync(found.path), ext: found.ext };
}

export function deleteInstrumentImageFile(id: string): void {
  const found = findInstrumentImageFile(id);
  if (found && fs.existsSync(found.path)) fs.unlinkSync(found.path);
}

export function extFromFileName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return ".bin";
  return name.slice(i).toLowerCase();
}
