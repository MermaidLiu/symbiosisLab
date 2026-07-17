"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput } from "@/components/fluent/FluentField";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { useLocale } from "@/components/providers/LocaleProvider";
import { PptTemplate } from "@/types";

export function TemplateLibrary() {
  const { t, locale } = useLocale();
  const p = t.ra.pptGenerator;
  const m = t.ra.templateLibrary;
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const [templates, setTemplates] = useState<PptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ppt-templates", { credentials: "same-origin" });
      if (!res.ok) throw new Error("load");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setError(p.loadError);
    } finally {
      setLoading(false);
    }
  }, [p.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

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
      if (!res.ok) throw new Error("upload");
      const data = await res.json();
      setTemplates((prev) => [...prev, data.template as PptTemplate]);
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
    try {
      const res = await fetch(`/api/ppt-templates/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("delete");
      setTemplates((prev) => prev.filter((x) => x.id !== id));
      showToast(p.deleteSuccess);
    } catch {
      setError(p.deleteError);
    }
  }

  return (
    <RaPageShell title={t.nav.raTemplates}>
      {toast && (
        <div className="fixed right-4 top-20 z-50 rounded-lg border border-thu/20 bg-white/95 px-4 py-2 text-sm text-thu shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      <GlassPanel className="mb-4">
        <p className="text-sm text-lab-muted">{m.hint}</p>
      </GlassPanel>

      <GlassPanel className="mb-4">
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
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-thu/10 file:px-3 file:py-1.5 file:text-sm file:text-thu"
            />
          </div>
          <FluentButton type="button" variant="secondary" disabled={uploading} onClick={() => void uploadTemplate()}>
            {uploading ? p.uploading : p.upload}
          </FluentButton>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </GlassPanel>

      <GlassPanel>
        <h3 className="mb-4 text-base font-semibold text-thu">{m.listTitle}</h3>
        {loading ? (
          <p className="text-sm text-lab-muted">{t.common.loading}</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-lab-muted">{m.empty}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-white/40 bg-white/30 px-4 py-3"
              >
                <div>
                  <h4 className="font-semibold text-thu">{tpl.name}</h4>
                  <p className="mt-1 text-xs text-lab-muted">
                    {p.placeholdersLabel}:{" "}
                    {tpl.placeholders.length
                      ? tpl.placeholders.map((k) => `{{${k}}}`).join(", ")
                      : p.noPlaceholders}
                  </p>
                  <p className="mt-1 text-[10px] text-lab-muted">
                    {new Date(tpl.createdAt).toLocaleString(localeStr)}
                    {tpl.uploadedBy === "system" ? ` · ${m.systemTemplate}` : ""}
                  </p>
                </div>
                {tpl.uploadedBy !== "system" && (
                  <FluentButton type="button" variant="outline" size="sm" onClick={() => void removeTemplate(tpl.id)}>
                    {p.deleteTemplate}
                  </FluentButton>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </RaPageShell>
  );
}
