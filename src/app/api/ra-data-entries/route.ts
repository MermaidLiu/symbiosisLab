import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import { RaDataEntry } from "@/types";

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

/** GET /api/ra-data-entries */
export async function GET() {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;
  const entries = [...getStore().raDataEntries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return jsonOk({ entries });
}

/** POST /api/ra-data-entries — create or update (if id provided) */
export async function POST(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const category = String(body.category ?? "").trim();
  const label = String(body.label ?? "").trim();
  const value = String(body.value ?? "").trim();
  const unit = String(body.unit ?? "").trim();
  const note = String(body.note ?? "").trim();
  const id = body.id ? String(body.id) : "";

  if (!category || !label || !value) return jsonError("invalid_body", 400);

  const now = new Date().toISOString();

  if (id) {
    let updated: RaDataEntry | null = null;
    await mutateStore((s) => {
      const idx = s.raDataEntries.findIndex((e) => e.id === id);
      if (idx < 0) return;
      s.raDataEntries[idx] = {
        ...s.raDataEntries[idx],
        category,
        label,
        value,
        unit,
        note,
        updatedAt: now,
      };
      updated = s.raDataEntries[idx];
    });
    if (!updated) return jsonError("not_found", 404);
    return jsonOk({ entry: updated });
  }

  const entry: RaDataEntry = {
    id: uid("rde"),
    category,
    label,
    value,
    unit,
    note,
    createdBy: auth.user.id,
    createdAt: now,
    updatedAt: now,
  };
  await mutateStore((s) => {
    s.raDataEntries.push(entry);
  });
  return jsonOk({ entry }, { status: 201 });
}

/** DELETE /api/ra-data-entries?id= */
export async function DELETE(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return jsonError("id_required", 400);

  const exists = getStore().raDataEntries.some((e) => e.id === id);
  if (!exists) return jsonError("not_found", 404);

  await mutateStore((s) => {
    s.raDataEntries = s.raDataEntries.filter((e) => e.id !== id);
  });
  return jsonOk({ ok: true });
}
