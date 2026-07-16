"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { DataProvider } from "@/context/DataContext";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DataProvider>
        <AppShell>{children}</AppShell>
      </DataProvider>
    </AuthGuard>
  );
}
