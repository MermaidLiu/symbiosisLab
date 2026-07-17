import fs from "fs";
import path from "path";
import PptxGenJS from "pptxgenjs";
import {
  getWorkbenchTemplate,
  PptPreviewLayout,
  PptWorkbenchTemplate,
} from "@/lib/ra/ppt-editor-templates";
import { getStore } from "@/server/store";
import { extFromFileName, readAchievementFile } from "@/server/ra-files";
import { readImageLibraryFile } from "@/server/ra-images";

const BRAND = "660874";
const MUTED = "666666";

type ImageResolver = (ref: string) => { data: string; mime: string } | null;

function resolveAssetRef(ref: string): { data: string; mime: string } | null {
  if (!ref) return null;
  const store = getStore();

  if (ref.startsWith("ach:")) {
    const id = ref.slice(4);
    const item = store.raAchievements.find((x) => x.id === id);
    if (!item) return null;
    const ext = extFromFileName(item.fileName);
    const buf = readAchievementFile(`${id}${ext}`);
    if (!buf) return null;
    const mime = item.mimeType || "image/png";
    return { data: `data:${mime};base64,${buf.toString("base64")}`, mime };
  }

  if (ref.startsWith("lib:")) {
    const id = ref.slice(4);
    const item = store.raImageLibrary.find((x) => x.id === id);
    if (!item) return null;
    const ext = extFromFileName(item.fileName);
    const buf = readImageLibraryFile(`${id}${ext}`);
    if (!buf) return null;
    const mime = item.mimeType || "image/png";
    return { data: `data:${mime};base64,${buf.toString("base64")}`, mime };
  }

  if (ref.startsWith("/api/ra-achievements/")) {
    const id = ref.split("/")[4];
    return resolveAssetRef(`ach:${id}`);
  }
  if (ref.startsWith("/api/ra-image-library/")) {
    const id = ref.split("/")[4];
    return resolveAssetRef(`lib:${id}`);
  }

  if (ref.startsWith("data:")) {
    return { data: ref, mime: ref.split(";")[0].slice(5) };
  }

  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return { data: ref, mime: "image/png" };
  }

  const localPath = path.isAbsolute(ref) ? ref : path.join(process.cwd(), ref);
  if (fs.existsSync(localPath)) {
    const buf = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mime =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : "image/png";
    return { data: `data:${mime};base64,${buf.toString("base64")}`, mime };
  }

  return null;
}

function pickImage(fields: Record<string, string>, keys: string[], resolve: ImageResolver) {
  for (const key of keys) {
    const img = resolve(fields[key] ?? "");
    if (img) return img;
  }
  return null;
}

function addCoverSlide(
  pptx: PptxGenJS,
  fields: Record<string, string>,
  resolve: ImageResolver
): void {
  const slide = pptx.addSlide();
  slide.background = { color: "F8F4FA" };
  const img = pickImage(fields, ["coverImage", "heroImage"], resolve);
  if (img) {
    slide.addImage({ data: img.data, x: 5.2, y: 0.45, w: 4.3, h: 4.6, sizing: { type: "cover", w: 4.3, h: 4.6 } });
  }
  slide.addText(fields.title || "汇报标题", {
    x: 0.5,
    y: 0.8,
    w: img ? 4.4 : 9,
    h: 0.9,
    fontSize: 30,
    bold: true,
    color: BRAND,
  });
  const sub = fields.subtitle || fields.tagline || fields.presenter || "";
  if (sub) {
    slide.addText(sub, { x: 0.5, y: 1.85, w: img ? 4.4 : 9, h: 0.5, fontSize: 16, color: MUTED });
  }
  if (fields.date) {
    slide.addText(fields.date, { x: 0.5, y: 4.6, w: 4, h: 0.35, fontSize: 14, color: MUTED });
  }
}

function addPatentSlide(
  pptx: PptxGenJS,
  fields: Record<string, string>,
  resolve: ImageResolver
): void {
  const slide = pptx.addSlide();
  slide.addText(fields.title || "专利展示", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.55,
    fontSize: 24,
    bold: true,
    color: BRAND,
  });
  if (fields.patentNo) {
    slide.addText(`专利号：${fields.patentNo}`, {
      x: 0.5,
      y: 1.0,
      w: 9,
      h: 0.35,
      fontSize: 14,
      color: MUTED,
    });
  }
  const img = pickImage(fields, ["achievementImage"], resolve);
  if (img) {
    slide.addImage({ data: img.data, x: 0.5, y: 1.5, w: 4.2, h: 3.5, sizing: { type: "contain", w: 4.2, h: 3.5 } });
  }
  if (fields.summary) {
    slide.addText(fields.summary, {
      x: img ? 5.0 : 0.5,
      y: 1.5,
      w: img ? 4.5 : 9,
      h: 3.5,
      fontSize: 14,
      color: "333333",
      valign: "top",
    });
  }
}

