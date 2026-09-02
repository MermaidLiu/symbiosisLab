"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput } from "@/components/fluent/FluentField";
import { api } from "@/lib/api/client";
import { isPlaceholderEmail } from "@/lib/account-status";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [personType, setPersonType] = useState("");
  const [contactExtra, setContactExtra] = useState("");
  const [nickname, setNickname] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(isPlaceholderEmail(user.email) ? "" : user.email || "");
    setSchool(user.school || "");
    setDepartment(user.department || "");
    setEmployeeId(user.employeeId?.startsWith("LEGACY-") ? "" : user.employeeId || "");
    setPersonType(user.personType || "");
    setContactExtra(user.contactExtra || "");
    setNickname(user.nickname || "");
  }, [user]);

  if (!user) return null;

  async function save() {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const { user: updated, warning } = await api.updateProfile({
        name,
        email,
        school,
        department,
        employeeId,
        personType,
        contactExtra,
        nickname,
      });
      void updated;
      await refreshUser();
      if (warning === "nickname_taken") {
        setMsg("已保存。提示：花名与他人重复，建议换一个。");
      } else {
        setMsg("已保存。实名信息可修改，但不可删除清空。");
      }
    } catch (e) {
      const code = (e as { code?: string }).code || "";
      const map: Record<string, string> = {
        required_fields_cannot_clear: "姓名、邮箱、学校、学号、实验室等必填项不可清空",
        invalid_email: "请填写有效邮箱",
        employee_id_exists: "学号/工号已被占用",
        email_exists: "邮箱已被占用",
        roster_mismatch: "姓名与手机号须与课题组名单一致，请联系系统管理员核对后修改",
      };
      setErr(map[code] || code || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title="个人信息" subtitle="可查看与修改实名信息；必填项不可删除清空" />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        <GlassPanel className="mx-auto max-w-xl space-y-3">
          <FluentInput label="手机号" value={user.phone || "—"} disabled />
          <FluentInput label="姓名 *" value={name} onChange={(e) => setName(e.target.value)} />
          <FluentInput
            label="邮箱 *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FluentInput label="学校 / 单位 *" value={school} onChange={(e) => setSchool(e.target.value)} />
          <FluentInput
            label="实验室 / 课题组 *"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
          <FluentInput
            label="学号 / 学生证号 / 工号 *"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
          <FluentInput
            label="人员类型 *"
            value={personType}
            onChange={(e) => setPersonType(e.target.value)}
          />
          <FluentInput
            label="其他联系方式"
            value={contactExtra}
            onChange={(e) => setContactExtra(e.target.value)}
          />
          <FluentInput
            label="花名（选填）"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="显示用，可不填"
          />
          {err ? <p className="text-sm text-rose-700">{err}</p> : null}
          {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}
          <FluentButton disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存修改"}
          </FluentButton>
          <p className="text-[11px] text-lab-muted">
            账号实名信息用于实验室管理与追溯，保存后仍可修改，但系统不允许删除或留空必填项。
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
