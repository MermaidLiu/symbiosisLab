import clsx from "clsx";

export function FluentLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("mb-1 block text-[11px] font-medium text-lab-muted", className)}>
      {children}
    </label>
  );
}

export function FluentSelect({
  label,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className={className}>
      {label && <FluentLabel>{label}</FluentLabel>}
      <select
        className="fluent-input w-full rounded-lg px-3 py-2 text-sm"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function FluentInput({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className={className}>
      {label && <FluentLabel>{label}</FluentLabel>}
      <input className="fluent-input w-full rounded-lg px-3 py-2 text-sm" {...props} />
    </div>
  );
}

export function FluentRadioGroup({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <FluentLabel>{label}</FluentLabel>
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-xs text-lab-text">
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-thu"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
