import fs from "fs";
import path from "path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { PptSlideBlock, PptTemplate, PptTemplateSlide } from "@/types";
import { uid } from "@/server/crypto";
import { isImagePlaceholder, splitPlaceholders } from "@/lib/ra/ppt-placeholders";

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

function collectPlaceholders(xml: string): string[] {
  const keys = new Set<string>();
  PLACEHOLDER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RE.exec(xml)) !== null) {
    keys.add(m[1]);
  }
  return [...keys].sort();
}

/** Ordered slide part paths from presentation.xml relationships. */
async function orderedSlidePaths(zip: JSZip): Promise<string[]> {
  const relsFile = zip.file("ppt/_rels/presentation.xml.rels");
  const presentationFile = zip.file("ppt/presentation.xml");
  if (!relsFile || !presentationFile) {
    return Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => {
        const na = Number(/slide(\d+)/.exec(a)?.[1] ?? 0);
        const nb = Number(/slide(\d+)/.exec(b)?.[1] ?? 0);
        return na - nb;
      });
  }

  const relsXml = await relsFile.async("string");
  const ridToTarget = new Map<string, string>();
  for (const re of [
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g,
    /<Relationship[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"[^>]*\/?>/g,
  ]) {
    let m: RegExpExecArray | null;
    const swap = re.source.startsWith("<Relationship[^>]*Target");
    while ((m = re.exec(relsXml)) !== null) {
      const id = swap ? m[2] : m[1];
      const target = swap ? m[1] : m[2];
      if (ridToTarget.has(id)) continue;
      const normalized = target.replace(/^\.\//, "");
      const full = normalized.startsWith("ppt/") ? normalized : `ppt/${normalized}`;
      ridToTarget.set(id, full.replace(/\\/g, "/"));
    }
  }

  const presentationXml = await presentationFile.async("string");
  const ordered: string[] = [];
  presentationXml.replace(/<p:sldId\b[^>]*r:id="([^"]+)"[^>]*\/?>/g, (_, rid: string) => {
    const target = ridToTarget.get(rid);
    if (target && target.includes("/slides/")) ordered.push(target);
    return _;
  });

  if (ordered.length > 0) return ordered;

  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(/slide(\d+)/.exec(a)?.[1] ?? 0);
      const nb = Number(/slide(\d+)/.exec(b)?.[1] ?? 0);
      return na - nb;
    });
}

async function slideMediaTargets(zip: JSZip, slidePath: string): Promise<string[]> {
  const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const relsFile = zip.file(relsPath);
  if (!relsFile) return [];
  const relsXml = await relsFile.async("string");
  const targets: string[] = [];
  relsXml.replace(/Target="([^"]+)"/g, (_, target: string) => {
    const normalized = target.replace(/^\.\.\//, "ppt/").replace(/^\.\//, "");
    const full = normalized.startsWith("ppt/")
      ? normalized
      : slidePath.includes("/slides/")
        ? `ppt/slides/${normalized}`.replace("/slides/../", "/")
        : `ppt/${normalized}`;
    const fixed = full.replace(/\\/g, "/").replace("ppt/slides/../media/", "ppt/media/");
    if (fixed.includes("/media/")) targets.push(fixed);
    return _;
  });
  return [...new Set(targets)];
}

/** Read PNG / JPEG / GIF / WEBP pixel dimensions from a buffer. */
function readImageSize(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24) return { width: 0, height: 0 };

  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = buf.readUInt16BE(i + 2);
      // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }

  // WEBP (VP8 / VP8L / VP8X)
  if (
    buf.length >= 30 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 " && buf.length >= 30) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X" && buf.length >= 30) {
      return {
        width: 1 + buf[24] + (buf[25] << 8) + (buf[26] << 16),
        height: 1 + buf[27] + (buf[28] << 8) + (buf[29] << 16),
      };
    }
  }

  return { width: 0, height: 0 };
}

async function readMediaSizes(
  zip: JSZip,
  mediaPaths: string[]
): Promise<{ width: number; height: number }[]> {
  const out: { width: number; height: number }[] = [];
  for (const mediaPath of mediaPaths) {
    const file = zip.file(mediaPath);
    if (!file) {
      out.push({ width: 0, height: 0 });
      continue;
    }
    const buf = Buffer.from(await file.async("nodebuffer"));
    out.push(readImageSize(buf));
  }
  return out;
}

