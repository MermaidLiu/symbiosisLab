"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { StudentDashboard } from "@/components/dashboard/StudentDashboard";
import { ManagerDashboard } from "@/components/dashboard/ManagerDashboard";
import { RaDashboard } from "@/components/dashboard/RaDashboard";
import { VetDashboard } from "@/components/dashboard/VetDashboard";
import { FacilityCageBoard } from "@/components/animals/FacilityCageBoard";
import { TechnicianWorkbench } from "@/components/animals/TechnicianWorkbench";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { getDashboardView } from "@/lib/dashboard";

export default function DashboardPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const view = user ? getDashboardView(user.roles) : "student";

  if (view === "animal_facility_supervisor") {
    return <FacilityCageBoard mode="workbench" />;
  }

  if (view === "animal_manager" || view === "animal_staff") {
    return <TechnicianWorkbench />;
  }

  if (view === "student") {
    return <StudentDashboard />;
  }

  const title =
    view === "research_assistant"
      ? t.ra.dashboard.title
      : view === "veterinarian"
        ? t.animalMgmt.vetCare.dashboardTitle
        : t.dashboard.title;

  return (
    <>
      <PageHeader title={title} />
      {view === "research_assistant" ? (
        <RaDashboard />
      ) : view === "veterinarian" ? (
        <VetDashboard />
      ) : (
        <ManagerDashboard view={view} />
      )}
    </>
  );
}
