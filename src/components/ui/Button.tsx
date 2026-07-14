import clsx from "clsx";

const variants = {
  primary: "bg-thu text-white hover:bg-thu-dark shadow-sm",
  secondary: "bg-tsinghua-yellow text-thu-dark hover:bg-tsinghua-yellow-dark font-semibold",
  outline: "border border-lab-border bg-white text-lab-text hover:bg-thu-muted",
  ghost: "text-lab-muted hover:bg-thu-muted hover:text-thu",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

type Variant = keyof typeof variants;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
}

export function Button({ variant = "primary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50",
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
