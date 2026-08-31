"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { needsProfileCompletion } from "@/lib/account-status";
import type { PublicUser } from "@/lib/api/client";

function LoginForm() {
  const { login, phoneLogin, sendSms, user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [smsHint, setSmsHint] = useState("");
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("admin@lab.edu.cn");
  const [password, setPassword] = useState("admin123");

  function goAfterLogin(u: PublicUser) {
    if (needsProfileCompletion(u)) {
      router.replace("/auth/realname");
      return;
    }
    router.replace(params.get("redirect") ?? "/");
  }

  useEffect(() => {
    if (!user) return;
    goAfterLogin(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (countdown <= 0) return;
    const tmr = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(tmr);
  }, [countdown]);

  async function onSendSms() {
    setError("");
    setSmsHint("");
    setSending(true);
    const res = await sendSms(phone);
    setSending(false);
    if (!res.ok) {
      setError(
        t.auth.errors[res.error as keyof typeof t.auth.errors] ?? res.error ?? "发送失败"
      );
      return;
    }
    setCountdown(60);
    if (res.mockCode) {
      setSmsHint(`${t.auth.mockSmsHint}: ${res.mockCode}`);
      setCode(res.mockCode);
    } else {
      setSmsHint(t.auth.smsSent);
    }
  }

  async function onPhoneLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await phoneLogin(phone, code);
    if (!result.ok) {
      setError(
        t.auth.errors[result.error as keyof typeof t.auth.errors] ?? result.error ?? ""
      );
      return;
    }
    if (result.user) goAfterLogin(result.user);
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await login(email, password);
    if (!result.ok) {
      setError(
        t.auth.errors[result.error as keyof typeof t.auth.errors] ?? result.error ?? ""
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-thu-muted via-white to-tsinghua-yellow-light/30 p-4 pb-12">
      <div className="w-full max-w-md rounded-xl border border-lab-border bg-white p-8 shadow-card">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-lg bg-tsinghua-yellow px-3 py-2 shadow-sm">
              <span className="text-sm font-bold tracking-tight text-thu-dark">Symbiosis Lab</span>
            </div>
            <h1 className="text-xl font-bold text-thu">{t.auth.phoneLoginTitle}</h1>
            <p className="mt-1 text-xs text-lab-muted">{t.auth.phoneLoginHint}</p>
          </div>
          <LanguageSwitcher />
        </div>

        <form onSubmit={(e) => void onPhoneLogin(e)} className="space-y-4">
          <Input
            label={t.auth.phone}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="11 位手机号"
            required
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={t.auth.smsCode}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6 位验证码"
                required
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={sending || countdown > 0}
              onClick={() => void onSendSms()}
              className="mb-0.5 shrink-0"
            >
              {countdown > 0 ? `${countdown}s` : t.auth.getSms}
            </Button>
          </div>
          {smsHint ? <p className="text-xs text-thu">{smsHint}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full">
            {t.auth.login}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-xs text-lab-muted underline"
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? t.auth.hidePasswordLogin : t.auth.showPasswordLogin}
        </button>

        {showPassword ? (
          <form onSubmit={(e) => void onPasswordLogin(e)} className="mt-4 space-y-3 border-t border-lab-border pt-4">
            <p className="text-xs text-lab-muted">{t.auth.passwordLoginHint}</p>
            <Input
              label={t.auth.email}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label={t.auth.password}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" variant="outline">
              {t.auth.passwordLogin}
            </Button>
          </form>
        ) : null}
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