function extractParagraphTexts(xml: string): string[] {
  const paragraphs: string[] = [];
  xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (para) => {
    const texts: string[] = [];
    para.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (_, t: string) => {
      texts.push(decodeXml(t));
      return _;
    });
    paragraphs.push(texts.join(""));
    return para;
  });
  return paragraphs;
}

function parseXfrm(fragment: string): { x: number; y: number; cx: number; cy: number } | null {
  const offMatch =
    /<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"[^>]*\/?>/.exec(fragment) ||
    /<a:off\b[^>]*\by="(-?\d+)"[^>]*\bx="(-?\d+)"[^>]*\/?>/.exec(fragment);
  const extMatch =
    /<a:ext\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"[^>]*\/?>/.exec(fragment) ||
    /<a:ext\b[^>]*\bcy="(-?\d+)"[^>]*\bcx="(-?\d+)"[^>]*\/?>/.exec(fragment);
  if (!offMatch || !extMatch) return null;

  const swappedOff = offMatch[0].includes('y="') && offMatch[0].indexOf('y="') < offMatch[0].indexOf('x="');
  const swappedExt = extMatch[0].includes('cy="') && extMatch[0].indexOf('cy="') < extMatch[0].indexOf('cx="');

  return {
    x: Number(swappedOff ? offMatch[2] : offMatch[1]),
    y: Number(swappedOff ? offMatch[1] : offMatch[2]),
    cx: Number(swappedExt ? extMatch[2] : extMatch[1]),
    cy: Number(swappedExt ? extMatch[1] : extMatch[2]),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function toNorm(
  emu: { x: number; y: number; cx: number; cy: number },
  slideCx: number,
  slideCy: number
): Pick<PptSlideBlock, "x" | "y" | "w" | "h"> {
  return {
    x: clamp01(emu.x / slideCx),
    y: clamp01(emu.y / slideCy),
    w: clamp01(emu.cx / slideCx) || 0.12,
    h: clamp01(emu.cy / slideCy) || 0.08,
  };
}

async function readPresentationSlideSize(zip: JSZip): Promise<{ cx: number; cy: number }> {
  const file = zip.file("ppt/presentation.xml");
  if (!file) return { cx: 12192000, cy: 6858000 };
  const xml = await file.async("string");
  const m =
    /<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(xml) ||
    /<p:sldSz\b[^>]*\bcy="(\d+)"[^>]*\bcx="(\d+)"/.exec(xml);
  if (!m) return { cx: 12192000, cy: 6858000 };
  const cyFirst = m[0].indexOf('cy="') < m[0].indexOf('cx="');
  return cyFirst
    ? { cx: Number(m[2]), cy: Number(m[1]) }
    : { cx: Number(m[1]), cy: Number(m[2]) };
}

async function readSlideRelsMap(zip: JSZip, slidePath: string): Promise<Map<string, string>> {
  const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const relsFile = zip.file(relsPath);
  const map = new Map<string, string>();
  if (!relsFile) return map;
  const relsXml = await relsFile.async("string");
  relsXml.replace(
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g,
    (_, id: string, target: string) => {
      const normalized = target.replace(/^\.\.\//, "ppt/").replace(/^\.\//, "");
      const full = normalized.startsWith("ppt/")
        ? normalized
        : `ppt/slides/${normalized}`.replace("/slides/../", "/");
      const fixed = full.replace(/\\/g, "/").replace("ppt/slides/../media/", "ppt/media/");
      map.set(id, fixed);
      return _;
    }
  );
  return map;
}

function shapePlainText(txBody: string): string {
  return extractParagraphTexts(txBody)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Extract Beautiful.ai-style positioned blocks (text shapes + pictures)
 * with normalized coordinates relative to slide size.
 */
function extractSlideBlocks(
  xml: string,
  slideIndex: number,
  slideCx: number,
  slideCy: number,
  ridToMedia: Map<string, string>
): {
  blocks: PptSlideBlock[];
  textKeys: string[];
  textDefaults: Record<string, string>;
  imageKeys: string[];
  mediaOrder: string[];
} {
  const blocks: PptSlideBlock[] = [];
  const textKeys: string[] = [];
  const textDefaults: Record<string, string> = {};
  const imageKeys: string[] = [];
  const mediaOrder: string[] = [];
  const seenText = new Set<string>();
  let shapeIdx = 0;
  let imgIdx = 0;

  // Pictures first (document order)
  xml.replace(/<p:pic\b[\s\S]*?<\/p:pic>/g, (pic) => {
    const xfrm = parseXfrm(pic);
    const embed =
      /r:embed="([^"]+)"/.exec(pic)?.[1] ||
      /r:link="([^"]+)"/.exec(pic)?.[1];
    const mediaPath = embed ? ridToMedia.get(embed) : undefined;
    if (mediaPath) mediaOrder.push(mediaPath);

    const key = `__img_${imgIdx}`;
    imageKeys.push(key);
    const norm = xfrm
      ? toNorm(xfrm, slideCx, slideCy)
      : { x: 0.55, y: 0.15 + imgIdx * 0.28, w: 0.4, h: 0.35 };
    blocks.push({
      key,
      kind: "image",
      ...norm,
      imageIndex: imgIdx,
    });
    imgIdx++;
    return pic;
  });

  // Text-bearing shapes
  xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (sp) => {
    const txBodyMatch = /<p:txBody\b[\s\S]*?<\/p:txBody>/.exec(sp);
    if (!txBodyMatch) return sp;

    const plain = shapePlainText(txBodyMatch[0]);
    if (!plain) return sp;

    const xfrm = parseXfrm(sp);
    const norm = xfrm
      ? toNorm(xfrm, slideCx, slideCy)
      : { x: 0.06, y: 0.1 + shapeIdx * 0.12, w: 0.55, h: 0.1 };

    PLACEHOLDER_RE.lastIndex = 0;
    const phMatches = [...plain.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)];
    if (phMatches.length > 0) {
      for (const m of phMatches) {
        const key = m[1];
        if (isImagePlaceholder(key) || seenText.has(key)) continue;
        seenText.add(key);
        textKeys.push(key);
        textDefaults[key] = "";
        blocks.push({ key, kind: "text", ...norm, defaultText: "" });
      }
      shapeIdx++;
      return sp;
    }

    const key = `__shape_${slideIndex}_${shapeIdx}`;
    shapeIdx++;
    if (seenText.has(key)) return sp;
    seenText.add(key);
    textKeys.push(key);
    textDefaults[key] = plain;
    blocks.push({ key, kind: "text", ...norm, defaultText: plain });
    return sp;
  });

  // Fallback: if no positioned text but paragraphs exist (odd XML), use paragraph keys
  if (textKeys.length === 0) {
    const paragraphs = extractParagraphTexts(xml);
    paragraphs.forEach((joined, paraIdx) => {
      const trimmed = joined.trim();
      if (!trimmed) return;
      PLACEHOLDER_RE.lastIndex = 0;
      const phMatches = [...trimmed.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)];
      if (phMatches.length > 0) {
        for (const m of phMatches) {
          const key = m[1];
          if (isImagePlaceholder(key) || seenText.has(key)) continue;
          seenText.add(key);
          textKeys.push(key);
          textDefaults[key] = "";
          blocks.push({
            key,
            kind: "text",
            x: 0.06,
            y: 0.08 + textKeys.length * 0.1,
            w: 0.55,
            h: 0.09,
            defaultText: "",
          });
        }
        return;
      }
      const key = `__text_${slideIndex}_${paraIdx}`;
      if (seenText.has(key)) return;
      seenText.add(key);
      textKeys.push(key);
      textDefaults[key] = trimmed;
      blocks.push({
        key,
        kind: "text",
        x: 0.06,
        y: 0.08 + textKeys.length * 0.1,
        w: 0.55,
        h: 0.09,
        defaultText: trimmed,
      });
    });
  }

  return { blocks, textKeys, textDefaults, imageKeys, mediaOrder };
}

