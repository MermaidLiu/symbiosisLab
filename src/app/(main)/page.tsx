"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { StudentDashboard } from "@/components/dashboard/StudentDashboard";
import { ManagerDashboard } from "@/components/dashboard/ManagerDashboard";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getDashboardView } from "@/lib/dashboard";

export default function DashboardPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const view = user ? getDashboardView(user.roles) : "student";

  return (
    <>
      <PageHeader title={t.dashboard.title} />
      {view === "student" ? <StudentDashboard /> : <ManagerDashboard view={view} />}
    </>
  );
}
