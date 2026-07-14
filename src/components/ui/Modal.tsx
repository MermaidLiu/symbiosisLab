"use client";

import clsx from "clsx";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}

export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        className={clsx(
          "relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl border border-lab-border bg-white shadow-xl",
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="shrink-0 border-b border-lab-border px-6 py-4">
          <h2 className="text-lg font-semibold text-thu">{title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-lab-border px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