function fillShapeTextBody(txBody: string, replacement: string): string {
  let first = true;
  let out = txBody.replace(/<a:t(\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (_full, attrs: string | undefined) => {
    const open = `<a:t${attrs ?? ""}>`;
    if (first) {
      first = false;
      return `${open}${escapeXml(replacement)}</a:t>`;
    }
    return `${open}</a:t>`;
  });
  // If shape had no <a:t>, leave as-is
  if (first) return txBody;
  return out;
}

function fillSlideTextXml(xml: string, values: Record<string, string>, slideIndex: number): string {
  let shapeIdx = 0;
  let paraIdx = 0;

  // Fill by text shape (Beautiful.ai-style shape blocks)
  let out = xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (sp) => {
    const txBodyMatch = /<p:txBody\b[\s\S]*?<\/p:txBody>/.exec(sp);
    if (!txBodyMatch) return sp;

    const plain = shapePlainText(txBodyMatch[0]);
    if (!plain) return sp;

    let replacement: string | null = null;

    if (plain.includes("{{")) {
      const replaced = applyValues(plain, values);
      if (replaced !== plain) replacement = replaced;
    } else {
      const key = `__shape_${slideIndex}_${shapeIdx}`;
      if (values[key] !== undefined) replacement = values[key];
    }
    shapeIdx++;

    if (replacement === null) return sp;
    const newTx = fillShapeTextBody(txBodyMatch[0], replacement);
    return sp.replace(txBodyMatch[0], newTx);
  });

  // Also fill leftover paragraph-level __text_* keys (fallback extraction)
  out = out.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (para) => {
    const texts: string[] = [];
    para.replace(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (_, t: string) => {
      texts.push(decodeXml(t));
      return _;
    });
    if (texts.length === 0) return para;

    const joined = texts.join("");
    const trimmed = joined.trim();
    if (!trimmed) {
      paraIdx++;
      return para;
    }

    let replacement: string | null = null;
    if (trimmed.includes("{{")) {
      const replaced = applyValues(trimmed, values);
      if (replaced !== trimmed) replacement = replaced;
    } else {
      const key = `__text_${slideIndex}_${paraIdx}`;
      if (values[key] !== undefined && values[key] !== trimmed) replacement = values[key];
    }
    paraIdx++;
    if (replacement === null) return para;

    let i = 0;
    return para.replace(/<a:t(\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (_full, attrs: string | undefined) => {
      const open = `<a:t${attrs ?? ""}>`;
      if (i++ === 0) return `${open}${escapeXml(replacement!)}</a:t>`;
      return `${open}</a:t>`;
    });
  });

  return out;
}

