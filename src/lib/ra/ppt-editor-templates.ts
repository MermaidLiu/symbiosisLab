export type PptFieldType = "text" | "textarea" | "image";

export type PptPreviewLayout =
  | "cover"
  | "patent"
  | "metrics"
  | "highlights"
  | "paper"
  | "results";

export interface PptFieldDef {
  key: string;
  type: PptFieldType;
  /** i18n key under t.ra.pptEditor.fields */
  labelKey: string;
  fullWidth?: boolean;
}

export interface PptPageDef {
  id: string;
  /** i18n key under t.ra.pptEditor.pages */
  labelKey: string;
  previewLayout: PptPreviewLayout;
  fields: PptFieldDef[];
}

export interface PptWorkbenchTemplate {
  id: string;
  /** i18n key under t.ra.pptEditor.templates */
  labelKey: string;
  pages: PptPageDef[];
}

export const PPT_WORKBENCH_TEMPLATES: PptWorkbenchTemplate[] = [
  {
    id: "gov-report-v1",
    labelKey: "govReport",
    pages: [
      {
        id: "cover",
        labelKey: "cover",
        previewLayout: "cover",
        fields: [
          { key: "title", type: "text", labelKey: "title" },
          { key: "subtitle", type: "text", labelKey: "subtitle" },
          { key: "date", type: "text", labelKey: "date" },
          { key: "coverImage", type: "image", labelKey: "coverImage", fullWidth: true },
        ],
      },
      {
        id: "patent",
        labelKey: "patent",
        previewLayout: "patent",
        fields: [
          { key: "title", type: "text", labelKey: "patentTitle" },
          { key: "patentNo", type: "text", labelKey: "patentNo" },
          { key: "achievementImage", type: "image", labelKey: "achievementImage", fullWidth: true },
          { key: "summary", type: "textarea", labelKey: "summary", fullWidth: true },
        ],
      },
      {
        id: "metrics",
        labelKey: "metrics",
        previewLayout: "metrics",
        fields: [
          { key: "title", type: "text", labelKey: "sectionTitle" },
          { key: "metric1", type: "text", labelKey: "metric1" },
          { key: "metric2", type: "text", labelKey: "metric2" },
          { key: "metric3", type: "text", labelKey: "metric3" },
          { key: "chartImage", type: "image", labelKey: "chartImage", fullWidth: true },
          { key: "progressNote", type: "textarea", labelKey: "progressNote", fullWidth: true },
        ],
      },
    ],
  },
  {
    id: "funding-report-v1",
    labelKey: "fundingReport",
    pages: [
      {
        id: "cover",
        labelKey: "cover",
        previewLayout: "cover",
        fields: [
          { key: "title", type: "text", labelKey: "title" },
          { key: "tagline", type: "text", labelKey: "tagline" },
          { key: "date", type: "text", labelKey: "date" },
          { key: "coverImage", type: "image", labelKey: "coverImage", fullWidth: true },
        ],
      },
      {
        id: "highlights",
        labelKey: "highlights",
        previewLayout: "highlights",
        fields: [
          { key: "fundingAmount", type: "text", labelKey: "fundingAmount" },
          { key: "investor", type: "text", labelKey: "investor" },
          { key: "dealImage", type: "image", labelKey: "dealImage", fullWidth: true },
          { key: "highlights", type: "textarea", labelKey: "highlights", fullWidth: true },
        ],
      },
      {
        id: "team",
        labelKey: "team",
        previewLayout: "results",
        fields: [
          { key: "teamTitle", type: "text", labelKey: "teamTitle" },
          { key: "teamImage", type: "image", labelKey: "teamImage", fullWidth: true },
          { key: "teamDesc", type: "textarea", labelKey: "teamDesc", fullWidth: true },
        ],
      },
    ],
  },
  {
    id: "academic-share-v1",
    labelKey: "academicShare",
    pages: [
      {
        id: "cover",
        labelKey: "cover",
        previewLayout: "cover",
        fields: [
          { key: "title", type: "text", labelKey: "title" },
          { key: "presenter", type: "text", labelKey: "presenter" },
          { key: "date", type: "text", labelKey: "date" },
          { key: "heroImage", type: "image", labelKey: "heroImage", fullWidth: true },
        ],
      },
      {
        id: "paper",
        labelKey: "paper",
        previewLayout: "paper",
        fields: [
          { key: "paperTitle", type: "text", labelKey: "paperTitle" },
          { key: "journal", type: "text", labelKey: "journal" },
          { key: "paperImage", type: "image", labelKey: "paperImage", fullWidth: true },
          { key: "abstract", type: "textarea", labelKey: "abstract", fullWidth: true },
        ],
      },
      {
        id: "results",
        labelKey: "results",
        previewLayout: "results",
        fields: [
          { key: "resultTitle", type: "text", labelKey: "resultTitle" },
          { key: "resultImage", type: "image", labelKey: "resultImage", fullWidth: true },
          { key: "conclusion", type: "textarea", labelKey: "conclusion", fullWidth: true },
        ],
      },
    ],
  },
];

export function getWorkbenchTemplate(id: string): PptWorkbenchTemplate | undefined {
  return PPT_WORKBENCH_TEMPLATES.find((t) => t.id === id);
}

export function emptyPageFields(template: PptWorkbenchTemplate): Record<number, Record<string, string>> {
  const pages: Record<number, Record<string, string>> = {};
  template.pages.forEach((page, index) => {
    pages[index] = {};
    for (const field of page.fields) {
      pages[index][field.key] = "";
    }
  });
  return pages;
}

/** Asset refs: ach:{id} | lib:{id} */
export function assetRefToUrl(ref: string): string {
  if (!ref) return "";
  if (ref.startsWith("ach:")) return `/api/ra-achievements/${ref.slice(4)}/file`;
  if (ref.startsWith("lib:")) return `/api/ra-image-library/${ref.slice(4)}/file`;
  if (ref.startsWith("/api/")) return ref;
  return ref;
}

export interface DragAssetPayload {
  kind: "achievement" | "library";
  id: string;
  title: string;
  thumbUrl: string;
}

export function assetRefFromPayload(payload: DragAssetPayload): string {
  return payload.kind === "achievement" ? `ach:${payload.id}` : `lib:${payload.id}`;
}

export function parseDragAssetPayload(raw: string): DragAssetPayload | null {
  try {
    const parsed = JSON.parse(raw) as DragAssetPayload;
    if (!parsed?.id || !parsed?.kind) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface SlideData {
  templateId: string;
  currentPage: number;
  pages: Record<number, Record<string, string>>;
}

export function createInitialSlideData(templateId: string): SlideData {
  const template = getWorkbenchTemplate(templateId) ?? PPT_WORKBENCH_TEMPLATES[0];
  return {
    templateId: template.id,
    currentPage: 0,
    pages: emptyPageFields(template),
  };
}
