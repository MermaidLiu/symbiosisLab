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

  useEffect(() => {
    (async () => {
      try {
        const { users: list } = await api.users();
        setCachePartial({ users: list });
        setUsers(list as ReturnType<typeof getUsers>);
        setDraft(Object.fromEntries(list.map((u) => [u.id, [...u.roles]])));
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

  async function save(userId: string) {
    await updateUserRoles(userId, draft[userId] ?? ["user"]);
    setUsers(getUsers());
    setSaved(userId);
    setTimeout(() => setSaved(null), 2000);
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const { users: list } = await api.createUser(form);
      setCachePartial({ users: list });
      setUsers(list as PublicUser[] as ReturnType<typeof getUsers>);
      setDraft(Object.fromEntries(list.map((u) => [u.id, [...u.roles]])));
      setForm({ name: "", email: "", password: "", phone: "", department: "", roles: ["user"] });
      setCreatedOk(true);
      setTimeout(() => setCreatedOk(false), 2500);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "create_failed";
      setCreateError(
        t.auth.errors[code as keyof typeof t.auth.errors] ?? t.admin.createFailed
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader title={t.admin.usersTitle} subtitle={t.admin.usersSubtitle} />
      <div className="flex-1 overflow-y-auto space-y-4 p-6">
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

        {users.map((u) => (
          <Card key={u.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-thu">{u.name}</p>
                <p className="text-xs text-lab-muted">{u.email}</p>
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
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void save(u.id)}>
                  {t.common.save}
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
