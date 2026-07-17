"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PptEditor } from "@/components/ra/PptEditor";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/components/providers/LocaleProvider";
import { canAccessResearchAssistant } from "@/lib/roles";

export default function RaPptPage() {
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

  // Full-bleed Beautiful.ai-style editor (no page header chrome)
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PptEditor />
    </div>
  );
}
