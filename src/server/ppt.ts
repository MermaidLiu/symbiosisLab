import fs from "fs";
import path from "path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { PptTemplate } from "@/types";
import { uid } from "@/server/crypto";

const PPT_DIR = path.join(process.cwd(), "data", "ppt-templates");
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function ensurePptDir(): void {
  if (!fs.existsSync(PPT_DIR)) {
    fs.mkdirSync(PPT_DIR, { recursive: true });
  }
}

export function templateFilePath(id: string): string {
  return path.join(PPT_DIR, `${id}.pptx`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function applyValues(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [key, raw] of Object.entries(values)) {
    const re = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, "g");
    out = out.replace(re, raw ?? "");
  }
  return out;
}

/** Extract unique {{placeholder}} keys from a PPTX buffer. */
export async function extractPlaceholders(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const keys = new Set<string>();
  const files = Object.keys(zip.files).filter(
    (n) => n.startsWith("ppt/") && n.endsWith(".xml") && !zip.files[n].dir
  );
  for (const name of files) {
    const xml = await zip.files[name].async("string");
    PLACEHOLDER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PLACEHOLDER_RE.exec(xml)) !== null) {
      keys.add(m[1]);
    }
  }
  return [...keys].sort();
}

/**
 * Replace placeholders in slide XML.
 * Handles PowerPoint splitting {{token}} across multiple <a:t> runs
 * by collapsing each paragraph's text, replacing, then writing back.
 */
function fillXml(xml: string, values: Record<string, string>): string {
  return xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (para) => {
    const texts: string[] = [];
    para.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (_, t: string) => {
      texts.push(decodeXml(t));
      return _;
    });
    if (texts.length === 0) return para;

    const joined = texts.join("");
    if (!joined.includes("{{")) return para;

    const replaced = applyValues(joined, values);
    if (replaced === joined) return para;

    let i = 0;
    return para.replace(/<a:t(\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (full, attrs: string | undefined) => {
      const open = `<a:t${attrs ?? ""}>`;
      if (i++ === 0) return `${open}${escapeXml(replaced)}</a:t>`;
      return `${open}</a:t>`;
    });
  });
}

/** Fill a PPTX template buffer with key/value data; returns new PPTX bytes. */
export async function fillPptxTemplate(
  templateBuffer: Buffer,
  values: Record<string, string>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const files = Object.keys(zip.files).filter(
    (n) => n.startsWith("ppt/") && n.endsWith(".xml") && !zip.files[n].dir
  );
  for (const name of files) {
    const xml = await zip.files[name].async("string");
    const filled = fillXml(xml, values);
    if (filled !== xml) {
      zip.file(name, filled);
    }
  }
  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return Buffer.from(out);
}

async function writePptxGen(pptx: PptxGenJS): Promise<Buffer> {
  const raw = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(raw as ArrayBuffer);
}

async function buildGovernmentTemplate(): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Symbiosis Lab";
  pptx.title = "政府汇报模板";
  const s = pptx.addSlide();
  s.addText("政府工作汇报", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: "660874",
  });
  s.addText("汇报日期：{{date}}", { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 16 });
  s.addText("科研进展：{{achievements}}", { x: 0.5, y: 1.8, w: 9, h: 1.4, fontSize: 16 });
  s.addText("横向课题经费：{{funding_amount}}", { x: 0.5, y: 3.4, w: 9, h: 0.4, fontSize: 16 });
  s.addText("备注：{{remarks}}", { x: 0.5, y: 4.0, w: 9, h: 0.8, fontSize: 14, color: "666666" });
  return writePptxGen(pptx);
}

async function buildFundingTemplate(): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Symbiosis Lab";
  pptx.title = "融资汇报模板";
  const s = pptx.addSlide();
  s.addText("融资汇报", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: "660874",
  });
  s.addText("汇报日期：{{date}}", { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 16 });
  s.addText("投资方：{{investor}}", { x: 0.5, y: 1.7, w: 9, h: 0.4, fontSize: 16 });
  s.addText("融资金额：{{funding_amount}}", { x: 0.5, y: 2.2, w: 9, h: 0.4, fontSize: 16 });
  s.addText("核心亮点：{{highlights}}", { x: 0.5, y: 2.8, w: 9, h: 1.2, fontSize: 16 });
  s.addText("团队介绍：{{team}}", { x: 0.5, y: 4.2, w: 9, h: 0.8, fontSize: 16 });
  return writePptxGen(pptx);
}

/** Ensure default PPT templates exist on disk + in metadata list. */
export async function ensureSeedPptTemplates(existing: PptTemplate[]): Promise<PptTemplate[]> {
  ensurePptDir();
  const seeds: { name: string; build: () => Promise<Buffer> }[] = [
    { name: "政府汇报模板", build: buildGovernmentTemplate },
    { name: "融资汇报模板", build: buildFundingTemplate },
  ];

  const next = [...existing];
  for (const seed of seeds) {
    if (next.some((t) => t.name === seed.name)) continue;
    const id = uid("ppt");
    const buffer = await seed.build();
    fs.writeFileSync(templateFilePath(id), buffer);
    const placeholders = await extractPlaceholders(buffer);
    next.push({
      id,
      name: seed.name,
      placeholders,
      uploadedBy: "system",
      createdAt: new Date().toISOString(),
    });
  }
  return next;
}

export function readTemplateFile(id: string): Buffer | null {
  const p = templateFilePath(id);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}

export function writeTemplateFile(id: string, buffer: Buffer): void {
  ensurePptDir();
  fs.writeFileSync(templateFilePath(id), buffer);
}

export function deleteTemplateFile(id: string): void {
  const p = templateFilePath(id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
