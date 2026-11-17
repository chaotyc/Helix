import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Confidence } from "@helix/contracts";
import { Kbd } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { SegmentedControl, type SegmentOption } from "../ui/form.tsx";
import { ArrowUpIcon } from "../ui/icons.tsx";

// What the box is for right now:
//   graded  answering a graded question: a confidence rating (1–5) is required before sending
//   reply   talking with the tutor: no rating
//   closed  not the learner's turn (the server is working, or the session has ended)
export type ComposerMode = "graded" | "reply" | "closed";

type Props = { mode: ComposerMode; closedText: string; onSend: (text: string, confidence?: Confidence) => void };

const LEVELS: SegmentOption<Confidence>[] = [
  { value: 1, label: "1", title: "A guess" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5", title: "Certain" },
];

export function Composer({ mode, closedText, onSend }: Props) {
  // What's typed and rated right now. Lives here, not in App, because nobody else needs it.
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const ready = mode !== "closed" && text.trim() !== "" && (mode === "reply" || confidence !== null);
  const needsRating = mode === "graded" && text.trim() !== "" && confidence === null;

  function send(): void {
    if (!ready) return; // guard: empty, or a graded answer without a rating
    onSend(text.trim(), mode === "graded" ? (confidence ?? undefined) : undefined);
    setText("");
    setConfidence(null);
  }

  // Put the cursor in the box when it's the learner's turn, unless they're typing somewhere else
  // (another field, or the command palette).
  useEffect(() => {
    if (mode === "closed") return;
    const active = document.activeElement;
    const elsewhere = active instanceof HTMLElement && active !== box.current && active.closest("input, textarea, select, [role=dialog]");
    if (!elsewhere) box.current?.focus();
  }, [mode]);

  // On the whole composer, so ⌘↵ also sends right after clicking a rating.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.metaKey && event.key === "Enter") {
      event.preventDefault();
      send();
    }
  }

  const closed = mode === "closed";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 @xl/session:px-8">
      <div
        onKeyDown={onKeyDown}
        className={`@container/composer rounded-2xl border bg-raised shadow-sm transition-[border-color,box-shadow] ${
          closed ? "border-line" : "border-line-strong focus-within:border-accent/70 focus-within:ring-4 focus-within:ring-accent/10"
        }`}
      >
        <textarea
          ref={box}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={closed}
          rows={2}
          aria-label={mode === "graded" ? "Your answer" : "Reply to the tutor"}
          placeholder={closed ? closedText : mode === "graded" ? "Your answer…" : "Reply to the tutor…"}
          // field-sizing-content: the box grows with its text (up to max-h-60, then scrolls)
          className="block max-h-60 min-h-14 w-full resize-none field-sizing-content bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 text-fg placeholder:text-fg-subtle focus:outline-none disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-3 px-3 pt-1 pb-3">
          {mode === "graded" && (
            <div className="flex min-w-0 items-center gap-2.5 pl-1">
              <span className={`shrink-0 text-xs whitespace-nowrap ${needsRating ? "font-medium text-warning" : "text-fg-muted"}`}>
                <span className="@max-sm/composer:hidden">How sure are you?</span>
                <span className="hidden @max-sm/composer:inline">Sure?</span>
              </span>
              <SegmentedControl label="How sure are you?" size="sm" options={LEVELS} value={confidence} onChange={setConfidence} className="shrink-0" />
              <span className="shrink-0 text-[11px] whitespace-nowrap text-fg-subtle @max-2xl/composer:hidden">1 a guess · 5 certain</span>
            </div>
          )}
          <span className="flex-1" />
          {!closed && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-fg-subtle @max-xl/composer:hidden">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </span>
          )}
          <Button variant="primary" size="sm" onClick={send} disabled={!ready} icon={<ArrowUpIcon className="size-3.5" />} className="h-8 shrink-0 rounded-lg px-3">
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
