import clsx from "clsx";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={clsx("fluent-glass p-4", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-thu">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-lab-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
