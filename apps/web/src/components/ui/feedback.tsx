// Telling the learner what's happening: alerts (a box with an icon), a spinner, and the
// empty state a page shows when it has nothing yet.
import type { ReactNode } from "react";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XCircleIcon, XIcon } from "./icons.tsx";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; icon: string; Icon: typeof InfoIcon }> = {
  info: { box: "border-line bg-fill", icon: "text-fg-subtle", Icon: InfoIcon },
  success: { box: "border-success/25 bg-success-soft", icon: "text-success", Icon: CheckCircleIcon },
  warning: { box: "border-warning/25 bg-warning-soft", icon: "text-warning", Icon: AlertTriangleIcon },
  danger: { box: "border-danger/25 bg-danger-soft", icon: "text-danger", Icon: XCircleIcon },
};

type AlertProps = {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode; // a button at the right
  icon?: ReactNode; // replaces the tone's icon (e.g. a spinner while working)
  onDismiss?: () => void;
  className?: string;
};

export function Alert({ tone = "info", title, children, action, icon, onDismiss, className = "" }: AlertProps) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] text-fg ${t.box} ${className}`}
    >
      <span className={`mt-px ${t.icon}`}>{icon ?? <t.Icon className="size-4" />}</span>
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={title ? "text-fg-muted" : ""}>{children}</div>}
      </div>
      {action && <div className="-my-0.5 shrink-0">{action}</div>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-0.5 rounded p-0.5 text-fg-subtle hover:bg-fill hover:text-fg">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`shrink-0 animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

type EmptyStateProps = { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string };

// A page with nothing to show yet: what it's for, and the one thing to do next.
export function EmptyState({ icon, title, children, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      {icon && <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-line bg-raised text-fg-muted shadow-xs">{icon}</div>}
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {children && <div className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
