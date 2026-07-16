import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data", "ra-achievements");

export function ensureRaAchievementDir(): void {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

export function achievementFilePath(id: string, ext: string): string {
  return path.join(DIR, `${id}${ext.startsWith(".") ? ext : `.${ext}`}`);
}

export function writeAchievementFile(id: string, ext: string, buffer: Buffer): string {
  ensureRaAchievementDir();
  const filePath = achievementFilePath(id, ext);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function readAchievementFile(storedName: string): Buffer | null {
  const p = path.join(DIR, storedName);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

export function deleteAchievementFile(storedName: string): void {
  const p = path.join(DIR, storedName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function extFromFileName(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return ".bin";
  return name.slice(i).toLowerCase();
}
