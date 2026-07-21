"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { api } from "@/lib/api/client";
import { canSuperviseInstruments } from "@/lib/roles";
import { getUsers } from "@/lib/storage/db";
import { displayName } from "@/lib/users";
import {
  BOOKING_HOURS_CEILING,
  BOOKING_HOURS_FLOOR,
  defaultInstrumentContacts,
  instrumentImageUrl,
} from "@/lib/instruments";
import {
  Instrument,
  InstrumentAccessory,
  InstrumentContactStep,
  InstrumentStepContact,
} from "@/types";

const STEP_LABEL_KEY: Record<
  InstrumentContactStep,
  "contactApproval" | "contactTraining" | "contactOperations" | "contactRepair"
> = {
  approval: "contactApproval",
  training: "contactTraining",
  operations: "contactOperations",
  repair: "contactRepair",
};

interface InstrumentFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Edit mode when provided */
  instrument?: Instrument | null;
}

export function InstrumentFormModal({ open, onClose, instrument }: InstrumentFormModalProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { addInstrument, updateInstrument, refresh } = useData();
  const router = useRouter();
  const isEdit = Boolean(instrument);

  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    model: "",
    location: "",
    description: "",
    descriptionEn: "",
    contactPhone: "",
    status: "available" as Instrument["status"],
    trainingRequired: false,
    minBookingHours: BOOKING_HOURS_FLOOR,
    maxBookingHours: BOOKING_HOURS_CEILING,
    maintenanceUntil: "",
    maintenanceNote: "",
  });
  const [contacts, setContacts] = useState<InstrumentStepContact[]>([]);
  const [accessories, setAccessories] = useState<InstrumentAccessory[]>([]);
  const [accDraft, setAccDraft] = useState({ name: "", nameEn: "", quantity: 1 });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const canAssignOwner = user ? canSuperviseInstruments(user.roles) : false;
  const users = getUsers();

  useEffect(() => {
    if (!open || !user) return;
    if (instrument) {
      setForm({
        name: instrument.name,
        nameEn: instrument.nameEn,
        model: instrument.model,
        location: instrument.location,
        description: instrument.description,
        descriptionEn: instrument.descriptionEn,
        contactPhone: instrument.contactPhone,
        status: instrument.status,
        trainingRequired: instrument.trainingRequired,
        minBookingHours: instrument.minBookingHours,
        maxBookingHours: instrument.maxBookingHours,
        maintenanceUntil: instrument.maintenanceUntil
          ? instrument.maintenanceUntil.slice(0, 16)
          : "",
        maintenanceNote: instrument.maintenanceNote ?? "",
      });
      setContacts(
        instrument.contacts?.length
          ? instrument.contacts
          : defaultInstrumentContacts(user.name, instrument.contactPhone, user.id)
      );
      setAccessories(instrument.accessories ?? []);
      setOwnerUserId(instrument.contactUserId || "");
    } else {
      setForm({
        name: "",
        nameEn: "",
        model: "",
        location: "",
        description: "",
        descriptionEn: "",
        contactPhone: user.phone ?? "",
        status: "available",
        trainingRequired: false,
        minBookingHours: BOOKING_HOURS_FLOOR,
        maxBookingHours: BOOKING_HOURS_CEILING,
        maintenanceUntil: "",
        maintenanceNote: "",
      });
      setContacts(defaultInstrumentContacts(user.name, user.phone ?? "", user.id));
      setAccessories([]);
      setOwnerUserId(user.id);
    }
    setAccDraft({ name: "", nameEn: "", quantity: 1 });
    setImageFile(null);
    setError("");
  }, [open, instrument, user]);

  function updateContact(step: InstrumentContactStep, patch: Partial<InstrumentStepContact>) {
    setContacts((prev) =>
      prev.map((c) => (c.step === step ? { ...c, ...patch } : c))
    );
  }

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
    setSaving(true);
    setError("");
    try {
      const owner = users.find((u) => u.id === ownerUserId) ?? user;
      const contactsWithOwner = contacts.map((c) =>
        c.step === "approval" || c.step === "training" || c.step === "operations"
          ? {
              ...c,
              userId: owner.id,
              name: c.name && c.name !== "—" ? c.name : displayName(owner),
              phone: c.phone || owner.phone || form.contactPhone,
            }
          : c
      );
      const approval = contactsWithOwner.find((c) => c.step === "approval");
      const payload = {
        ...form,
        contactUserId: approval?.userId || owner.id,
        contactPhone: approval?.phone || form.contactPhone,
        contacts: contactsWithOwner,
        tags: instrument?.tags ?? [],
        specs: instrument?.specs ?? [],
        accessories,
        maintenanceUntil:
          form.status === "maintenance" && form.maintenanceUntil
            ? new Date(form.maintenanceUntil).toISOString()
            : undefined,
        maintenanceNote:
          form.status === "maintenance" ? form.maintenanceNote.trim() || undefined : undefined,
        imageId: instrument?.imageId,
      };

      let id = instrument?.id;
      if (isEdit && id) {
        await updateInstrument(id, payload);
      } else {
        const item = await addInstrument(payload);
        id = item.id;
      }

      if (imageFile && id) {
        await api.uploadInstrumentImage(id, imageFile);
        await refresh?.();
      }

      onClose();
      if (id) router.push(`/instruments/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.instruments.importFail);
    } finally {
      setSaving(false);
    }
  }

  const currentImage = instrumentImageUrl(instrument?.imageId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t.instruments.edit : t.instruments.add}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="instrument-form" disabled={saving}>
            {t.common.save}
          </Button>
        </div>
      }
    >
      <form id="instrument-form" onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {canAssignOwner && (
          <Select
            label={t.instruments.assignOwner}
            value={ownerUserId}
            onChange={(e) => {
              const uid = e.target.value;
              setOwnerUserId(uid);
              const u = users.find((x) => x.id === uid);
              if (!u) return;
              setContacts((prev) =>
                prev.map((c) =>
                  c.step === "approval" || c.step === "training" || c.step === "operations"
                    ? { ...c, userId: u.id, name: displayName(u), phone: u.phone || c.phone }
                    : c
                )
              );
              // Ensure assignee has instrument_manager role hint via name only; admin assigns role separately
            }}
          >
            <option value="">{t.instruments.pickOwner}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)} ({u.email})
              </option>
            ))}
          </Select>
        )}
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
          <Select
            label={t.common.status}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as Instrument["status"] })}
          >
            <option value="available">{t.status.available}</option>
            <option value="maintenance">{t.status.maintenance}</option>
            <option value="retired">{t.status.retired}</option>
          </Select>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.trainingRequired}
                onChange={(e) => setForm({ ...form, trainingRequired: e.target.checked })}
                className="rounded border-lab-border text-thu focus:ring-thu"
              />
              {t.instruments.trainingRequired}
            </label>
          </div>
        </div>

        {form.status === "maintenance" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t.instruments.maintenanceUntil}
              type="datetime-local"
              value={form.maintenanceUntil}
              onChange={(e) => setForm({ ...form, maintenanceUntil: e.target.value })}
            />
            <Input
              label={t.instruments.maintenanceNote}
              value={form.maintenanceNote}
              onChange={(e) => setForm({ ...form, maintenanceNote: e.target.value })}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t.instruments.minHours}
            type="number"
            min={BOOKING_HOURS_FLOOR}
            max={BOOKING_HOURS_CEILING}
            step={0.5}
            value={form.minBookingHours}
            onChange={(e) => setForm({ ...form, minBookingHours: Number(e.target.value) })}
          />
          <Input
            label={t.instruments.maxHours}
            type="number"
            min={BOOKING_HOURS_FLOOR}
            max={BOOKING_HOURS_CEILING}
            step={0.5}
            value={form.maxBookingHours}
            onChange={(e) => setForm({ ...form, maxBookingHours: Number(e.target.value) })}
          />
        </div>
        <p className="text-[11px] text-lab-muted">{t.instruments.hoursHint}</p>

        <div className="rounded-lg border border-lab-border p-3">
          <p className="mb-3 text-sm font-medium text-thu">{t.instruments.contactSteps}</p>
          <div className="space-y-3">
            {contacts.map((c) => (
              <div key={c.step} className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                <p className="flex items-center text-xs font-medium text-lab-muted">
                  {t.instruments[STEP_LABEL_KEY[c.step]]}
                </p>
                <Input
                  label={t.instruments.contactName}
                  value={c.name}
                  onChange={(e) => updateContact(c.step, { name: e.target.value })}
                />
                <Input
                  label={t.instruments.contactPhone}
                  value={c.phone}
                  onChange={(e) => updateContact(c.step, { phone: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-lab-border p-3">
          <p className="mb-2 text-sm font-medium text-thu">{t.instruments.image}</p>
          {currentImage && !imageFile && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentImage} alt="" className="mb-2 h-28 w-auto rounded-lg object-cover" />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
        </div>

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

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}

/** @deprecated Prefer InstrumentFormModal */
export function AddInstrumentModal(props: { open: boolean; onClose: () => void }) {
  return <InstrumentFormModal {...props} />;
}
