"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { isPendingMessage, normalizeAccountStatus } from "@/lib/account-status";

/** 非 active 用户顶部提示条 */
export function AccountStatusBanner() {
  const { user } = useAuth();
  if (!user) return null;
  const st = normalizeAccountStatus(user);
  if (st === "active") return null;
  const msg = isPendingMessage(user);
  if (!msg) return null;

  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950">
      {msg}{" "}
      {(st === "pending_profile" || st === "rejected" || st === "pending_review") && (
        <Link href="/auth/realname" className="font-semibold underline">
          查看实名状态
        </Link>
      )}
    </div>
  );
}
