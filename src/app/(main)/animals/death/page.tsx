"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { GlassPanel } from "@/components/fluent/GlassPanel";
import { FluentButton } from "@/components/fluent/FluentButton";
import { ManagedAnimal } from "@/types/animal-management";
import { DEATH_METHODS, DeathMethod } from "@/types/animal-management";

const METHOD_LABEL: Record<DeathMethod, string> = {
  cervical: "断颈",
  perfusion: "灌流",
  found_dead: "发现死亡",
};

export default function AnimalDeathPage() {
  const params = useSearchParams();
  const animalId = (params.get("animalId") || "").trim();
  const [animal, setAnimal] = useState<ManagedAnimal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!animalId) {
      setError("缺少 Animal ID");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/animal-lifecycle?animalId=${encodeURIComponent(animalId)}`,
        { credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "not_found");
      setAnimal(data.animal);
    } catch {
      setError("未找到该小鼠或无权查看");
      setAnimal(null);
    } finally {
      setBusy(false);
    }
  }, [animalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const method =
    animal?.deathMethod && DEATH_METHODS.includes(animal.deathMethod as DeathMethod)
      ? METHOD_LABEL[animal.deathMethod as DeathMethod]
      : animal?.deathMethod || "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="小鼠死亡详情"
        subtitle="登记死亡后实验已终止；以下为死亡时间与原因"
        action={
          <Link href={animalId ? `/animals/lifecycle?animalId=${encodeURIComponent(animalId)}` : "/animals/lifecycle"}>
            <FluentButton size="sm" variant="outline">
              返回追溯
            </FluentButton>
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6">
        {busy ? <p className="text-sm text-lab-muted">加载中…</p> : null}
        {error ? <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {animal?.deathAt ? (
          <GlassPanel className="mx-auto max-w-lg space-y-3">
            <p className="font-mono text-xl font-bold text-thu">{animal.id}</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-lab-muted">死亡时间</dt>
                <dd className="font-medium text-lab-text">
                  {animal.deathAt.slice(0, 16).replace("T", " ")}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-lab-muted">死亡方式</dt>
                <dd className="font-medium text-lab-text">{method}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-lab-muted">死亡原因</dt>
                <dd className="max-w-[60%] text-right font-medium text-lab-text">
                  {animal.deathReason || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-lab-muted">登记人</dt>
                <dd className="font-medium text-lab-text">{animal.deathReportedByName || "—"}</dd>
              </div>
            </dl>
            <p className="text-xs text-lab-muted">实验流程已因死亡终止，无需再走 NAS 闭环。</p>
          </GlassPanel>
        ) : animal ? (
          <p className="text-sm text-lab-muted">该小鼠尚未登记死亡信息。</p>
        ) : null}
      </div>
    </div>
  );
}
