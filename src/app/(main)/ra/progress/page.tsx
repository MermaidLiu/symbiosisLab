"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProgressCollector } from "@/components/ra/ProgressCollector";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { canAccessResearchAssistant } from "@/lib/roles";

export default function RaProgressPage() {
  const { t } = useLocale();
  const { user, loading } = useAuth();
  const router = useRouter();
  const r = t.ra;

  useEffect(() => {
    if (loading) return;
    if (!user || !canAccessResearchAssistant(user.roles)) router.replace("/");
  }, [user, loading, router]);

  if (loading || !user || !canAccessResearchAssistant(user.roles)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-lab-muted">
        {loading ? t.common.loading : r.forbidden}
      </div>
    );
  }

  return (
    <>
      <PageHeader title={r.progressTitle} />
      <div className="fluent-mica-bg flex-1 overflow-y-auto p-4 md:p-6">
        <ProgressCollector />
      </div>
    </>
  );
}
