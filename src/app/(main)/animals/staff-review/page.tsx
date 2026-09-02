"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { useAuth } from "@/context/AuthContext";
import { api, PublicUser } from "@/lib/api/client";
import { canReviewStaff, ACCOUNT_STATUS_LABELS } from "@/lib/account-status";

const ROLE_LABEL: Record<string, string> = {
  student: "学生（认领员）",
  technician: "技术员",
  supervisor: "动物房主管",
};

export default function StaffReviewPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PublicUser[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await api.staffReviewList();
      setPending(data.pending ?? []);
    } catch {
      setError("加载失败或无权限");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !canReviewStaff(user.roles)) {
    return <div className="p-6 text-sm text-red-600">403 — 仅动物房主管可审核人员</div>;
  }

  async function act(userId: string, action: "approve" | "reject") {
    setBusyId(userId);
    setError("");
    try {
      const data = await api.staffReviewAction({
        userId,
        action,
        reason: action === "reject" ? rejectReason[userId] : undefined,
      });
      setPending(data.pending ?? []);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code === "roster_mismatch"
          ? "无法通过：该人员姓名+手机号不在课题组名单中，请先让系统管理员录入名单"
          : "操作失败"
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="待审核人员"
        subtitle="实名建档审核 · 学生/技术员须已在课题组名单中方可审核通过"
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
        {!pending.length ? (
          <GlassPanel>
            <p className="text-sm text-lab-muted">暂无待审核人员</p>
          </GlassPanel>
        ) : (
          <ul className="space-y-3">
            {pending.map((u) => (
              <li key={u.id}>
                <GlassPanel>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-thu">{u.name || "（未填姓名）"}</p>
                      <p className="mt-1 text-sm text-lab-muted">
                        手机 {u.phone} · 学号/工号 {u.employeeId || "—"} · {u.department || "—"}
                      </p>
                      <p className="mt-1 text-xs">
                        人员类型：{u.personType || "—"} · 申请角色：
                        <span className="font-medium text-thu">
                          {ROLE_LABEL[u.appliedRole ?? ""] ?? u.appliedRole}
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-lab-muted">
                        状态：{ACCOUNT_STATUS_LABELS[u.accountStatus ?? "pending_review"]}
                        {u.profileSubmittedAt
                          ? ` · 提交于 ${u.profileSubmittedAt.slice(0, 19).replace("T", " ")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex min-w-[200px] flex-col gap-2">
                      <input
                        className="rounded-lg border border-lab-border px-2 py-1.5 text-xs"
                        placeholder="拒绝原因（拒绝时填写）"
                        value={rejectReason[u.id] ?? ""}
                        onChange={(e) =>
                          setRejectReason((m) => ({ ...m, [u.id]: e.target.value }))
                        }
                      />
                      <div className="flex gap-2">
                        <FluentButton
                          disabled={busyId === u.id}
                          onClick={() => void act(u.id, "approve")}
                        >
                          通过
                        </FluentButton>
                        <FluentButton
                          variant="outline"
                          disabled={busyId === u.id}
                          onClick={() => void act(u.id, "reject")}
                        >
                          拒绝
                        </FluentButton>
                      </div>
                    </div>
                  </div>
                </GlassPanel>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
