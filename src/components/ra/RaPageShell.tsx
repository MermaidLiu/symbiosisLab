"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { canAccessResearchAssistant } from "@/lib/roles";

/** Auth-gated shell for RA module pages */
export function RaPageShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || !canAccessResearchAssistant(user.roles)) router.replace("/");
  }, [user, loading, router]);

  if (loading || !user || !canAccessResearchAssistant(user.roles)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-lab-muted">
        {loading ? t.common.loading : t.ra.forbidden}
      </div>
    );
  }

  return (
    <>
      <PageHeader title={title} action={action} />
      <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
    </>
  );
}
