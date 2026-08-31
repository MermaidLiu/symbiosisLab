"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

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
    const st = user.accountStatus ?? "active";
    if (st === "pending_profile" && !pathname.startsWith("/auth/realname")) {
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
