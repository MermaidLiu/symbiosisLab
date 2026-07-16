import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore } from "@/server/store";
import { RaAnalyticsMetrics } from "@/types";

async function requireRa() {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("unauthorized", 401) as NextResponse };
  if (!canAccessResearchAssistant(user.roles)) {
    return { error: jsonError("forbidden", 403) as NextResponse };
  }
  return { user };
}

function defaultMetrics(userId: string): RaAnalyticsMetrics {
  return {
    papersYtd: 0,
    experimentsWeek: 0,
    fundingUsedPct: 0,
    labMembersActive: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
}

/** GET /api/ra-analytics */
export async function GET() {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;
  const metrics = getStore().raAnalytics ?? defaultMetrics(auth.user.id);
  return jsonOk({ metrics });
}

/** PUT /api/ra-analytics — RA manual entry */
export async function PUT(req: NextRequest) {
  const auth = await requireRa();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const papersYtd = Number(body.papersYtd);
  const experimentsWeek = Number(body.experimentsWeek);
  const fundingUsedPct = Number(body.fundingUsedPct);
  const labMembersActive = Number(body.labMembersActive);

  if (![papersYtd, experimentsWeek, fundingUsedPct, labMembersActive].every(Number.isFinite)) {
    return jsonError("invalid_body", 400);
  }
  if (fundingUsedPct < 0 || fundingUsedPct > 100) return jsonError("invalid_funding", 400);

  const metrics: RaAnalyticsMetrics = {
    papersYtd: Math.max(0, Math.round(papersYtd)),
    experimentsWeek: Math.max(0, Math.round(experimentsWeek)),
    fundingUsedPct: Math.min(100, Math.max(0, Math.round(fundingUsedPct))),
    labMembersActive: Math.max(0, Math.round(labMembersActive)),
    updatedAt: new Date().toISOString(),
    updatedBy: auth.user.id,
  };

  await mutateStore((s) => {
    s.raAnalytics = metrics;
  });

  return jsonOk({ metrics });
}
