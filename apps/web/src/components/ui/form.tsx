// Form controls: the input style, a labeled field, a select with its own arrow, and a
// segmented control (a row of mutually exclusive options, like macOS's).
import { useRef, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "./icons.tsx";

// For <input> and <textarea>.
export const INPUT =
  "w-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm text-fg placeholder:text-fg-subtle shadow-xs outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

type FieldProps = {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  // true for a control made of buttons (a segmented control): a <label> around buttons would
  // press the first one whenever the label text is clicked.
  group?: boolean;
};

// A label above its control, with an optional hint below. The <label> wraps the control,
// so clicking the label focuses it.
export function Field({ label, hint, children, className = "", group = false }: FieldProps) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-fg-subtle">{hint}</span>}
    </Tag>
  );
}

// A native <select> (so the menu is the Mac's own) drawn to match the inputs.
export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative flex min-w-0 ${className}`}>
      <select {...rest} className={`${INPUT} h-9 appearance-none py-0 pr-8`}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle" />
    </span>
  );
}

export type SegmentOption<T> = { value: T; label: ReactNode; title?: string };

type SegmentedProps<T> = {
  label: string; // the group's name, for screen readers
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
};

// One choice out of a few. Arrow keys move between options, as in any radio group.
export function SegmentedControl<T extends string | number>({ label, options, value, onChange, disabled, size = "md", className = "" }: SegmentedProps<T>) {
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    // Nothing chosen yet: → picks the first option, ← the last.
    const next = index === -1 ? options[step > 0 ? 0 : options.length - 1] : options[(index + step + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    // Move focus with the choice, so the next arrow press continues from here.
    const buttons = group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons?.[options.indexOf(next)]?.focus();
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex rounded-lg border border-line bg-fill p-0.5 ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`}
    >
      {options.map((option, i) => {
        const checked = option.value === value;
        // Only the checked option is a tab stop (or the first, if none is checked yet).
        const tabbable = checked || (value === null && i === 0);
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            title={option.title}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-md px-2.5 font-medium whitespace-nowrap transition-colors ${size === "sm" ? "h-6 text-xs" : "h-7 text-[13px]"} ${
              checked ? "bg-raised text-fg shadow-xs ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
