import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid } from "@/server/store";
import { RaProject } from "@/types";

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

/** GET /api/ra-projects */
export async function GET() {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;
  const projects = [...getStore().raProjects];
  return jsonOk({ projects });
}

/** POST /api/ra-projects — create project */
export async function POST(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const due = String(body.due ?? "").trim();
  const status = (body.status ?? "active") as RaProject["status"];
  const progress = Math.max(0, Math.min(100, Number(body.progress ?? 0) || 0));

  if (!name || !due) return jsonError("invalid_body", 400);
  if (!["active", "paused", "done"].includes(status)) return jsonError("invalid_body", 400);

  const project: RaProject = {
    id: uid("proj"),
    name,
    status,
    progress,
    due,
    createdAt: new Date().toISOString(),
    createdBy: auth.user.id,
  };

  await mutateStore((s) => {
    s.raProjects = [project, ...s.raProjects];
  });

  return jsonOk({ project, projects: getStore().raProjects }, { status: 201 });
}
