"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getUsers, setCachePartial } from "@/lib/storage/db";
import { api, PublicUser } from "@/lib/api/client";
import { Role } from "@/types";
import { ALL_ROLES } from "@/lib/roles";
import clsx from "clsx";

type EditForm = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  password: string;
  roles: Role[];
};

export default function AdminUsersPage() {
  const { t } = useLocale();
  const { user, updateUserRoles } = useAuth();
  const [users, setUsers] = useState(getUsers());
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Role[]>>({});
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdOk, setCreatedOk] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    department: "",
    roles: ["user"] as Role[],
  });
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editOk, setEditOk] = useState(false);
  const [listMsg, setListMsg] = useState("");
  const [listError, setListError] = useState("");
  const [busyId, setBusyId] = useState("");

  function applyList(list: PublicUser[]) {
    setCachePartial({ users: list });
    setUsers(list as ReturnType<typeof getUsers>);
    setDraft(Object.fromEntries(list.map((u) => [u.id, [...u.roles]])));
  }

  useEffect(() => {
    (async () => {
      try {
        const { users: list } = await api.users();
        applyList(list);
      } catch {
        const list = getUsers();
        setUsers(list);
        setDraft(Object.fromEntries(list.map((u) => [u.id, [...u.roles]])));
      }
    })();
  }, []);

  if (!user?.roles.includes("super_admin")) {
    return <div className="p-6 text-sm text-red-600">403</div>;
  }

  function errText(code: string, fallback: string) {
    return t.auth.errors[code as keyof typeof t.auth.errors] ?? fallback;
  }

  function toggle(userId: string, role: Role) {
    setDraft((d) => {
      const current = d[userId] ?? [];
      const has = current.includes(role);
      let next = has ? current.filter((r) => r !== role) : [...current, role];
      if (!next.includes("user")) next = [...next, "user"];
      return { ...d, [userId]: next };
    });
  }

  function toggleCreateRole(role: Role) {
    setForm((f) => {
      if (role === "user") return f;
      const has = f.roles.includes(role);
      const next = has ? f.roles.filter((r) => r !== role) : [...f.roles, role];
      return { ...f, roles: next.includes("user") ? next : [...next, "user"] };
    });
  }

  function toggleEditRole(role: Role) {
    setEditing((f) => {
      if (!f || role === "user") return f;
      const has = f.roles.includes(role);
      const next = has ? f.roles.filter((r) => r !== role) : [...f.roles, role];
      return { ...f, roles: next.includes("user") ? next : [...next, "user"] };
    });
  }

  async function saveRoles(userId: string) {
    setListError("");
    try {
      await updateUserRoles(userId, draft[userId] ?? ["user"]);
      const { users: list } = await api.users();
      applyList(list);
      setSaved(userId);
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "update_failed";
      setListError(errText(code, t.admin.updateFailed));
    }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const { users: list } = await api.createUser(form);
      applyList(list);
      setForm({ name: "", email: "", password: "", phone: "", department: "", roles: ["user"] });
      setCreatedOk(true);
      setTimeout(() => setCreatedOk(false), 2500);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "create_failed";
      setCreateError(errText(code, t.admin.createFailed));
    } finally {
      setCreating(false);
    }
  }

  function startEdit(u: PublicUser) {
    setEditError("");
    setEditOk(false);
    setEditing({
      userId: u.id,
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      department: u.department || "",
      password: "",
      roles: [...u.roles],
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    setEditError("");
    setEditOk(false);
    try {
      const { users: list } = await api.updateUser({
        userId: editing.userId,
        name: editing.name,
        email: editing.email,
        phone: editing.phone,
        department: editing.department,
        roles: editing.roles,
        ...(editing.password.trim() ? { password: editing.password.trim() } : {}),
      });
      applyList(list);
      setEditOk(true);
      setTimeout(() => {
        setEditing(null);
        setEditOk(false);
      }, 800);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "update_failed";
      setEditError(errText(code, t.admin.updateFailed));
    } finally {
      setEditBusy(false);
    }
  }

  async function removeUser(u: PublicUser) {
    setListError("");
    setListMsg("");
    if (!user || u.id === user.id) {
      setListError(t.admin.cannotDeleteSelf);
      return;
    }
    if (!confirm(`${t.admin.deleteConfirm}\n${u.name} (${u.email})`)) return;
    setBusyId(u.id);
    try {
      const { users: list } = await api.deleteUser(u.id);
      applyList(list);
      if (editing?.userId === u.id) setEditing(null);
      setListMsg(t.admin.deleteSuccess);
      setTimeout(() => setListMsg(""), 2500);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "delete_failed";
      setListError(errText(code, t.admin.deleteFailed));
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHeader title={t.admin.usersTitle} subtitle={t.admin.usersSubtitle} />
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <Card>
          <h3 className="mb-3 font-semibold text-thu">{t.admin.createTitle}</h3>
          <p className="mb-4 text-xs text-lab-muted">{t.admin.createHint}</p>
          <form onSubmit={(e) => void createAccount(e)} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label={t.auth.name}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label={t.auth.email}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <Input
                label={t.auth.password}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <Input
                label={t.auth.phone}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                label={t.auth.department}
                className="md:col-span-2"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-lab-muted">{t.admin.assignRoles}</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    disabled={role === "user"}
                    onClick={() => toggleCreateRole(role)}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      form.roles.includes(role)
                        ? "border-thu bg-thu-muted text-thu"
                        : "border-lab-border text-lab-muted hover:border-thu",
                      role === "user" && "opacity-70"
                    )}
                  >
                    {t.roles[role]}
                  </button>
                ))}
              </div>
            </div>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            {createdOk && <p className="text-sm text-emerald-700">{t.admin.createSuccess}</p>}
            <Button type="submit" disabled={creating}>
              {creating ? t.common.loading : t.admin.createAccount}
            </Button>
          </form>
        </Card>

        {editing ? (
          <Card>
            <h3 className="mb-2 font-semibold text-thu">{t.admin.editTitle}</h3>
            <p className="mb-4 text-xs text-lab-muted">{t.admin.editHint}</p>
            <form onSubmit={(e) => void saveEdit(e)} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label={t.auth.name}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
                <Input
                  label={t.auth.email}
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  required
                />
                <Input
                  label={t.auth.phone}
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
                <Input
                  label={t.admin.passwordOptional}
                  type="password"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="••••••"
                />
                <Input
                  label={t.auth.department}
                  className="md:col-span-2"
                  value={editing.department}
                  onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-lab-muted">{t.admin.assignRoles}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      disabled={role === "user"}
                      onClick={() => toggleEditRole(role)}
                      className={clsx(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        editing.roles.includes(role)
                          ? "border-thu bg-thu-muted text-thu"
                          : "border-lab-border text-lab-muted hover:border-thu",
                        role === "user" && "opacity-70"
                      )}
                    >
                      {t.roles[role]}
                    </button>
                  ))}
                </div>
              </div>
              {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
              {editOk ? <p className="text-sm text-emerald-700">{t.admin.updateSuccess}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={editBusy}>
                  {editBusy ? t.common.loading : t.admin.saveUser}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setEditError("");
                  }}
                >
                  {t.common.cancel}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {listError ? <p className="text-sm text-red-600">{listError}</p> : null}
        {listMsg ? <p className="text-sm text-emerald-700">{listMsg}</p> : null}

        {users.map((u) => (
          <Card key={u.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-thu">{u.name}</p>
                {u.nickname ? (
                  <p className="text-xs text-lab-muted">
                    {t.profile.nickname}: {u.nickname}
                  </p>
                ) : null}
                <p className="text-xs text-lab-muted">{u.email}</p>
                {u.phone ? <p className="text-xs text-lab-muted">{u.phone}</p> : null}
                <p className="text-xs text-lab-muted">{u.department}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggle(u.id, role)}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      (draft[u.id] ?? []).includes(role)
                        ? "border-thu bg-thu-muted text-thu"
                        : "border-lab-border text-lab-muted hover:border-thu"
                    )}
                  >
                    {t.roles[role]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void saveRoles(u.id)}>
                  {t.admin.saveRoles}
                </Button>
                <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                  {t.common.edit}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === u.id || u.id === user.id}
                  onClick={() => void removeUser(u)}
                >
                  {t.common.delete}
                </Button>
                {saved === u.id && <span className="text-xs text-thu">{t.admin.saved}</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
