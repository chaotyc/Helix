// The panel that floats over the right side of the map, holding whatever is being edited.
//
// Focus: opening it moves focus to its heading (unless a field inside took it, e.g. an
// autofocused name box), so Tab goes straight into the form rather than through every node.
// Closing it (✕ or Esc) gives focus back to what opened it: the node or arrow, or the button.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "../ui/Button.tsx";
import { XIcon } from "../ui/icons.tsx";

type Props = {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  // Where focus goes on closing if what opened the inspector is gone (redrawn): e.g. the node.
  returnFocus?: () => Element | null;
  children: ReactNode;
};

function focusable(el: Element | null): el is HTMLElement | SVGElement {
  return (el instanceof HTMLElement || el instanceof SVGElement) && el.isConnected && el !== document.body;
}

export function Inspector({ title, subtitle, onClose, returnFocus, children }: Props) {
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Read during the first render, before anything inside takes focus.
  const [opener] = useState(() => document.activeElement);
  const fallback = useRef(returnFocus);
  fallback.current = returnFocus;

  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) heading.current?.focus();
    return () => {
      // Only if focus went down with the panel; a click elsewhere keeps its own focus. Wait a
      // frame, so the canvas has redrawn without the selection first.
      const lost = () => !document.activeElement || document.activeElement === document.body;
      if (!lost()) return;
      const returnTo = fallback.current;
      requestAnimationFrame(() => {
        if (!lost()) return;
        const target = focusable(opener) ? opener : (returnTo?.() ?? null);
        if (focusable(target)) target.focus();
      });
    };
  }, [opener]);

  return (
    <aside
      ref={panel}
      data-inspector
      aria-label={title}
      className="absolute top-3 right-3 bottom-3 z-10 flex w-[340px] animate-pop-in flex-col overflow-hidden rounded-xl border border-line-strong bg-overlay shadow-xl shadow-black/10"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 ref={heading} tabIndex={-1} className="truncate text-[13px] font-semibold text-fg outline-none">
            {title}
          </h2>
          {subtitle && <div className="truncate font-mono text-[11px] text-fg-subtle">{subtitle}</div>}
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
    </aside>
  );
}

// The row of buttons at the bottom of an inspector: destructive on the left, save on the right.
export function InspectorFooter({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-line bg-sunken px-4 py-3">{children}</div>;
}
