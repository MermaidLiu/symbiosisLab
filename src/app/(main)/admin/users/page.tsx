"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getUsers, setCachePartial } from "@/lib/storage/db";
import { api } from "@/lib/api/client";
import { Role } from "@/types";
import { ALL_ROLES } from "@/lib/roles";
import clsx from "clsx";

export default function AdminUsersPage() {
  const { t } = useLocale();
  const { user, updateUserRoles } = useAuth();
  const [users, setUsers] = useState(getUsers());
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Role[]>>({});

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

  async function save(userId: string) {
    await updateUserRoles(userId, draft[userId] ?? ["user"]);
    setUsers(getUsers());
    setSaved(userId);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <>
      <PageHeader title={t.admin.usersTitle} subtitle={t.admin.usersSubtitle} />
      <div className="flex-1 overflow-y-auto space-y-4 p-6">
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
                {saved === u.id && <span className="text-xs text-thu">{t.common.save}</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
