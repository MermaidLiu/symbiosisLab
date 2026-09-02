import { NextRequest } from "next/server";
import {
  getCurrentUser,
  jsonError,
  jsonOk,
  reviewStaffAccount,
} from "@/server/auth";
import { getStore, publicUser } from "@/server/store";
import { canReviewStaff } from "@/lib/account-status";

/** GET — 待审核人员列表（主管） */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return jsonError("unauthorized", 401);
  if (!canReviewStaff(me.roles)) return jsonError("forbidden", 403);

  const users = getStore().users.map((u) => publicUser(u));
  const pending = users.filter((u) => u.accountStatus === "pending_review");
  return jsonOk({ pending, users });
}

/**
 * POST — approve | reject | disable | enable
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return jsonError("unauthorized", 401);
  if (!canReviewStaff(me.roles)) return jsonError("forbidden", 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "") as "approve" | "reject" | "disable" | "enable";
  const targetUserId = String(body.userId ?? "");
  if (!targetUserId || !["approve", "reject", "disable", "enable"].includes(action)) {
    return jsonError("invalid_body", 400);
  }

  const result = await reviewStaffAccount({
    targetUserId,
    action,
    reason: body.reason ? String(body.reason) : undefined,
    actorId: me.id,
    actorName: me.name,
  });
  if (!result.ok) {
    const status = result.error === "roster_mismatch" ? 400 : 404;
    return jsonError(result.error, status);
  }

  return jsonOk({
    user: result.user,
    pending: getStore()
      .users.filter((u) => u.accountStatus === "pending_review")
      .map((u) => publicUser(u)),
  });
}
