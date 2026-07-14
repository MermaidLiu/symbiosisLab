"use client";

import { NotificationBell } from "@/components/layout/NotificationBell";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="fluent-header flex shrink-0 items-center justify-between border-b border-white/30 px-6 py-4 backdrop-blur-xl">
      <div>
        <h1 className="text-xl font-bold text-thu">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-lab-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {action}
        <NotificationBell />
        <LanguageSwitcher />
      </div>
    </header>
  );
}
