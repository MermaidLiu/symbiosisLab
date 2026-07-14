"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { InstrumentAccessory } from "@/types";

const EMPTY_FORM = {
  name: "",
  nameEn: "",
  model: "",
  location: "",
  description: "",
  descriptionEn: "",
  contactPhone: "",
  status: "available" as const,
  trainingRequired: false,
  minBookingHours: 2,
  maxBookingHours: 24,
};

interface AddInstrumentModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddInstrumentModal({ open, onClose }: AddInstrumentModalProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { addInstrument } = useData();
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [accessories, setAccessories] = useState<InstrumentAccessory[]>([]);
  const [accDraft, setAccDraft] = useState({ name: "", nameEn: "", quantity: 1 });

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, contactPhone: user?.phone ?? "" });
      setAccessories([]);
      setAccDraft({ name: "", nameEn: "", quantity: 1 });
    }
  }, [open, user?.phone]);

  function addAccessory() {
    if (!accDraft.name.trim()) return;
    setAccessories([
      ...accessories,
      {
        name: accDraft.name.trim(),
        nameEn: accDraft.nameEn.trim() || accDraft.name.trim(),
        quantity: Math.max(1, accDraft.quantity),
      },
    ]);
    setAccDraft({ name: "", nameEn: "", quantity: 1 });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim()) return;
    const item = await addInstrument({
      ...form,
      contactUserId: user.id,
      tags: [],
      specs: [],
      accessories,
    });
    onClose();
    router.push(`/instruments/${item.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.instruments.add}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="add-instrument-form">
            {t.common.save}
          </Button>
        </div>
      }
    >
      <form id="add-instrument-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t.form.nameZh}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={t.form.nameEn}
            value={form.nameEn}
            onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t.instruments.model}
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            required
          />
          <Input
            label={t.common.location}
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            required
          />
        </div>
        <Textarea
          label={t.form.descriptionZh}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <Textarea
          label={t.form.descriptionEn}
          value={form.descriptionEn}
          onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t.form.contactPhone}
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
          <Select
            label={t.common.status}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as "available" })}
          >
            <option value="available">{t.status.available}</option>
            <option value="maintenance">{t.status.maintenance}</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.trainingRequired}
            onChange={(e) => setForm({ ...form, trainingRequired: e.target.checked })}
            className="rounded border-lab-border text-thu focus:ring-thu"
          />
          {t.instruments.trainingRequired}
        </label>

        <div className="rounded-lg border border-lab-border p-3">
          <p className="mb-2 text-sm font-medium text-thu">{t.instruments.accessories}</p>
          {accessories.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {accessories.map((a, i) => (
                <li key={`${a.name}-${i}`} className="flex items-center justify-between">
                  <span>
                    {a.name} ×{a.quantity}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => setAccessories(accessories.filter((_, idx) => idx !== i))}
                  >
                    {t.common.delete}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder={t.form.nameZh}
              value={accDraft.name}
              onChange={(e) => setAccDraft({ ...accDraft, name: e.target.value })}
            />
            <Input
              placeholder={t.form.nameEn}
              value={accDraft.nameEn}
              onChange={(e) => setAccDraft({ ...accDraft, nameEn: e.target.value })}
            />
            <Input
              type="number"
              min={1}
              value={accDraft.quantity}
              onChange={(e) => setAccDraft({ ...accDraft, quantity: Number(e.target.value) })}
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addAccessory}>
            {t.common.add}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