/** Extract per-slide placeholder + image-slot metadata from a PPTX buffer. */
export async function extractSlides(buffer: Buffer): Promise<PptTemplateSlide[]> {
  const zip = await JSZip.loadAsync(buffer);
  const paths = await orderedSlidePaths(zip);
  const { cx: slideCx, cy: slideCy } = await readPresentationSlideSize(zip);
  const slides: PptTemplateSlide[] = [];

  for (let i = 0; i < paths.length; i++) {
    const file = zip.file(paths[i]);
    if (!file) continue;
    const xml = await file.async("string");
    const ridToMedia = await readSlideRelsMap(zip, paths[i]);

    const namedPlaceholders = collectPlaceholders(xml);
    const { imageKeys: namedImageKeys } = splitPlaceholders(namedPlaceholders);

    const extracted = extractSlideBlocks(xml, i, slideCx, slideCy, ridToMedia);

    let imageKeys = extracted.imageKeys.length
      ? extracted.imageKeys
      : [...namedImageKeys];

    const mediaFromRels = await slideMediaTargets(zip, paths[i]);
    const media =
      extracted.mediaOrder.length > 0
        ? extracted.mediaOrder
        : mediaFromRels;

    if (imageKeys.length === 0 && media.length > 0) {
      imageKeys = media.map((_, idx) => `__img_${idx}`);
      media.forEach((_, idx) => {
        if (!extracted.blocks.some((b) => b.key === `__img_${idx}`)) {
          extracted.blocks.push({
            key: `__img_${idx}`,
            kind: "image",
            x: 0.55,
            y: 0.15 + idx * 0.28,
            w: 0.4,
            h: 0.35,
            imageIndex: idx,
          });
        }
      });
    } else if (imageKeys.length < media.length) {
      for (let j = imageKeys.length; j < media.length; j++) {
        imageKeys.push(`__img_${j}`);
        extracted.blocks.push({
          key: `__img_${j}`,
          kind: "image",
          x: 0.55,
          y: 0.15 + j * 0.28,
          w: 0.4,
          h: 0.35,
          imageIndex: j,
        });
      }
    }

    const sizes = await readMediaSizes(zip, media.slice(0, imageKeys.length));
    const imageMeta = imageKeys.map((_, idx) => sizes[idx] ?? { width: 0, height: 0 });

    // Prefer named image placeholders in keys if present
    if (namedImageKeys.length > 0 && extracted.imageKeys.length === 0) {
      imageKeys = namedImageKeys;
    }

    // Smart default layout: first image = background; text overlays on top
    const textBlocksSorted = extracted.blocks
      .filter((b) => b.kind === "text")
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const imageBlocksSorted = extracted.blocks
      .filter((b) => b.kind === "image")
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const fgImages = imageBlocksSorted.slice(1);
    const bodyTextCount = Math.max(0, textBlocksSorted.length - 1);
    const useLeftColumn = fgImages.length > 0 && bodyTextCount > 0;
    const titleBottom = textBlocksSorted.length > 0 ? 0.15 : 0.04;

    const fittedBlocks: typeof extracted.blocks = [];

    textBlocksSorted.forEach((b, i) => {
      if (i === 0) {
        fittedBlocks.push({ ...b, x: 0.04, y: 0.03, w: 0.92, h: 0.1, z: 30 });
        return;
      }
      fittedBlocks.push({
        ...b,
        x: 0.04,
        y: titleBottom + 0.02 + (i - 1) * 0.12,
        w: useLeftColumn ? 0.4 : 0.55,
        h: Math.max(0.1, Math.min(0.22, b.h < 0.08 ? 0.12 : b.h)),
        z: 31 + (i - 1),
      });
    });

    function fitMetaInBox(
      meta: { width: number; height: number } | undefined,
      box: { x: number; y: number; w: number; h: number }
    ) {
      const pw = meta?.width ?? 0;
      const ph = meta?.height ?? 0;
      if (pw > 0 && ph > 0) {
        const aspect = pw / ph;
        let w = box.w;
        let h = w / aspect;
        if (h > box.h) {
          h = box.h;
          w = h * aspect;
        }
        return {
          x: box.x + (box.w - w) / 2,
          y: box.y + (box.h - h) / 2,
          w,
          h,
        };
      }
      return box;
    }

    // First image → full-bleed background by default
    if (imageBlocksSorted[0]) {
      fittedBlocks.push({
        ...imageBlocksSorted[0],
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        z: 0,
      });
    }

    if (fgImages.length === 1) {
      const b = fgImages[0];
      const box = useLeftColumn
        ? { x: 0.46, y: titleBottom, w: 0.5, h: 0.8 }
        : { x: 0.5, y: titleBottom, w: 0.46, h: 0.75 };
      fittedBlocks.push({
        ...b,
        ...fitMetaInBox(imageMeta[b.imageIndex ?? 1], box),
        z: 10,
      });
    } else if (fgImages.length > 1) {
      const cols = fgImages.length <= 2 ? fgImages.length : 2;
      const rows = Math.ceil(fgImages.length / cols) || 1;
      const gap = 0.02;
      const cellW = (useLeftColumn ? 0.5 : 0.46) / cols - gap;
      const cellH = 0.75 / rows - gap;
      const baseX = useLeftColumn ? 0.46 : 0.5;
      fgImages.forEach((b, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const box = {
          x: baseX + col * (cellW + gap),
          y: titleBottom + row * (cellH + gap),
          w: cellW,
          h: cellH,
        };
        fittedBlocks.push({
          ...b,
          ...fitMetaInBox(imageMeta[b.imageIndex ?? i + 1], box),
          z: 10 + i,
        });
      });
    }

    const placeholders = [
      ...new Set([...extracted.textKeys, ...imageKeys, ...namedPlaceholders]),
    ];

    slides.push({
      index: i,
      label: `Page ${i + 1}`,
      placeholders,
      textKeys: extracted.textKeys,
      imageKeys,
      textDefaults: extracted.textDefaults,
      imageMeta,
      blocks: fittedBlocks,
    });
  }

  return slides;
}

