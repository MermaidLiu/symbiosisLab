"use client";

import { Suspense } from "react";
import { TechTaskHandle } from "@/components/animals/TechTaskHandle";

export default function TechTaskHandlePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-lab-muted">加载中…</div>}>
      <TechTaskHandle />
    </Suspense>
  );
}
