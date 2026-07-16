"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { StudentDashboard } from "@/components/dashboard/StudentDashboard";
import { ManagerDashboard } from "@/components/dashboard/ManagerDashboard";
import { RaDashboard } from "@/components/dashboard/RaDashboard";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getDashboardView } from "@/lib/dashboard";

export default function DashboardPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const view = user ? getDashboardView(user.roles) : "student";
  const title =
    view === "research_assistant" ? t.ra.dashboard.title : t.dashboard.title;

  return (
    <>
      <PageHeader title={title} />
      {view === "research_assistant" ? (
        <RaDashboard />
      ) : view === "student" ? (
        <StudentDashboard />
      ) : (
        <ManagerDashboard view={view} />
      )}
    </>
  );
}
