"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AddInstrumentModal } from "@/components/instruments/AddInstrumentModal";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { canManageInstruments } from "@/lib/roles";
import { getUsers } from "@/lib/storage/db";

export default function InstrumentsPage() {
  const { t, isZh } = useLocale();
  const { user } = useAuth();
  const { instruments } = useData();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const users = getUsers();

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return instruments;
    return instruments.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.nameEn.toLowerCase().includes(q) ||
        i.model.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q)
    );
  }, [instruments, query]);

  return (
    <>
      <PageHeader
        title={t.instruments.title}
        action={
          user && canManageInstruments(user.roles) ? (
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              {t.instruments.add}
            </Button>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
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
              const contact = users.find((u) => u.id === inst.contactUserId);
              return (
                <Link key={inst.id} href={`/instruments/${inst.id}`}>
                  <Card className="h-full transition-all hover:border-thu hover:shadow-md">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-thu">{isZh ? inst.name : inst.nameEn}</h3>
                      <StatusBadge status={inst.status} label={t.status[inst.status]} />
                    </div>
                    <p className="text-xs text-lab-muted">{t.instruments.model}: {inst.model}</p>
                    <p className="mt-1 text-xs text-lab-muted">{t.common.location}: {inst.location}</p>
                    <p className="mt-2 text-xs">
                      <span className="text-lab-muted">{t.common.contact}: </span>
                      <span className="font-medium text-thu">{contact?.name}</span>
                    </p>
                    <p className="mt-2 text-xs text-lab-muted">
                      {inst.trainingRequired ? t.instruments.trainingRequired : t.instruments.trainingNotRequired}
                      {inst.accessories.length > 0 && (
                        <span className="ml-2">
                          · {t.instruments.accessories} ({inst.accessories.length})
                        </span>
                      )}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <AddInstrumentModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
