// Small inline labels: a badge for a status or tag, and a key cap for shortcuts.
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-fill-strong text-fg-muted",
  accent: "bg-accent-soft text-accent-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

// A green dot for something happening now (a session still open). `pulse` animates it; use it
// in one place at most, so the screen isn't full of motion.
export function LiveDot({ pulse = false, className = "" }: { pulse?: boolean; className?: string }) {
  return (
    <span className={`relative flex size-2 shrink-0 ${className}`} aria-hidden="true">
      {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-50" />}
      <span className="relative size-2 rounded-full bg-success" />
    </span>
  );
}

// A key cap: <Kbd>⌘K</Kbd>.
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong bg-raised px-1 font-sans text-[11px] font-medium text-fg-subtle shadow-[0_1px_0_var(--hx-line)] ${className}`}
    >
      {children}
    </kbd>
  );
}
