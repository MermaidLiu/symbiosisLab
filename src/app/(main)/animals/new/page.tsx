"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";

export default function NewAnimalPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { addAnimal } = useData();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    species: "",
    speciesEn: "",
    strain: "",
    identifier: "",
    sex: "unknown" as const,
    location: "",
    notes: "",
    notesEn: "",
    contactPhone: user?.phone ?? "",
    status: "available" as const,
    tags: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name) return;
    const item = await addAnimal({
      ...form,
      contactUserId: user.id,
      tags: form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    router.push(`/animals/${item.id}`);
  }

  return (
    <>
      <PageHeader title={t.animals.add} />
      <div className="flex-1 overflow-y-auto p-6">
        <Card className="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label={t.form.nameZh} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label={t.form.nameEn} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required />
            <Input label={t.animals.species} value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} required />
            <Input label={`${t.animals.species} (EN)`} value={form.speciesEn} onChange={(e) => setForm({ ...form, speciesEn: e.target.value })} />
            <Input label={t.animals.strain} value={form.strain} onChange={(e) => setForm({ ...form, strain: e.target.value })} />
            <Input label={t.animals.identifier} value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} required />
            <Select label={t.animals.sex} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value as "unknown" })}>
              <option value="unknown">{t.animals.unknown}</option>
              <option value="male">{t.animals.male}</option>
              <option value="female">{t.animals.female}</option>
            </Select>
            <Input label={t.common.location} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
            <Textarea label={t.animals.notes} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <Button type="submit">{t.common.save}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
