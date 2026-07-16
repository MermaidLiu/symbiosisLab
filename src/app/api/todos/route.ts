import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import { Todo } from "@/types";

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const date = req.nextUrl.searchParams.get("date") ?? todayStr();
  const todos = getStore()
    .todos.filter((t) => t.userId === user.id && t.date === date)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  return jsonOk({ todos, date });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);
  if (!canAccessResearchAssistant(user.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return jsonError("invalid_body", 400);

  const now = new Date().toISOString();
  const todo: Todo = {
    id: uid("todo"),
    userId: user.id,
    title,
    completed: false,
    date: String(body.date ?? todayStr()),
    createdAt: now,
    updatedAt: now,
  };

  await mutateStore((s) => {
    s.todos.push(todo);
  });

  return jsonOk({ todo }, { status: 201 });
}
