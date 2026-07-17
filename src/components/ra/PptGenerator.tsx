"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { useLocale } from "@/components/providers/LocaleProvider";
import { PptTemplate } from "@/types";

const LONG_FIELDS = new Set([
  "achievements",
  "highlights",
  "remarks",
  "team",
  "content",
  "progress",
]);

interface PptGeneratorProps {
  /** Hide template upload — managed in 模版库 */
  hideUpload?: boolean;
}

export function PptGenerator({ hideUpload = false }: PptGeneratorProps) {
  const { t } = useLocale();
  const p = t.ra.pptGenerator;

  const [templates, setTemplates] = useState<PptTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const selected = templates.find((x) => x.id === templateId) ?? null;

  const fieldLabel = useCallback(
    (key: string) => {
      const map = p.fields as Record<string, string>;
      return map[key] ?? key;
    },
    [p.fields]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ppt-templates", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load_failed");
      const data = await res.json();
      const list = (data.templates ?? []) as PptTemplate[];
      setTemplates(list);
      setTemplateId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    } catch {
      setError(p.loadError);
    } finally {
      setLoading(false);
    }
  }, [p.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setValues({});
      return;
    }
    setValues((prev) => {
      const next: Record<string, string> = {};
      for (const key of selected.placeholders) {
        next[key] = prev[key] ?? "";
      }
      return next;
    });
  }, [selected]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function uploadTemplate() {
    if (!uploadName.trim() || !uploadFile) {
      setError(p.uploadNeedBoth);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("name", uploadName.trim());
      form.set("file", uploadFile);
      const res = await fetch("/api/ppt-templates", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (!res.ok) throw new Error("upload_failed");
      const data = await res.json();
      const tpl = data.template as PptTemplate;
      setTemplates((prev) => [...prev, tpl]);
      setTemplateId(tpl.id);
      setUploadName("");
      setUploadFile(null);
      showToast(p.uploadSuccess);
    } catch {
      setError(p.uploadError);
    } finally {
      setUploading(false);
    }
  }

  async function removeTemplate(id: string) {
    if (!window.confirm(p.deleteConfirm)) return;
    setError("");
    try {
      const res = await fetch(`/api/ppt-templates/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("delete_failed");
      setTemplates((prev) => prev.filter((x) => x.id !== id));
      showToast(p.deleteSuccess);
    } catch {
      setError(p.deleteError);
    }
  }

  async function generate() {
    if (!selected) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/ppt-templates/${selected.id}/generate`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (!res.ok) throw new Error("generate_failed");
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disp);
      const filename = decodeURIComponent(match?.[1] || match?.[2] || `${selected.name}.pptx`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(p.generateSuccess);
    } catch {
      setError(p.generateError);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed right-4 top-20 z-50 rounded-lg border border-thu/20 bg-white/95 px-4 py-2 text-sm text-thu shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      <GlassPanel>
        {!hideUpload && (
          <>
            <h2 className="text-lg font-semibold text-thu">{p.title}</h2>
            <p className="mt-1 text-xs text-lab-muted">{p.hint}</p>
          </>
        )}
        {hideUpload && (
          <>
            <h2 className="text-base font-semibold text-thu">{p.fillTitle}</h2>
            <p className="mt-1 text-xs text-lab-muted">{p.fillHint}</p>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="mt-4 text-sm text-lab-muted">{t.common.loading}</p>
        ) : (
          <div className={clsx("space-y-4", hideUpload ? "mt-0" : "mt-4")}>
            <div className="flex flex-wrap items-end gap-3">
              <FluentSelect
                label={p.selectTemplate}
                className="min-w-[220px] flex-1"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.length === 0 && <option value="">{p.noTemplates}</option>}
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </FluentSelect>
              {!hideUpload && selected && selected.uploadedBy !== "system" && (
                <FluentButton type="button" variant="outline" size="sm" onClick={() => void removeTemplate(selected.id)}>
                  {p.deleteTemplate}
                </FluentButton>
              )}
            </div>

            {selected && (
              <p className="text-xs text-lab-muted">
                {p.placeholdersLabel}:{" "}
                {selected.placeholders.length
                  ? selected.placeholders.map((k) => `{{${k}}}`).join(", ")
                  : p.noPlaceholders}
              </p>
            )}
          </div>
        )}
      </GlassPanel>

      {selected && selected.placeholders.length > 0 && (
        <GlassPanel>
          <h3 className="text-base font-semibold text-thu">{p.formTitle}</h3>
          <p className="mt-1 text-xs text-lab-muted">{p.formHint}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {selected.placeholders.map((key) =>
              LONG_FIELDS.has(key) ? (
                <div key={key} className="md:col-span-2">
                  <label className="mb-1 block text-[11px] font-medium text-lab-muted">
                    {fieldLabel(key)}
                  </label>
                  <textarea
                    rows={3}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={`{{${key}}}`}
                    className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <FluentInput
                  key={key}
                  label={fieldLabel(key)}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  placeholder={`{{${key}}}`}
                />
              )
            )}
          </div>
          <div className="mt-5">
            <FluentButton type="button" disabled={generating} onClick={() => void generate()}>
              {generating ? p.generating : p.generate}
            </FluentButton>
          </div>
        </GlassPanel>
      )}

      {selected && selected.placeholders.length === 0 && (
        <GlassPanel>
          <p className="text-sm text-lab-muted">{p.noPlaceholdersHint}</p>
        </GlassPanel>
      )}

      {!hideUpload && (
        <GlassPanel>
          <h3 className="text-base font-semibold text-thu">{p.uploadTitle}</h3>
          <p className="mt-1 text-xs text-lab-muted">{p.uploadHint}</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <FluentInput
              label={p.templateName}
              className="min-w-[180px] flex-1"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder={p.templateNamePlaceholder}
            />
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[11px] font-medium text-lab-muted">{p.chooseFile}</label>
              <input
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-lab-text file:mr-3 file:rounded-lg file:border-0 file:bg-thu/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-thu"
              />
            </div>
            <FluentButton type="button" variant="secondary" disabled={uploading} onClick={() => void uploadTemplate()}>
              {uploading ? p.uploading : p.upload}
            </FluentButton>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
