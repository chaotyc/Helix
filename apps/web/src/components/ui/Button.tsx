// Buttons. `variant` says how loud it is: primary for the one main action on a screen,
// secondary for the rest, ghost for toolbar-style actions, danger for removing things.
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode; // drawn before the label
};

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap select-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45";

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-[13px]",
  lg: "h-9 px-4 text-sm",
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover",
  secondary: "border border-line-strong bg-raised text-fg shadow-xs hover:bg-fill",
  ghost: "text-fg-muted hover:bg-fill hover:text-fg",
  danger: "text-danger hover:bg-danger-soft",
};

export function Button({ variant = "secondary", size = "md", icon, className = "", children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; // read by screen readers and shown as the tooltip
  active?: boolean;
  size?: "sm" | "md";
};

// A square button with only an icon. `label` is required so it still has a name.
export function IconButton({ label, active = false, size = "md", className = "", children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 ${
        size === "sm" ? "size-7" : "size-8"
      } ${active ? "bg-fill-strong text-fg" : "text-fg-subtle hover:bg-fill hover:text-fg"} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
