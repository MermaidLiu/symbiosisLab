"use client";

import { Suspense } from "react";
import { AnimalLifecycleHub } from "@/components/animals/AnimalLifecycleHub";

export default function Page() {
  return (
    <Suspense>
      <AnimalLifecycleHub />
    </Suspense>
  );
}
