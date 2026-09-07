"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { FluentInput } from "@/components/fluent/FluentField";
import { api } from "@/lib/api/client";
import { isPhoneLocked, isPlaceholderEmail } from "@/lib/account-status";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [personType, setPersonType] = useState("");
  const [contactExtra, setContactExtra] = useState("");
  const [nickname, setNickname] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(isPlaceholderEmail(user.email) ? "" : user.email || "");
    setPhone(user.phone || "");
    setSchool(user.school || "");
    setDepartment(user.department || "");
    setEmployeeId(user.employeeId?.startsWith("LEGACY-") ? "" : user.employeeId || "");
    setPersonType(user.personType || "");
    setContactExtra(user.contactExtra || "");
    setNickname(user.nickname || "");
  }, [user]);

  if (!user) return null;

  const phoneEditable = !isPhoneLocked(user);

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
        ...(phoneEditable ? { phone } : {}),
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
        invalid_phone: "请填写有效的 11 位手机号",
        phone_exists: "该手机号已被其他账号占用",
        phone_locked: "手机号登录账号不可修改手机号",
        employee_id_exists: "学号/工号已被占用",
        email_exists: "邮箱已被占用",
        roster_mismatch: "姓名与手机号须与课题组名单一致，请联系系统管理员核对后修改",
      };
      setErr(map[code] || code || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setPwdSaving(true);
    setPwdMsg("");
    setPwdErr("");
    if (newPassword.length < 6) {
      setPwdErr("新密码至少 6 位");
      setPwdSaving(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdErr("两次输入的新密码不一致");
      setPwdSaving(false);
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwdMsg("密码已修改，请使用新密码登录。");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      const code = (e as { code?: string }).code || "";
      const map: Record<string, string> = {
        wrong_password: "当前密码不正确",
        password_too_short: "新密码至少 6 位",
        password_unchanged: "新密码不能与当前密码相同",
        invalid_body: "请填写当前密码与新密码",
      };
      setPwdErr(map[code] || code || "修改失败");
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader title="个人信息" subtitle="可查看与修改实名信息；必填项不可删除清空" />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-24 md:p-6">
        <GlassPanel className="mx-auto max-w-xl space-y-3">
          <FluentInput
            label={phoneEditable ? "手机号" : "手机号（登录凭证，不可改）"}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!phoneEditable}
            placeholder={phoneEditable ? "11 位手机号" : undefined}
          />
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
            {phoneEditable
              ? "邮箱登录账号可修改手机号。账号实名信息用于实验室管理与追溯，必填项不可留空。"
              : "手机号验证登录的账号，手机号为登录凭证不可修改。其余实名信息可改但不可留空。"}
          </p>
        </GlassPanel>

        <GlassPanel className="mx-auto max-w-xl space-y-3">
          <h3 className="text-sm font-semibold text-thu">修改登录密码</h3>
          <p className="text-xs text-lab-muted">
            用于邮箱密码登录。请先输入当前密码，再设置新密码（至少 6 位）。
          </p>
          <FluentInput
            label="当前密码 *"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <FluentInput
            label="新密码 *"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <FluentInput
            label="确认新密码 *"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {pwdErr ? <p className="text-sm text-rose-700">{pwdErr}</p> : null}
          {pwdMsg ? <p className="text-sm text-emerald-800">{pwdMsg}</p> : null}
          <FluentButton disabled={pwdSaving} onClick={() => void changePassword()}>
            {pwdSaving ? "提交中…" : "修改密码"}
          </FluentButton>
        </GlassPanel>
      </div>
    </div>
  );
}
