import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import { RaWorkItem, RaWorkKind } from "@/types";
import { buildChecklist, getRaWorkModule, RA_WORK_MODULES } from "@/lib/ra/work-modules";

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

function isKind(v: unknown): v is RaWorkKind {
  return RA_WORK_MODULES.some((m) => m.kind === v);
}

/** GET /api/ra-work-items?kind=proposal */
export async function GET(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const kind = req.nextUrl.searchParams.get("kind");
  let items = getStore().raWorkItems ?? [];
  if (kind) {
    if (!isKind(kind)) return jsonError("invalid_kind", 400);
    items = items.filter((i) => i.kind === kind);
  }
  return jsonOk({ items });
}

/** POST /api/ra-work-items */
export async function POST(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as RaWorkKind;
  if (!isKind(kind)) return jsonError("invalid_kind", 400);

  const mod = getRaWorkModule(kind);
  const title = String(body.title ?? "").trim();
  if (!title) return jsonError("invalid_body", 400);

  const status = String(body.status ?? mod.defaultStatus);
  if (!mod.statuses.includes(status)) return jsonError("invalid_status", 400);

  const now = new Date().toISOString();
  const item: RaWorkItem = {
    id: uid("rwi"),
    kind,
    title,
    status,
    owner: String(body.owner ?? auth.user.name).trim() || auth.user.name,
    due: String(body.due ?? "").trim(),
    notes: String(body.notes ?? "").trim(),
    checklist: buildChecklist(mod.checklistLabels, () => uid("chk")),
    createdBy: auth.user.id,
    createdAt: now,
    updatedAt: now,
  };

  await mutateStore((s) => {
    s.raWorkItems = [item, ...(s.raWorkItems ?? [])];
  });

  return jsonOk({ item, items: getStore().raWorkItems }, { status: 201 });
}

/** PATCH /api/ra-work-items */
export async function PATCH(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return jsonError("invalid_body", 400);

  let updated: RaWorkItem | null = null;
  await mutateStore((s) => {
    const list = s.raWorkItems ?? [];
    const idx = list.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const prev = list[idx];
    const mod = getRaWorkModule(prev.kind);
    const next: RaWorkItem = {
      ...prev,
      title: body.title != null ? String(body.title).trim() || prev.title : prev.title,
      owner: body.owner != null ? String(body.owner).trim() : prev.owner,
      due: body.due != null ? String(body.due).trim() : prev.due,
      notes: body.notes != null ? String(body.notes).trim() : prev.notes,
      updatedAt: new Date().toISOString(),
    };
    if (body.status != null) {
      const status = String(body.status);
      if (!mod.statuses.includes(status)) return;
      next.status = status;
    }
    if (Array.isArray(body.checklist)) {
      next.checklist = body.checklist.map((c: { id?: string; label?: string; done?: boolean }) => ({
        id: String(c.id ?? uid("chk")),
        label: String(c.label ?? ""),
        done: Boolean(c.done),
      }));
    }
    if (body.checklistItemId != null) {
      const cid = String(body.checklistItemId);
      next.checklist = next.checklist.map((c) =>
        c.id === cid ? { ...c, done: body.done === undefined ? !c.done : Boolean(body.done) } : c
      );
    }
    list[idx] = next;
    s.raWorkItems = list;
    updated = next;
  });

  if (!updated) return jsonError("not_found", 404);
  return jsonOk({ item: updated, items: getStore().raWorkItems });
}

/** DELETE /api/ra-work-items?id= */
export async function DELETE(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("invalid_body", 400);

  let found = false;
  await mutateStore((s) => {
    const before = (s.raWorkItems ?? []).length;
    s.raWorkItems = (s.raWorkItems ?? []).filter((i) => i.id !== id);
    found = s.raWorkItems.length < before;
  });
  if (!found) return jsonError("not_found", 404);
  return jsonOk({ ok: true, items: getStore().raWorkItems });
}
