"use client";

import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div key={pathname} className="page-enter flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </main>
  );
}
