// The panel that floats over the right side of the map, holding whatever is being edited.
import type { ReactNode } from "react";
import { IconButton } from "../ui/Button.tsx";
import { XIcon } from "../ui/icons.tsx";

type Props = { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode };

export function Inspector({ title, subtitle, onClose, children }: Props) {
  return (
    <aside
      data-inspector
      aria-label={title}
      className="absolute top-3 right-3 bottom-3 z-10 flex w-[340px] animate-pop-in flex-col overflow-hidden rounded-xl border border-line-strong bg-overlay shadow-xl shadow-black/10"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-fg">{title}</h2>
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
