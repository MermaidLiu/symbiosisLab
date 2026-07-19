"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useData } from "@/context/DataContext";
import { api } from "@/lib/api/client";
import { setCachePartial, getInstruments } from "@/lib/storage/db";

interface ImportInstrumentModalProps {
  open: boolean;
  onClose: () => void;
}

const SAMPLE = `name,nameEn,model,location,status,contactPhone,trainingRequired,minBookingHours,maxBookingHours,maintenanceUntil,approvalName,approvalPhone,trainingName,trainingPhone,operationsName,operationsPhone,repairName,repairPhone
共聚焦显微镜,Confocal Microscope,Nikon A1,C栋 201,available,13800000002,是,0.5,8,,,张仪器,13800000002,成像中心,13800000088,张仪器,13800000002,设备科,13800000099`;

export function ImportInstrumentModal({ open, onClose }: ImportInstrumentModalProps) {
  const { t } = useLocale();
  const { refresh } = useData();
  const [csv, setCsv] = useState(SAMPLE);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    if (!csv.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await api.importInstruments(csv);
      const merged = [...getInstruments(), ...res.instruments];
      setCachePartial({ instruments: merged });
      await refresh();
      setMsg(t.instruments.importSuccess.replace("{n}", String(res.created)));
      if (res.errors.length) {
        setMsg((m) => `${m} · ${res.errors.slice(0, 3).join("; ")}`);
      }
    } catch {
      setMsg(t.instruments.importFail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.instruments.importTitle}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button disabled={busy} onClick={() => void handleImport()}>
            {t.instruments.importCsv}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-xs text-lab-muted">{t.instruments.importHint}</p>
      <textarea
        className="fluent-input h-56 w-full rounded-lg px-3 py-2 font-mono text-xs"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={t.instruments.importPlaceholder}
      />
      {msg && <p className="mt-2 text-sm text-thu">{msg}</p>}
    </Modal>
  );
}
