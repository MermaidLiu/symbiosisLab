"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { needsProfileCompletion } from "@/lib/account-status";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    if (needsProfileCompletion(user) && !pathname.startsWith("/auth/realname")) {
      router.replace("/auth/realname");
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-lab-muted">
        …
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
