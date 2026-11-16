import { useState, type KeyboardEvent } from "react";
import type { Confidence } from "@helix/contracts";

// What the box is for right now:
//   graded  answering a graded question: a confidence rating (1–5) is required before sending
//   reply   talking with the tutor: no rating
//   closed  not the learner's turn (the server is working, or the session has ended)
export type ComposerMode = "graded" | "reply" | "closed";

type Props = { mode: ComposerMode; closedText: string; onSend: (text: string, confidence?: Confidence) => void };

const LEVELS: Confidence[] = [1, 2, 3, 4, 5];

export function Composer({ mode, closedText, onSend }: Props) {
  // What's typed and rated right now. Lives here, not in App, because nobody else needs it.
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);

  const ready = mode !== "closed" && text.trim() !== "" && (mode === "reply" || confidence !== null);

  function send(): void {
    if (!ready) return; // guard: empty, or a graded answer without a rating
    onSend(text.trim(), mode === "graded" ? (confidence ?? undefined) : undefined);
    setText("");
    setConfidence(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.metaKey && event.key === "Enter") {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="border-t border-zinc-800 p-4">
      {mode === "graded" && (
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
          <span>How sure are you?</span>
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setConfidence(level)}
              className={`h-6 w-6 rounded ${confidence === level ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
              title={level === 1 ? "a guess" : level === 5 ? "certain" : undefined}
            >
              {level}
            </button>
          ))}
          <span className="text-zinc-600">1 a guess · 5 certain</span>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2 focus-within:border-zinc-600">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={mode === "closed"}
          rows={3}
          placeholder={mode === "closed" ? closedText : mode === "graded" ? "Your answer… (⌘↵ to send)" : "Reply to the tutor… (⌘↵ to send)"}
          className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
        <button onClick={send} disabled={!ready} className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 disabled:opacity-30">
          Send
        </button>
      </div>
    </div>
  );
}
