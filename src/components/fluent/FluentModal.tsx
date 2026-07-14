"use client";

import { FluentButton } from "./FluentButton";

interface FluentModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg";
}

export function FluentModal({ open, title, onClose, children, footer, size = "md" }: FluentModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`fluent-glass relative z-10 w-full p-6 shadow-fluent ${size === "lg" ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`}
      >
        <h2 className="text-lg font-semibold text-thu">{title}</h2>
        <div className="mt-4">{children}</div>
        {footer ?? (
          <div className="mt-6 flex justify-end gap-2">
            <FluentButton variant="outline" onClick={onClose}>
              OK
            </FluentButton>
          </div>
        )}
      </div>
    </div>
  );
}
