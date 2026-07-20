"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InstrumentFormModal } from "@/components/instruments/InstrumentFormModal";
import { ImportInstrumentModal } from "@/components/instruments/ImportInstrumentModal";
import { InstrumentStatusBadge } from "@/components/instruments/InstrumentStatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { canManageInstruments } from "@/lib/roles";
import { instrumentImageUrl, normalizeInstrument } from "@/lib/instruments";

export default function InstrumentsPage() {
  const { t, isZh } = useLocale();
  const { user } = useAuth();
  const { instruments } = useData();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const canManage = user ? canManageInstruments(user.roles) : false;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const list = instruments.map((i) => normalizeInstrument(i));
    if (!q) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.nameEn.toLowerCase().includes(q) ||
        i.model.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q)
    );
  }, [instruments, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t.instruments.title}
        action={
          user ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                {t.instruments.importCsv}
              </Button>
              {canManage && (
                <Button variant="secondary" onClick={() => setAddOpen(true)}>
                  {t.instruments.add}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="fluent-mica-bg min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-24 md:p-6">
        <div className="mb-4 max-w-md">
          <Input
            placeholder={t.common.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-lab-muted">{t.common.noResults}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((inst) => {
              const approval = inst.contacts?.find((c) => c.step === "approval");
              const img = instrumentImageUrl(inst.imageId);
              return (
                <Link key={inst.id} href={`/instruments/${inst.id}`}>
                  <Card className="h-full overflow-hidden transition-all hover:border-thu hover:shadow-md">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt=""
                        className="mb-3 h-36 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="mb-3 flex h-36 items-center justify-center rounded-lg bg-[#F3EAF7] text-xs text-lab-muted">
                        {t.instruments.image}
                      </div>
                    )}
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-thu">{isZh ? inst.name : inst.nameEn}</h3>
                      <InstrumentStatusBadge instrument={inst} />
                    </div>
                    <p className="text-xs text-lab-muted">
                      {t.instruments.model}: {inst.model}
                    </p>
                    <p className="mt-1 text-xs text-lab-muted">
                      {t.common.location}: {inst.location}
                    </p>
                    <p className="mt-2 text-xs">
                      <span className="text-lab-muted">{t.instruments.contactApproval}: </span>
                      <span className="font-medium text-thu">
                        {approval?.name ?? "—"}
                        {approval?.phone ? ` · ${approval.phone}` : ""}
                      </span>
                    </p>
                    <p className="mt-2 text-xs text-lab-muted">
                      {inst.trainingRequired
                        ? t.instruments.trainingRequired
                        : t.instruments.trainingNotRequired}
                      <span className="ml-2">
                        · {inst.minBookingHours}–{inst.maxBookingHours} {t.instruments.hours}
                      </span>
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <InstrumentFormModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportInstrumentModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