/** Extract unique {{placeholder}} keys from a PPTX buffer. */
export async function extractPlaceholders(buffer: Buffer): Promise<string[]> {
  const slides = await extractSlides(buffer);
  return [...new Set(slides.flatMap((s) => s.placeholders))].sort();
}

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
  const textValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (isImagePlaceholder(k)) continue;
    if (/^(ach|lib):/.test(v)) continue;
    textValues[k] = v;
  }

  const zip = await JSZip.loadAsync(templateBuffer);
  const slidePaths = await orderedSlidePaths(zip);
  const slideIndexByPath = new Map(slidePaths.map((p, i) => [p, i]));

  const files = Object.keys(zip.files).filter(
    (n) => n.startsWith("ppt/") && n.endsWith(".xml") && !zip.files[n].dir
  );

  for (const name of files) {
    const xml = await zip.files[name].async("string");
    const slideIndex = slideIndexByPath.get(name);
    const filled =
      slideIndex !== undefined
        ? fillSlideTextXml(xml, textValues, slideIndex)
        : fillXml(xml, textValues);
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

/** Read embedded image buffer from a template slide by slot index. */
export async function readTemplateSlideImage(
  templateBuffer: Buffer,
  slideIndex: number,
  imageIndex: number
): Promise<{ buffer: Buffer; mime: string } | null> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const paths = await orderedSlidePaths(zip);
  const slidePath = paths[slideIndex];
  if (!slidePath) return null;

  const mediaPaths = await slideMediaTargets(zip, slidePath);
  const mediaPath = mediaPaths[imageIndex];
  if (!mediaPath) return null;

  const file = zip.file(mediaPath);
  if (!file) return null;

  const buffer = Buffer.from(await file.async("nodebuffer"));
  const ext = path.extname(mediaPath).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".gif"
        ? "image/gif"
        : ext === ".webp"
          ? "image/webp"
          : "image/png";
  return { buffer, mime };
}

