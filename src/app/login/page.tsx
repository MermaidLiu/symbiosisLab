"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

function LoginForm() {
  const { login, user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("admin@lab.edu.cn");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) router.replace(params.get("redirect") ?? "/");
  }, [user, router, params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await login(email, password);
    if (result.ok) {
      router.replace(params.get("redirect") ?? "/");
    } else {
      setError(t.auth.errors[result.error as keyof typeof t.auth.errors] ?? result.error ?? "");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-thu-muted via-white to-tsinghua-yellow-light/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-lab-border bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-lg bg-tsinghua-yellow px-3 py-2 shadow-sm">
              <span className="text-sm font-bold tracking-tight text-thu-dark">Symbiosis Lab</span>
            </div>
            <h1 className="text-xl font-bold text-thu">{t.auth.loginTitle}</h1>
          </div>
          <LanguageSwitcher />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label={t.auth.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label={t.auth.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">{t.auth.login}</Button>
        </form>

        <p className="mt-4 text-center text-xs text-lab-muted">{t.auth.demoHint}</p>
        <p className="mt-3 text-center text-sm text-lab-muted">
          {t.auth.noAccount}{" "}
          <Link href="/register" className="font-medium text-thu hover:underline">{t.auth.register}</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
