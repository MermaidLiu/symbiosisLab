import clsx from "clsx";

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function GlassPanel({ children, className, padding = true }: GlassPanelProps) {
  return (
    <div className={clsx("fluent-glass", padding && "p-4", className)}>{children}</div>
  );
}
