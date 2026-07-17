"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Todo } from "@/types";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function apiTodos(date: string): Promise<Todo[]> {
  const res = await fetch(`/api/todos?date=${encodeURIComponent(date)}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("fetch_failed");
  const data = await res.json();
  return data.todos as Todo[];
}

async function apiCreateTodo(title: string, date: string): Promise<Todo> {
  const res = await fetch("/api/todos", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, date }),
  });
  if (!res.ok) throw new Error("create_failed");
  const data = await res.json();
  return data.todo as Todo;
}

async function apiPatchTodo(id: string, patch: { completed?: boolean; title?: string }): Promise<Todo> {
  const res = await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("patch_failed");
  const data = await res.json();
  return data.todo as Todo;
}

async function apiDeleteTodo(id: string): Promise<void> {
  const res = await fetch(`/api/todos/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("delete_failed");
}

interface TodoListProps {
  onStatsChange?: (stats: { total: number; done: number; remaining: number }) => void;
  /** Tighter spacing for side panels / workbench */
  compact?: boolean;
}

export function TodoList({ onStatsChange, compact }: TodoListProps) {
  const { t, locale } = useLocale();
  const r = t.ra;
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const date = todayStr();
  const localeStr = locale === "zh" ? "zh-CN" : "en-US";

  const emitStats = useCallback(
    (list: Todo[]) => {
      const done = list.filter((x) => x.completed).length;
      onStatsChange?.({ total: list.length, done, remaining: list.length - done });
    },
    [onStatsChange]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await apiTodos(date);
      setTodos(list);
      emitStats(list);
    } catch {
      setError(r.syncError);
    } finally {
      setLoading(false);
    }
  }, [date, emitStats, r.syncError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setError("");
    try {
      const todo = await apiCreateTodo(title, date);
      setDraft("");
      setTodos((prev) => {
        const next = [...prev, todo];
        emitStats(next);
        return next;
      });
    } catch {
      setError(r.syncError);
    }
  }

  async function handleToggle(todo: Todo) {
    setBusyId(todo.id);
    setError("");
    const nextCompleted = !todo.completed;
    // optimistic
    setTodos((prev) => {
      const next = prev.map((x) => (x.id === todo.id ? { ...x, completed: nextCompleted } : x));
      emitStats(next);
      return next;
    });
    try {
      const updated = await apiPatchTodo(todo.id, { completed: nextCompleted });
      setTodos((prev) => {
        const next = prev.map((x) => (x.id === updated.id ? updated : x));
        emitStats(next);
        return next;
      });
    } catch {
      setTodos((prev) => {
        const next = prev.map((x) => (x.id === todo.id ? { ...x, completed: todo.completed } : x));
        emitStats(next);
        return next;
      });
      setError(r.syncError);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError("");
    const snapshot = todos;
    setTodos((prev) => {
      const next = prev.filter((x) => x.id !== id);
      emitStats(next);
      return next;
    });
    try {
      await apiDeleteTodo(id);
    } catch {
      setTodos(snapshot);
      emitStats(snapshot);
      setError(r.syncError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <GlassPanel className={compact ? "h-full" : undefined}>
      <div className={clsx("flex flex-wrap items-start justify-between gap-2", compact ? "mb-3" : "mb-4")}>
        <div>
          <h3 className={clsx("font-semibold text-thu", compact ? "text-sm" : "text-base")}>{r.todoTitle}</h3>
          <p className="mt-0.5 text-xs text-lab-muted">
            {new Date(`${date}T12:00:00`).toLocaleDateString(localeStr, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {!compact && (
              <>
                {" · "}
                {r.todoHint}
              </>
            )}
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className={clsx("flex gap-2", compact ? "mb-3" : "mb-4")}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={r.todoPlaceholder}
          className="fluent-input flex-1 rounded-lg px-3 py-2 text-sm"
        />
        <FluentButton type="submit" disabled={!draft.trim()}>
          {r.addTodo}
        </FluentButton>
      </form>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-lab-muted">{t.common.loading}</p>
      ) : todos.length === 0 ? (
        <p
          className={clsx(
            "rounded-lg border border-dashed border-white/50 bg-white/25 px-4 text-center text-sm text-lab-muted",
            compact ? "py-6" : "py-10"
          )}
        >
          {r.emptyTodos}
        </p>
      ) : (
        <ul className={clsx("space-y-2", compact && "max-h-56 overflow-y-auto pr-1")}>
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={clsx(
                "group flex items-center gap-3 rounded-lg border border-white/40 bg-white/35 px-3 py-2.5 transition-colors",
                todo.completed && "opacity-70"
              )}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                disabled={busyId === todo.id}
                onChange={() => void handleToggle(todo)}
                className="h-4 w-4 shrink-0 accent-thu"
                aria-label={todo.title}
              />
              <span
                className={clsx(
                  "flex-1 text-sm text-lab-text",
                  todo.completed && "text-lab-muted line-through"
                )}
              >
                {todo.title}
              </span>
              <button
                type="button"
                disabled={busyId === todo.id}
                onClick={() => void handleDelete(todo.id)}
                className="rounded px-2 py-1 text-xs text-lab-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              >
                {t.common.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