function addMetricsSlide(
  pptx: PptxGenJS,
  fields: Record<string, string>,
  resolve: ImageResolver
): void {
  const slide = pptx.addSlide();
  slide.addText(fields.title || "数据汇报", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.55,
    fontSize: 24,
    bold: true,
    color: BRAND,
  });
  const metrics = [fields.metric1, fields.metric2, fields.metric3].filter(Boolean);
  metrics.forEach((m, i) => {
    slide.addText(m!, {
      x: 0.5 + i * 3.1,
      y: 1.1,
      w: 2.8,
      h: 0.8,
      fontSize: 16,
      bold: true,
      color: BRAND,
      align: "center",
      fill: { color: "F3E8F7" },
    });
  });
  const img = pickImage(fields, ["chartImage"], resolve);
  if (img) {
    slide.addImage({ data: img.data, x: 0.5, y: 2.1, w: 4.5, h: 2.8, sizing: { type: "contain", w: 4.5, h: 2.8 } });
  }
  if (fields.progressNote) {
    slide.addText(fields.progressNote, {
      x: img ? 5.2 : 0.5,
      y: 2.1,
      w: img ? 4.3 : 9,
      h: 2.8,
      fontSize: 14,
      color: "333333",
      valign: "top",
    });
  }
}

function addHighlightsSlide(
  pptx: PptxGenJS,
  fields: Record<string, string>,
  resolve: ImageResolver
): void {
  const slide = pptx.addSlide();
  slide.addText("融资亮点", { x: 0.5, y: 0.35, w: 9, h: 0.55, fontSize: 24, bold: true, color: BRAND });
  if (fields.fundingAmount) {
    slide.addText(`融资金额：${fields.fundingAmount}`, { x: 0.5, y: 1.0, w: 4.5, h: 0.4, fontSize: 16 });
  }
  if (fields.investor) {
    slide.addText(`投资方：${fields.investor}`, { x: 0.5, y: 1.45, w: 4.5, h: 0.4, fontSize: 16 });
  }
  const img = pickImage(fields, ["dealImage"], resolve);
  if (img) {
    slide.addImage({ data: img.data, x: 5.0, y: 0.9, w: 4.5, h: 3.8, sizing: { type: "cover", w: 4.5, h: 3.8 } });
  }
  if (fields.highlights) {
    slide.addText(fields.highlights, {
      x: 0.5,
      y: 2.0,
      w: img ? 4.2 : 9,
      h: 2.6,
      fontSize: 14,
      color: "333333",
      valign: "top",
    });
  }
}

function addPaperSlide(
  pptx: PptxGenJS,
  fields: Record<string, string>,
  resolve: ImageResolver
): void {
  const slide = pptx.addSlide();
  slide.addText(fields.paperTitle || "论文展示", {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.55,
    fontSize: 24,
    bold: true,
    color: BRAND,
  });
  if (fields.journal) {
    slide.addText(fields.journal, { x: 0.5, y: 0.95, w: 9, h: 0.35, fontSize: 14, color: MUTED });
  }
  const img = pickImage(fields, ["paperImage"], resolve);
  if (img) {
    slide.addImage({ data: img.data, x: 0.5, y: 1.45, w: 4.2, h: 3.5, sizing: { type: "contain", w: 4.2, h: 3.5 } });
  }
  if (fields.abstract) {
    slide.addText(fields.abstract, {
      x: img ? 5.0 : 0.5,
      y: 1.45,
      w: img ? 4.5 : 9,
      h: 3.5,
      fontSize: 14,
      color: "333333",
      valign: "top",
    });
  }
}

function addResultsSlide(
  pptx: PptxGenJS,
  fields: Record<string, string>,
  resolve: ImageResolver
): void {
  const slide = pptx.addSlide();
  const title = fields.resultTitle || fields.teamTitle || "成果展示";
  slide.addText(title, { x: 0.5, y: 0.35, w: 9, h: 0.55, fontSize: 24, bold: true, color: BRAND });
  const img = pickImage(fields, ["resultImage", "teamImage"], resolve);
  if (img) {
    slide.addImage({ data: img.data, x: 0.5, y: 1.2, w: 4.5, h: 3.6, sizing: { type: "contain", w: 4.5, h: 3.6 } });
  }
  const body = fields.conclusion || fields.teamDesc || "";
  if (body) {
    slide.addText(body, {
      x: img ? 5.2 : 0.5,
      y: 1.2,
      w: img ? 4.3 : 9,
      h: 3.6,
      fontSize: 14,
      color: "333333",
      valign: "top",
    });
  }
}

function addSlideByLayout(
  pptx: PptxGenJS,
  layout: PptPreviewLayout,
  fields: Record<string, string>,
  resolve: ImageResolver
): void {
  switch (layout) {
    case "cover":
      addCoverSlide(pptx, fields, resolve);
      break;
    case "patent":
      addPatentSlide(pptx, fields, resolve);
      break;
    case "metrics":
      addMetricsSlide(pptx, fields, resolve);
      break;
    case "highlights":
      addHighlightsSlide(pptx, fields, resolve);
      break;
    case "paper":
      addPaperSlide(pptx, fields, resolve);
      break;
    case "results":
      addResultsSlide(pptx, fields, resolve);
      break;
  }
}

export async function buildPptxFromWorkbench(
  templateId: string,
  pages: Record<number, Record<string, string>>
): Promise<Buffer> {
  const template = getWorkbenchTemplate(templateId);
  if (!template) throw new Error("unknown_template");

  const pptx = new PptxGenJS();
  pptx.author = "Symbiosis Lab";
  pptx.title = templateId;
  pptx.layout = "LAYOUT_16x9";

  const resolve: ImageResolver = (ref) => resolveAssetRef(ref);

  template.pages.forEach((page, index) => {
    const fields = pages[index] ?? {};
    addSlideByLayout(pptx, page.previewLayout, fields, resolve);
  });

  const raw = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(raw as ArrayBuffer);
}

export function workbenchExportFilename(template: PptWorkbenchTemplate): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${template.id}-${stamp}.pptx`;
}
