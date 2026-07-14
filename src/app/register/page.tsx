"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Role } from "@/types";
import { ALL_ROLES } from "@/lib/roles";
import clsx from "clsx";

const REGISTERABLE_ROLES: Role[] = ALL_ROLES.filter((r) => r !== "super_admin");

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    department: "",
    roles: ["user"] as Role[],
  });
  const [error, setError] = useState("");

  function toggleRole(role: Role) {
    setForm((f) => {
      const has = f.roles.includes(role);
      if (role === "user") return f;
      const next = has ? f.roles.filter((r) => r !== role) : [...f.roles, role];
      return { ...f, roles: next.includes("user") ? next : [...next, "user"] };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await register(form);
    if (result.ok) router.replace("/");
    else setError(t.auth.errors[result.error as keyof typeof t.auth.errors] ?? result.error ?? "");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-thu-muted via-white to-tsinghua-yellow-light/30 p-4">
      <div className="w-full max-w-lg rounded-xl border border-lab-border bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-lg bg-tsinghua-yellow px-3 py-2 shadow-sm">
              <span className="text-sm font-bold tracking-tight text-thu-dark">Symbiosis Lab</span>
            </div>
            <h1 className="text-xl font-bold text-thu">{t.auth.registerTitle}</h1>
          </div>
          <LanguageSwitcher />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label={t.auth.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label={t.auth.email} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label={t.auth.password} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Input label={t.auth.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label={t.auth.department} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />

          <div>
            <p className="mb-2 text-xs font-medium text-lab-muted">{t.auth.selectRoles}</p>
            <p className="mb-2 text-[10px] text-lab-muted">{t.auth.roleHint}</p>
            <div className="flex flex-wrap gap-2">
              {REGISTERABLE_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  disabled={role === "user"}
                  onClick={() => toggleRole(role)}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    form.roles.includes(role)
                      ? "border-thu bg-thu-muted text-thu"
                      : "border-lab-border text-lab-muted hover:border-thu"
                  )}
                >
                  {t.roles[role]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">{t.auth.register}</Button>
        </form>

        <p className="mt-4 text-center text-sm text-lab-muted">
          {t.auth.hasAccount}{" "}
          <Link href="/login" className="font-medium text-thu hover:underline">{t.auth.login}</Link>
        </p>
      </div>
    </div>
  );
}
