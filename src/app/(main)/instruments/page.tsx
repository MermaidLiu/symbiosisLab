"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InstrumentFormModal } from "@/components/instruments/InstrumentFormModal";
import { ImportInstrumentModal } from "@/components/instruments/ImportInstrumentModal";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { canManageInstruments, canSuperviseInstruments } from "@/lib/roles";
import {
  deriveInstrumentDisplayStatus,
  instrumentImageUrl,
  normalizeInstrument,
} from "@/lib/instruments";
import { getUsers } from "@/lib/storage/db";
import { displayName } from "@/lib/users";

export default function InstrumentsPage() {
  const { t, isZh } = useLocale();
  const { user } = useAuth();
  const { instruments, bookings } = useData();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const canManage = user ? canManageInstruments(user.roles) : false;
  const canImport = user ? canSuperviseInstruments(user.roles) : false;
  const users = getUsers();
  const s = t.dashboard.student;

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

  function opsLabel(code: string) {
    if (code === "idle") return s.opsIdle;
    if (code === "in_use") return s.opsInUse;
    if (code === "training") return s.opsTraining;
    if (code === "maintenance") return s.opsMaintenance;
    if (code === "retired") return s.opsRetired;
    return code;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title={t.instruments.title}
        action={
          user ? (
            <div className="flex flex-wrap gap-2">
              {canImport && (
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  {t.instruments.importCsv}
                </Button>
              )}
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
              const owner = users.find((u) => u.id === inst.contactUserId);
              const img = instrumentImageUrl(inst.imageId);
              const display = deriveInstrumentDisplayStatus(inst, bookings, 0);
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
                      <span className="shrink-0 rounded-full bg-thu/10 px-2 py-0.5 text-[10px] font-medium text-thu">
                        {opsLabel(display)}
                      </span>
                    </div>
                    <p className="text-xs text-lab-muted">
                      {t.instruments.model}: {inst.model}
                    </p>
                    <p className="mt-1 text-xs text-lab-muted">
                      {t.common.location}: {inst.location}
                    </p>
                    <p className="mt-2 text-xs">
                      <span className="text-lab-muted">{t.instruments.owner}: </span>
                      <span className="font-medium text-thu">
                        {owner ? displayName(owner) : "—"}
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
