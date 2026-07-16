"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { canAccessResearchAssistant } from "@/lib/roles";

export function RaPlaceholder({ titleKey }: { titleKey: "progressTitle" | "pptTitle" | "expensesTitle" | "suppliesTitle" }) {
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
      <PageHeader title={r[titleKey]} />
      <div className="fluent-mica-bg flex flex-1 items-center justify-center p-6">
        <GlassPanel className="max-w-md text-center">
          <p className="text-lg font-semibold text-thu">{r.comingSoon}</p>
          <p className="mt-2 text-sm text-lab-muted">{r.comingSoonHint}</p>
        </GlassPanel>
      </div>
    </>
  );
}
