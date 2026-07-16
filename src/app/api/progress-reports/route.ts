import { NextRequest } from "next/server";
import { getCurrentUser, jsonError, jsonOk } from "@/server/auth";
import { canAccessResearchAssistant } from "@/lib/roles";
import { getStore, mutateStore, uid, publicUser } from "@/server/store";
import { ProgressReport } from "@/types";
import { getISOWeekNum, isLabStudent } from "@/lib/progress";

/**
 * GET /api/progress-reports
 * - RA/admin: all reports (+ lab members roster for the week)
 * - Student: own reports (by student_name = current user name)
 * Query: ?week_num=N (optional)
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const weekParam = req.nextUrl.searchParams.get("week_num");
  const weekNum = weekParam ? Number(weekParam) : getISOWeekNum();
  if (!Number.isFinite(weekNum) || weekNum < 1) return jsonError("invalid_week", 400);

  const store = getStore();
  const isRa = canAccessResearchAssistant(user.roles);

  const reports = store.progressReports
    .filter((r) => r.weekNum === weekNum)
    .filter((r) => (isRa ? true : r.studentName === user.name))
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const labMembers = isRa
    ? store.users.filter((u) => isLabStudent(u.roles)).map((u) => publicUser(u))
    : [];

  return jsonOk({
    weekNum,
    reports,
    labMembers,
  });
}

/**
 * POST /api/progress-reports — student submits weekly report
 * Body: { content, blockers, week_num?, student_name? }
 * student_name defaults to current user's name.
 * Upserts if the same student already submitted this week.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const content = String(body.content ?? "").trim();
  const blockers = String(body.blockers ?? "").trim();
  if (!content) return jsonError("invalid_body", 400);

  const weekNum = body.week_num != null ? Number(body.week_num) : getISOWeekNum();
  if (!Number.isFinite(weekNum) || weekNum < 1) return jsonError("invalid_week", 400);

  // RA/admin may submit on behalf of a student; students use own name
  let studentName = String(body.student_name ?? body.studentName ?? "").trim();
  if (!studentName) {
    studentName = user.name;
  } else if (!canAccessResearchAssistant(user.roles) && studentName !== user.name) {
    return jsonError("forbidden", 403);
  }

  const now = new Date().toISOString();
  let report: ProgressReport | null = null;

  await mutateStore((s) => {
    const existingIdx = s.progressReports.findIndex(
      (r) => r.studentName === studentName && r.weekNum === weekNum
    );
    if (existingIdx >= 0) {
      s.progressReports[existingIdx] = {
        ...s.progressReports[existingIdx],
        content,
        blockers,
        submittedAt: now,
      };
      report = s.progressReports[existingIdx];
    } else {
      report = {
        id: uid("pr"),
        studentName,
        weekNum,
        content,
        blockers,
        submittedAt: now,
      };
      s.progressReports.push(report);
    }
  });

  return jsonOk({ report }, { status: 201 });
}
