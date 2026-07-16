"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/providers/LocaleProvider";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

/** Public self-registration is disabled — accounts are created by admins only. */
export default function RegisterPage() {
  const { t } = useLocale();
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-thu-muted via-white to-tsinghua-yellow-light/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-lab-border bg-white p-8 shadow-card">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-thu hover:underline"
              aria-label={t.auth.backHome}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {t.auth.backHome}
            </button>
            <div className="mb-3 inline-flex rounded-lg bg-tsinghua-yellow px-3 py-2 shadow-sm">
              <span className="text-sm font-bold tracking-tight text-thu-dark">Symbiosis Lab</span>
            </div>
            <h1 className="text-xl font-bold text-thu">{t.auth.registerTitle}</h1>
          </div>
          <LanguageSwitcher />
        </div>

        <p className="text-sm leading-relaxed text-lab-text">{t.auth.registerDisabledHint}</p>

        <p className="mt-6 text-center text-sm text-lab-muted">
          {t.auth.hasAccount}{" "}
          <Link href="/login" className="font-medium text-thu hover:underline">
            {t.auth.login}
          </Link>
        </p>
      </div>
    </div>
  );
}
