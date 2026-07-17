import { forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "outline";

interface FluentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

const variants: Record<Variant, string> = {
  primary: "fluent-btn-primary bg-thu/80 text-white hover:bg-thu border border-white/30",
  secondary: "fluent-btn-secondary bg-white/50 text-thu hover:bg-white/70 border border-white/40",
  ghost: "bg-transparent text-lab-muted hover:bg-white/40 hover:text-thu",
  outline: "bg-transparent border border-lab-border/80 text-lab-text hover:bg-white/50",
};

export const FluentButton = forwardRef<HTMLButtonElement, FluentButtonProps>(
  function FluentButton({ variant = "primary", size = "md", className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all backdrop-blur-md",
          size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
