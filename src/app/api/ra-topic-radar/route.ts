import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import { RaTopicItem, RaTopicKeyword, RaTopicSource } from "@/types";
import { isoWeekKey } from "@/lib/ra/topic-radar";

const SOURCES: RaTopicSource[] = [
  "linkedin",
  "x",
  "researchgate",
  "news",
  "paper",
  "other",
];

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

function isSource(v: unknown): v is RaTopicSource {
  return SOURCES.includes(v as RaTopicSource);
}

function sortItems(items: RaTopicItem[]) {
  return [...items].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    if (b.heat !== a.heat) return b.heat - a.heat;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** GET /api/ra-topic-radar?week=2026-W31 */
export async function GET(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const weekParam = req.nextUrl.searchParams.get("week")?.trim();
  const weekKey = weekParam && /^\d{4}-W\d{2}$/.test(weekParam) ? weekParam : isoWeekKey();
  const store = getStore();
  const keywords = store.raTopicKeywords ?? [];
  const items = sortItems((store.raTopicItems ?? []).filter((i) => i.weekKey === weekKey));

  return jsonOk({ weekKey, keywords, items });
}

/**
 * POST /api/ra-topic-radar
 * body.kind = "keyword" | "item"
 */
export async function POST(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  const now = new Date().toISOString();

  if (kind === "keyword") {
    const label = String(body.label ?? "").trim();
    if (!label) return jsonError("invalid_body", 400);
    const exists = (getStore().raTopicKeywords ?? []).some(
      (k) => k.label.toLowerCase() === label.toLowerCase()
    );
    if (exists) return jsonError("duplicate_keyword", 409);

    const item: RaTopicKeyword = {
      id: uid("rtk"),
      label,
      source: "manual",
      createdBy: auth.user.id,
      createdAt: now,
    };
    await mutateStore((s) => {
      s.raTopicKeywords = [item, ...(s.raTopicKeywords ?? [])];
    });
    return jsonOk({ keyword: item, keywords: getStore().raTopicKeywords }, { status: 201 });
  }

  if (kind === "item") {
    const title = String(body.title ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!title || !url) return jsonError("invalid_body", 400);
    if (!/^https?:\/\//i.test(url)) return jsonError("invalid_url", 400);

    const source = isSource(body.source) ? body.source : "other";
    let heat = Number(body.heat);
    if (!Number.isFinite(heat)) heat = 50;
    heat = Math.max(1, Math.min(100, Math.round(heat)));

    const weekKey =
      typeof body.weekKey === "string" && /^\d{4}-W\d{2}$/.test(body.weekKey)
        ? body.weekKey
        : isoWeekKey();

    const keywordIds = Array.isArray(body.keywordIds)
      ? body.keywordIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    const item: RaTopicItem = {
      id: uid("rti"),
      weekKey,
      title,
      url,
      source,
      heat,
      summary: String(body.summary ?? "").trim(),
      keywordIds,
      starred: Boolean(body.starred),
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
    };

    await mutateStore((s) => {
      s.raTopicItems = [item, ...(s.raTopicItems ?? [])];
    });

    const weekItems = sortItems(
      (getStore().raTopicItems ?? []).filter((i) => i.weekKey === weekKey)
    );
    return jsonOk({ item, items: weekItems, weekKey }, { status: 201 });
  }

  return jsonError("invalid_kind", 400);
}

/** PATCH /api/ra-topic-radar — update item fields */
export async function PATCH(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return jsonError("invalid_body", 400);

  let updated: RaTopicItem | null = null;
  await mutateStore((s) => {
    const list = s.raTopicItems ?? [];
    const idx = list.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const prev = list[idx];
    const next: RaTopicItem = { ...prev, updatedAt: new Date().toISOString() };
    if (body.title != null) next.title = String(body.title).trim() || prev.title;
    if (body.url != null) {
      const url = String(body.url).trim();
      if (/^https?:\/\//i.test(url)) next.url = url;
    }
    if (body.source != null && isSource(body.source)) next.source = body.source;
    if (body.heat != null) {
      let heat = Number(body.heat);
      if (Number.isFinite(heat)) next.heat = Math.max(1, Math.min(100, Math.round(heat)));
    }
    if (body.summary != null) next.summary = String(body.summary).trim();
    if (Array.isArray(body.keywordIds)) {
      next.keywordIds = body.keywordIds.map((x: unknown) => String(x)).filter(Boolean);
    }
    if (body.starred != null) next.starred = Boolean(body.starred);
    list[idx] = next;
    s.raTopicItems = list;
    updated = next;
  });

  if (!updated) return jsonError("not_found", 404);
  const weekKey = (updated as RaTopicItem).weekKey;
  const items = sortItems((getStore().raTopicItems ?? []).filter((i) => i.weekKey === weekKey));
  return jsonOk({ item: updated, items, weekKey });
}

/** DELETE /api/ra-topic-radar?kind=keyword|item&id= */
export async function DELETE(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  if (!kind || !id) return jsonError("invalid_body", 400);

  if (kind === "keyword") {
    let found = false;
    await mutateStore((s) => {
      const before = (s.raTopicKeywords ?? []).length;
      s.raTopicKeywords = (s.raTopicKeywords ?? []).filter((k) => k.id !== id);
      found = s.raTopicKeywords.length < before;
      // Drop refs from items
      s.raTopicItems = (s.raTopicItems ?? []).map((item) => ({
        ...item,
        keywordIds: item.keywordIds.filter((kid) => kid !== id),
      }));
    });
    if (!found) return jsonError("not_found", 404);
    return jsonOk({ ok: true, keywords: getStore().raTopicKeywords });
  }

  if (kind === "item") {
    let weekKey = "";
    let found = false;
    await mutateStore((s) => {
      const prev = (s.raTopicItems ?? []).find((i) => i.id === id);
      weekKey = prev?.weekKey ?? "";
      const before = (s.raTopicItems ?? []).length;
      s.raTopicItems = (s.raTopicItems ?? []).filter((i) => i.id !== id);
      found = s.raTopicItems.length < before;
    });
    if (!found) return jsonError("not_found", 404);
    const items = weekKey
      ? sortItems((getStore().raTopicItems ?? []).filter((i) => i.weekKey === weekKey))
      : [];
    return jsonOk({ ok: true, items, weekKey });
  }

  return jsonError("invalid_kind", 400);
}