/**
 * Replace embedded images on each slide by slot order.
 * slideImages[slideIndex] = buffers in imageKeys order.
 */
export async function replaceSlideImages(
  pptxBuffer: Buffer,
  slideImages: Record<number, Buffer[]>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const paths = await orderedSlidePaths(zip);

  for (const [indexStr, buffers] of Object.entries(slideImages)) {
    const index = Number(indexStr);
    if (!Number.isFinite(index) || index < 0 || index >= paths.length) continue;
    if (!buffers?.length) continue;

    const mediaTargets = await slideMediaTargets(zip, paths[index]);
    for (let i = 0; i < Math.min(buffers.length, mediaTargets.length); i++) {
      const target = mediaTargets[i];
      const buf = buffers[i];
      if (!buf || !target) continue;
      zip.file(target, buf);
    }
  }

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return Buffer.from(out);
}

/** Tiny 1x1 PNG used as replaceable image slot in seed templates. */
function placeholderPng(): string {
  // 1x1 purple pixel PNG base64
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

async function mergePptxSlides(baseBuf: Buffer, extraBuf: Buffer): Promise<Buffer> {
  const base = await JSZip.loadAsync(baseBuf);
  const extra = await JSZip.loadAsync(extraBuf);

  const baseSlides = await orderedSlidePaths(base);
  const extraSlides = await orderedSlidePaths(extra);
  if (extraSlides.length === 0) return baseBuf;

  let contentTypes = (await base.file("[Content_Types].xml")?.async("string")) ?? "";
  let presentation = (await base.file("ppt/presentation.xml")?.async("string")) ?? "";
  let rels = (await base.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? "";

  let nextSlideNum =
    baseSlides.reduce((max, p) => {
      const n = Number(/slide(\d+)/.exec(p)?.[1] ?? 0);
      return Math.max(max, n);
    }, 0) + 1;

  const ridMatches = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  let nextRid = (ridMatches.length ? Math.max(...ridMatches) : 10) + 1;

  const sldIdMatches = [...presentation.matchAll(/id="(\d+)"/g)].map((m) => Number(m[1]));
  let nextSldId = (sldIdMatches.length ? Math.max(...sldIdMatches) : 256) + 1;

  for (const extraPath of extraSlides) {
    const slideXml = await extra.file(extraPath)?.async("string");
    if (!slideXml) continue;

    const newPath = `ppt/slides/slide${nextSlideNum}.xml`;
    base.file(newPath, slideXml);

    const extraRelsPath = extraPath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const extraRels = await extra.file(extraRelsPath)?.async("string");
    if (extraRels) {
      base.file(`ppt/slides/_rels/slide${nextSlideNum}.xml.rels`, extraRels);
    }

    if (!contentTypes.includes(newPath)) {
      contentTypes = contentTypes.replace(
        "</Types>",
        `<Override PartName="/${newPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`
      );
    }

    const rid = `rId${nextRid}`;
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${nextSlideNum}.xml"/></Relationships>`
    );

    if (presentation.includes("</p:sldIdLst>")) {
      presentation = presentation.replace(
        "</p:sldIdLst>",
        `<p:sldId id="${nextSldId}" r:id="${rid}"/></p:sldIdLst>`
      );
    }

    nextSlideNum += 1;
    nextRid += 1;
    nextSldId += 1;
  }

  base.file("[Content_Types].xml", contentTypes);
  base.file("ppt/presentation.xml", presentation);
  base.file("ppt/_rels/presentation.xml.rels", rels);

  const out = await base.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(out);
}

/** Append simple text slides after filling a template (for user-added pages). */
export async function appendTextSlides(
  pptxBuffer: Buffer,
  pages: { title: string; body: string }[]
): Promise<Buffer> {
  if (pages.length === 0) return pptxBuffer;

  const pptx = new PptxGenJS();
  pptx.author = "Symbiosis Lab";
  pptx.layout = "LAYOUT_16x9";
  for (const page of pages) {
    const s = pptx.addSlide();
    s.addText(page.title || "新页面", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 26,
      bold: true,
      color: "660874",
    });
    if (page.body) {
      s.addText(page.body, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 3.5,
        fontSize: 16,
        color: "333333",
        valign: "top",
      });
    }
  }
  const extra = Buffer.from((await pptx.write({ outputType: "nodebuffer" })) as ArrayBuffer);

  try {
    return await mergePptxSlides(pptxBuffer, extra);
  } catch {
    return pptxBuffer;
  }
}

