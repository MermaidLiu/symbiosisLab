import clsx from "clsx";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, id, ...props }: InputProps) {
  const inputId = id ?? label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-lab-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          "w-full rounded-md border border-lab-border bg-white px-3 py-2 text-sm focus:border-thu focus:outline-none focus:ring-1 focus:ring-thu/30",
          className
        )}
        {...props}
      />
    </div>
  );
}

export function Textarea({ label, className, id, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const inputId = id ?? label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-lab-muted">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={clsx(
          "w-full rounded-md border border-lab-border bg-white px-3 py-2 text-sm focus:border-thu focus:outline-none focus:ring-1 focus:ring-thu/30",
          className
        )}
        rows={3}
        {...props}
      />
    </div>
  );
}

export function Select({ label, className, id, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const inputId = id ?? label;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-lab-muted">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={clsx(
          "w-full rounded-md border border-lab-border bg-white px-3 py-2 text-sm focus:border-thu focus:outline-none focus:ring-1 focus:ring-thu/30",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
