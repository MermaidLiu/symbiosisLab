import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore } from "@/server/store";
import { Todo } from "@/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  let updated: Todo | null = null;
  await mutateStore((s) => {
    const idx = s.todos.findIndex((t) => t.id === id && t.userId === user.id);
    if (idx < 0) return;
    const next = { ...s.todos[idx] };
    if (typeof body.title === "string" && body.title.trim()) {
      next.title = body.title.trim();
    }
    if (typeof body.completed === "boolean") {
      next.completed = body.completed;
    }
    next.updatedAt = new Date().toISOString();
    s.todos[idx] = next;
    updated = next;
  });

  if (!updated) return jsonError("not_found", 404);
  return jsonOk({ todo: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const { id } = await params;
  let found = false;
  await mutateStore((s) => {
    const before = s.todos.length;
    s.todos = s.todos.filter((t) => !(t.id === id && t.userId === user.id));
    found = s.todos.length < before;
  });

  if (!found) return jsonError("not_found", 404);
  return jsonOk({ ok: true });
}