async function writePptxGen(pptx: PptxGenJS): Promise<Buffer> {
  const raw = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(raw as ArrayBuffer);
}

async function buildGovernmentTemplate(): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Symbiosis Lab";
  pptx.title = "政府汇报模板";
  pptx.layout = "LAYOUT_16x9";
  const ph = placeholderPng();

  const cover = pptx.addSlide();
  cover.addText("政府工作汇报", {
    x: 0.5,
    y: 1.5,
    w: 5,
    h: 0.7,
    fontSize: 32,
    bold: true,
    color: "660874",
  });
  cover.addText("汇报日期：{{date}}", { x: 0.5, y: 2.5, w: 5, h: 0.4, fontSize: 16 });
  cover.addText("汇报单位：{{unit}}", { x: 0.5, y: 3.0, w: 5, h: 0.4, fontSize: 16 });
  cover.addImage({ data: `data:image/png;base64,${ph}`, x: 5.4, y: 0.8, w: 4.2, h: 4.0 });

  const progress = pptx.addSlide();
  progress.addText("科研进展", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: "660874",
  });
  progress.addText("{{achievements}}", { x: 0.4, y: 1.0, w: 4.2, h: 3.2, fontSize: 16 });
  progress.addImage({ data: `data:image/png;base64,${ph}`, x: 4.9, y: 1.0, w: 4.6, h: 3.6 });
  progress.addText("备注：{{remarks}}", { x: 0.4, y: 4.5, w: 9.2, h: 0.5, fontSize: 14, color: "666666" });

  const funding = pptx.addSlide();
  funding.addText("经费与总结", {
    x: 0.4,
    y: 0.3,
    w: 9.2,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: "660874",
  });
  funding.addText("横向课题经费：{{funding_amount}}", { x: 0.4, y: 1.1, w: 9.2, h: 0.45, fontSize: 18 });
  funding.addText("总结：{{summary}}", { x: 0.4, y: 1.7, w: 4.2, h: 2.8, fontSize: 16 });
  funding.addImage({ data: `data:image/png;base64,${ph}`, x: 4.9, y: 1.6, w: 4.6, h: 3.2 });

  return writePptxGen(pptx);
}

