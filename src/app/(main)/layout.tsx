"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { DataProvider } from "@/context/DataContext";
import { AnimalCartProvider } from "@/context/AnimalCartContext";
import { TemporaryCartFloat } from "@/components/animals/TemporaryCartFloat";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <DataProvider>
        <AnimalCartProvider>
          <AppShell>{children}</AppShell>
          <TemporaryCartFloat />
        </AnimalCartProvider>
      </DataProvider>
    </AuthGuard>
  );
}
