import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Kbd } from "./ui/Badge.tsx";
import { SearchIcon } from "./ui/icons.tsx";

export type Command = {
  id: string;
  label: string;
  run: () => void;
  group?: string; // a heading the command is listed under ("Actions", "Goals")
  icon?: ReactNode;
  shortcut?: string; // shown at the right, e.g. "⌘\"
};

type Props = { commands: Command[]; onClose: () => void };

// The Cmd+K popup. Type to filter, ↑/↓ to move, Enter to run, Esc to close.
// App only draws this while the palette is open, so its state starts fresh each time.
export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const matches = commands.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()));

  // On closing, give focus back to whatever had it before (e.g. the answer box), unless a
  // command already moved it somewhere else. Read during the first render, before the search
  // box takes focus.
  const [previous] = useState(() => document.activeElement);
  useEffect(() => {
    return () => {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [previous]);

  // Keep the highlighted row in view as the arrow keys move it.
  useEffect(() => {
    list.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function runCommand(command: Command | undefined): void {
    if (!command) return; // guard: nothing matches the query
    onClose();
    command.run();
  }

  // On the whole dialog, so the keys still work after a click anywhere inside it.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault(); // Esc closes only the palette, not what's behind it
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault(); // keep focus in the palette while it's open
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(matches[activeIndex]);
    }
  }

  // Rows in order, with a heading wherever the group changes.
  const rows: ReactNode[] = [];
  matches.forEach((command, index) => {
    const group = command.group ?? "Commands";
    if (index === 0 || (matches[index - 1]!.group ?? "Commands") !== group) {
      rows.push(
        <li key={`group-${group}`} role="presentation" className="px-3 pt-2.5 pb-1 text-[11px] font-medium text-fg-subtle">
          {group}
        </li>,
      );
    }
    const active = index === activeIndex;
    rows.push(
      <li key={command.id} role="option" aria-selected={active} id={`command-${command.id}`} data-index={index}>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => runCommand(command)}
          onMouseMove={() => setActiveIndex(index)}
          className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] ${active ? "bg-fill-strong text-fg" : "text-fg-muted"}`}
        >
          <span className={active ? "text-fg" : "text-fg-subtle"}>{command.icon}</span>
          <span className="min-w-0 flex-1 truncate">{command.label}</span>
          {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
        </button>
      </li>,
    );
  });

  return (
    // The dimmed backdrop. Clicking it (outside the box) closes the palette.
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[14vh] backdrop-blur-[2px] dark:bg-black/50 desktop:[-webkit-app-region:no-drag]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg animate-pop-in overflow-hidden rounded-xl border border-line-strong bg-overlay shadow-2xl shadow-black/20"
        onClick={(event) => event.stopPropagation()} // clicks inside the box don't reach the backdrop
        onKeyDown={onKeyDown}
        // Clicking inside (a row, a heading) keeps the cursor in the search box.
        onMouseDown={(event) => {
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <SearchIcon className="size-4 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0); // the list changed, so start again from the top
            }}
            placeholder="Search goals and commands…"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={matches[activeIndex] ? `command-${matches[activeIndex].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <ul ref={list} id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {rows}
          {matches.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-fg-subtle">No matching commands</li>}
        </ul>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> to run
          </span>
        </div>
      </div>
    </div>
  );
}