async function buildFundingTemplate(): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Symbiosis Lab";
  pptx.title = "融资汇报模板";
  pptx.layout = "LAYOUT_16x9";
  const ph = placeholderPng();

  const cover = pptx.addSlide();
  cover.addText("融资汇报", {
    x: 0.5,
    y: 1.6,
    w: 5,
    h: 0.7,
    fontSize: 32,
    bold: true,
    color: "660874",
  });
  cover.addText("汇报日期：{{date}}", { x: 0.5, y: 2.6, w: 5, h: 0.4, fontSize: 16 });
  cover.addImage({ data: `data:image/png;base64,${ph}`, x: 6.0, y: 1.2, w: 3.4, h: 3.4 });

  const deal = pptx.addSlide();
  deal.addText("融资要点", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: "660874",
  });
  deal.addText("投资方：{{investor}}", { x: 0.5, y: 1.2, w: 5, h: 0.4, fontSize: 16 });
  deal.addText("融资金额：{{funding_amount}}", { x: 0.5, y: 1.8, w: 5, h: 0.4, fontSize: 16 });
  deal.addText("核心亮点：{{highlights}}", { x: 0.5, y: 2.5, w: 5, h: 1.8, fontSize: 16 });
  deal.addImage({ data: `data:image/png;base64,${ph}`, x: 5.8, y: 1.2, w: 3.6, h: 3.2 });

  const team = pptx.addSlide();
  team.addText("团队介绍", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.55,
    fontSize: 26,
    bold: true,
    color: "660874",
  });
  team.addText("{{team}}", { x: 0.5, y: 1.2, w: 5, h: 3, fontSize: 16 });
  team.addImage({ data: `data:image/png;base64,${ph}`, x: 5.8, y: 1.2, w: 3.6, h: 3.2 });

  return writePptxGen(pptx);
}

function templateFromMeta(
  id: string,
  name: string,
  slides: PptTemplateSlide[],
  uploadedBy: string
): PptTemplate {
  return {
    id,
    name,
    slides,
    placeholders: [...new Set(slides.flatMap((s) => s.placeholders))].sort(),
    uploadedBy,
    createdAt: new Date().toISOString(),
  };
}

function normalizeSlide(slide: PptTemplateSlide): PptTemplateSlide {
  const placeholders = slide.placeholders ?? [];
  const textDefaults = slide.textDefaults ?? {};
  const textKeys =
    slide.textKeys?.length
      ? slide.textKeys
      : placeholders.filter((k) => !isImagePlaceholder(k));
  const imageKeys =
    slide.imageKeys?.length
      ? slide.imageKeys
      : placeholders.filter((k) => isImagePlaceholder(k));
  const imageMeta = slide.imageMeta ?? imageKeys.map(() => ({ width: 0, height: 0 }));
  const blocks = slide.blocks ?? [];
  return { ...slide, placeholders, textKeys, imageKeys, textDefaults, imageMeta, blocks };
}

/** Ensure default PPT templates exist on disk + in metadata list. */
export async function ensureSeedPptTemplates(existing: PptTemplate[]): Promise<PptTemplate[]> {
  ensurePptDir();
  const seeds: { name: string; build: () => Promise<Buffer> }[] = [
    { name: "政府汇报模板", build: buildGovernmentTemplate },
    { name: "融资汇报模板", build: buildFundingTemplate },
  ];

  const next = existing.map((t) => ({
    ...t,
    slides: (Array.isArray(t.slides) ? t.slides : []).map(normalizeSlide),
    placeholders: t.placeholders ?? [],
  }));

  // Always refresh system seeds so image slots / multi-page layout stay current
  for (const seed of seeds) {
    const existingIdx = next.findIndex((t) => t.name === seed.name && t.uploadedBy === "system");
    const id = existingIdx >= 0 ? next[existingIdx].id : uid("ppt");
    const buffer = await seed.build();
    fs.writeFileSync(templateFilePath(id), buffer);
    const slides = await extractSlides(buffer);
    const meta = templateFromMeta(id, seed.name, slides, "system");
    if (existingIdx >= 0) {
      next[existingIdx] = { ...meta, createdAt: next[existingIdx].createdAt };
    } else {
      next.push(meta);
    }
  }

  for (let i = 0; i < next.length; i++) {
    if (next[i].uploadedBy === "system") continue;
    const buf = readTemplateFile(next[i].id);
    if (!buf) continue;
    try {
      const slides = await extractSlides(buf);
      next[i] = {
        ...next[i],
        slides,
        placeholders: [...new Set(slides.flatMap((s) => s.placeholders))].sort(),
      };
    } catch {
      /* keep as-is */
    }
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
