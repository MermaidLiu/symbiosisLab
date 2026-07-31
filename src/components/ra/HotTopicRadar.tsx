"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput, FluentSelect } from "@/components/fluent/FluentField";
import { RaPageShell } from "@/components/ra/RaPageShell";
import { useLocale } from "@/components/providers/LocaleProvider";
import { isoWeekKey, shiftWeekKey } from "@/lib/ra/topic-radar";
import { RaTopicItem, RaTopicKeyword, RaTopicSource } from "@/types";

const SOURCE_OPTIONS: RaTopicSource[] = [
  "linkedin",
  "x",
  "researchgate",
  "news",
  "paper",
  "other",
];

export function HotTopicRadar() {
  const { t } = useLocale();
  const m = t.ra.hotTopicRadar;

  const [weekKey, setWeekKey] = useState(() => isoWeekKey());
  const [keywords, setKeywords] = useState<RaTopicKeyword[]>([]);
  const [items, setItems] = useState<RaTopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [newKeyword, setNewKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<RaTopicSource>("linkedin");
  const [heat, setHeat] = useState("70");
  const [summary, setSummary] = useState("");
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<string[]>([]);

  const keywordMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of keywords) map.set(k.id, k.label);
    return map;
  }, [keywords]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch(`/api/ra-topic-radar?week=${encodeURIComponent(weekKey)}`, {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("load");
        const data = await res.json();
        if (cancelled) return;
        setKeywords(data.keywords ?? []);
        setItems(data.items ?? []);
      } catch {
        if (!cancelled) setError(m.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekKey, m.loadError]);

  async function addKeyword() {
    const label = newKeyword.trim();
    if (!label) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ra-topic-radar", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "keyword", label }),
      });
      if (res.status === 409) {
        setError(m.duplicateKeyword);
        return;
      }
      if (!res.ok) throw new Error("add");
      const data = await res.json();
      setKeywords(data.keywords ?? []);
      setNewKeyword("");
    } catch {
      setError(m.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function removeKeyword(id: string) {
    if (!window.confirm(m.deleteKeywordConfirm)) return;
    try {
      const res = await fetch(
        `/api/ra-topic-radar?kind=keyword&id=${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("del");
      const data = await res.json();
      setKeywords(data.keywords ?? []);
      setSelectedKeywordIds((prev) => prev.filter((x) => x !== id));
    } catch {
      setError(m.saveError);
    }
  }

  function toggleKeywordSelect(id: string) {
    setSelectedKeywordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function addItem() {
    if (!title.trim() || !url.trim()) {
      setError(m.needTitleUrl);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/ra-topic-radar", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "item",
          weekKey,
          title: title.trim(),
          url: url.trim(),
          source,
          heat: Number(heat) || 50,
          summary: summary.trim(),
          keywordIds: selectedKeywordIds,
        }),
      });
      if (!res.ok) throw new Error("add");
      const data = await res.json();
      setItems(data.items ?? []);
      setTitle("");
      setUrl("");
      setSummary("");
      setHeat("70");
      setSelectedKeywordIds([]);
    } catch {
      setError(m.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStar(item: RaTopicItem) {
    try {
      const res = await fetch("/api/ra-topic-radar", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, starred: !item.starred }),
      });
      if (!res.ok) throw new Error("patch");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError(m.saveError);
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm(m.deleteItemConfirm)) return;
    try {
      const res = await fetch(
        `/api/ra-topic-radar?kind=item&id=${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("del");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError(m.saveError);
    }
  }

  return (
    <RaPageShell title={t.nav.raHotTopicRadar}>
      <p className="mb-4 text-sm text-lab-muted">{m.hint}</p>

      {error ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <GlassPanel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-lab-muted">{m.weekLabel}</p>
            <h3 className="text-lg font-semibold text-lab-text">{weekKey}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <FluentButton
              variant="secondary"
              onClick={() => setWeekKey((w) => shiftWeekKey(w, -1))}
            >
              {m.prevWeek}
            </FluentButton>
            <FluentButton variant="secondary" onClick={() => setWeekKey(isoWeekKey())}>
              {m.thisWeek}
            </FluentButton>
            <FluentButton
              variant="secondary"
              onClick={() => setWeekKey((w) => shiftWeekKey(w, 1))}
            >
              {m.nextWeek}
            </FluentButton>
          </div>
        </div>
      </GlassPanel>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <GlassPanel>
          <h3 className="mb-1 text-base font-semibold text-lab-text">{m.keywordsTitle}</h3>
          <p className="mb-3 text-xs text-lab-muted">{m.keywordsHint}</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {keywords.map((k) => (
              <span
                key={k.id}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs",
                  k.source === "system"
                    ? "bg-thu/10 text-thu"
                    : "bg-amber-50 text-amber-800"
                )}
              >
                {k.label}
                <button
                  type="button"
                  className="ml-1 text-lab-muted hover:text-rose-600"
                  aria-label={m.deleteKeyword}
                  onClick={() => void removeKeyword(k.id)}
                >
                  ×
                </button>
              </span>
            ))}
            {!keywords.length ? (
              <span className="text-xs text-lab-muted">{m.noKeywords}</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <FluentInput
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder={m.keywordPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addKeyword();
                }
              }}
            />
            <FluentButton disabled={saving} onClick={() => void addKeyword()}>
              {m.addKeyword}
            </FluentButton>
          </div>
        </GlassPanel>

        <GlassPanel>
          <h3 className="mb-1 text-base font-semibold text-lab-text">{m.addItemTitle}</h3>
          <p className="mb-3 text-xs text-lab-muted">{m.addItemHint}</p>
          <div className="space-y-2">
            <FluentInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={m.titlePlaceholder}
            />
            <FluentInput
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={m.urlPlaceholder}
            />
            <div className="grid grid-cols-2 gap-2">
              <FluentSelect
                value={source}
                onChange={(e) => setSource(e.target.value as RaTopicSource)}
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {m.sources[s]}
                  </option>
                ))}
              </FluentSelect>
              <FluentInput
                type="number"
                min={1}
                max={100}
                value={heat}
                onChange={(e) => setHeat(e.target.value)}
                placeholder={m.heatPlaceholder}
              />
            </div>
            <textarea
              className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={m.summaryPlaceholder}
              rows={3}
            />
            <div>
              <p className="mb-1 text-xs text-lab-muted">{m.tagKeywords}</p>
              <div className="flex flex-wrap gap-2">
                {keywords.map((k) => {
                  const on = selectedKeywordIds.includes(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKeywordSelect(k.id)}
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-xs transition",
                        on
                          ? "bg-thu text-white"
                          : "bg-white/70 text-lab-text ring-1 ring-black/5 hover:bg-white"
                      )}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <FluentButton disabled={saving} onClick={() => void addItem()}>
              {saving ? m.saving : m.addItem}
            </FluentButton>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-lab-text">{m.boardTitle}</h3>
          <span className="text-xs text-lab-muted">
            {m.itemCount.replace("{n}", String(items.length))}
          </span>
        </div>
        {loading ? (
          <p className="text-sm text-lab-muted">{m.loading}</p>
        ) : !items.length ? (
          <p className="text-sm text-lab-muted">{m.emptyBoard}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item, idx) => (
              <li
                key={item.id}
                className="rounded-xl bg-white/70 p-3 ring-1 ring-black/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-thu/10 px-1.5 py-0.5 text-[10px] font-semibold text-thu">
                        #{idx + 1}
                      </span>
                      <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-800">
                        {m.sources[item.source]}
                      </span>
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                        {m.heatLabel}: {item.heat}
                      </span>
                      {item.starred ? (
                        <span className="text-[10px] text-amber-600">{m.starred}</span>
                      ) : null}
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-thu hover:underline"
                    >
                      {item.title}
                    </a>
                    {item.summary ? (
                      <p className="mt-1 text-xs leading-relaxed text-lab-muted">
                        {item.summary}
                      </p>
                    ) : null}
                    {item.keywordIds.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.keywordIds.map((kid) => (
                          <span
                            key={kid}
                            className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-lab-muted"
                          >
                            {keywordMap.get(kid) ?? kid}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <FluentButton
                      variant="secondary"
                      onClick={() => void toggleStar(item)}
                    >
                      {item.starred ? m.unstar : m.star}
                    </FluentButton>
                    <FluentButton
                      variant="secondary"
                      onClick={() => void removeItem(item.id)}
                    >
                      {m.deleteItem}
                    </FluentButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </RaPageShell>
  );
}
