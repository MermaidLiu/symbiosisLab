"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VetCareInbox } from "@/components/animals/VetCareInbox";
import { useAuth } from "@/context/AuthContext";
import { canProcessVeterinary } from "@/lib/roles";

export default function VetCarePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user || !canProcessVeterinary(user.roles)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading || !user || !canProcessVeterinary(user.roles)) {
    return null;
  }

  return <VetCareInbox />;
}
