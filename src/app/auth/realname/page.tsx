"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AppliedBusinessRole } from "@/types";
import { canEditRealnameForm, isPlaceholderEmail, needsProfileCompletion } from "@/lib/account-status";

export default function RealnamePage() {
  const { user, loading, submitRealname, logout } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [personType, setPersonType] = useState("学生");
  const [contactExtra, setContactExtra] = useState("");
  const [appliedRole, setAppliedRole] = useState<AppliedBusinessRole>("student");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const st = user.accountStatus ?? "active";
    if (st === "active" && !needsProfileCompletion(user)) {
      router.replace("/");
      return;
    }
    if (user.name) setName(user.name);
    if (user.email && !isPlaceholderEmail(user.email)) setEmail(user.email);
    if (user.school) setSchool(user.school);
    if (user.department) setDepartment(user.department);
    if (user.employeeId && !user.employeeId.startsWith("LEGACY-")) {
      setEmployeeId(user.employeeId);
    }
    if (user.personType) setPersonType(user.personType);
    if (user.contactExtra) setContactExtra(user.contactExtra);
    if (user.appliedRole) setAppliedRole(user.appliedRole);
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-lab-muted">…</div>
    );
  }

  const st = user.accountStatus ?? "active";
  const showForm = canEditRealnameForm(user) && !submittedOk;
  const alreadyActive = st === "active";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await submitRealname({
      name,
      email,
      school,
      department,
      employeeId,
      personType,
      contactExtra,
      appliedRole,
    });
    setSaving(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        employee_id_exists: "该工号/学号已被占用",
        email_exists: "该邮箱已被占用",
        roster_mismatch: "姓名与手机号不在课题组名单中，无法使用本系统。请联系系统管理员将您录入名单后再认证。",
        invalid_email: "请填写有效邮箱",
        invalid_body: "请完整填写必填项",
        invalid_applied_role: "申请角色无效",
      };
      setError(map[res.error ?? ""] ?? res.error ?? "提交失败");
      return;
    }
    if (alreadyActive) {
      router.replace("/");
      return;
    }
    setSubmittedOk(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-thu-muted via-white to-tsinghua-yellow-light/30 p-4 pb-12">
      <div className="w-full max-w-lg rounded-xl border border-lab-border bg-white p-8 shadow-card">
        <h1 className="text-xl font-bold text-thu">完善个人资料</h1>
        <p className="mt-2 text-sm text-lab-muted">
          首次登录须完善实名信息。申请「学生」或「技术员」时，姓名与手机号须与系统管理员录入的课题组名单一致，否则无法使用本系统。
        </p>

        {(st === "pending_review" || submittedOk) && (
          <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            资料已提交，正在等待动物房主管审核。审核通过前无法认领小鼠、建档或创建实验。
          </div>
        )}
        {st === "rejected" && !submittedOk ? (
          <div className="mt-6 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">
            审核未通过{user.rejectReason ? `：${user.rejectReason}` : "。"}请修改后重新提交。
          </div>
        ) : null}
        {st === "disabled" ? (
          <div className="mt-6 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
            账号已停用，无法进行新的业务操作。历史记录仍保留。
          </div>
        ) : null}

        {showForm && (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
            <Input label="姓名 *" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="手机号（已验证，不可改）" value={user.phone ?? ""} disabled />
            <Input
              label="邮箱 *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu.cn"
              required
            />
            <Input
              label="学校 / 单位 *"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="例如 清华大学"
              required
            />
            <Input
              label="所属实验室/课题组 *"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
            />
            <Input
              label="学号 / 学生证号 / 工号 *"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="例如 2026123456"
              required
            />
            <Input
              label="人员类型 *"
              value={personType}
              onChange={(e) => setPersonType(e.target.value)}
              placeholder="学生 / 技术员 / 教职工…"
              required
            />
            <Input
              label="其他联系方式"
              value={contactExtra}
              onChange={(e) => setContactExtra(e.target.value)}
              placeholder="微信等（选填）"
            />
            {!alreadyActive ? (
              <div>
                <label className="mb-1 block text-xs text-lab-muted">申请角色 *</label>
                <select
                  className="w-full rounded-lg border border-lab-border px-3 py-2 text-sm"
                  value={appliedRole}
                  onChange={(e) => setAppliedRole(e.target.value as AppliedBusinessRole)}
                >
                  <option value="student">学生（小动物认领员）</option>
                  <option value="technician">技术员（小动物实验人员）</option>
                  <option value="supervisor">动物房主管</option>
                </select>
                <p className="mt-1 text-[11px] text-lab-muted">仅申请；通过后才有对应权限。</p>
              </div>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "提交中…" : alreadyActive ? "保存并继续" : "提交并等待审核"}
            </Button>
          </form>
        )}

        <button
          type="button"
          className="mt-6 w-full text-center text-xs text-lab-muted underline"
          onClick={() => void logout().then(() => router.replace("/login"))}
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
