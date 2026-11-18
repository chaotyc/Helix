// The box at the bottom of the new-goal chat. Enter sends, Shift+Enter starts a new line.
// With `documents`, the paperclip (or dropping or pasting files anywhere on the box) attaches
// documents, read to text in the window and listed above the text.
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ACCEPT } from "../../documents.ts";
import { Button } from "../ui/Button.tsx";
import { Spinner } from "../ui/feedback.tsx";
import { ArrowUpIcon, FileIcon, PaperclipIcon, XIcon } from "../ui/icons.tsx";
import type { Documents } from "./DocumentDrop.tsx";

type Props = {
  placeholder: string;
  disabled?: boolean; // not the learner's turn
  documents?: Documents; // attachments allowed
  textOptional?: boolean; // sending with only attachments (or nothing) is fine
  sendLabel?: string;
  initialText?: string;
  onSend: (text: string) => boolean | void; // false: not sent (offline), so the text stays
};

// A paste this long becomes an attached "Pasted text" document, like a chat app's long paste.
const LONG_PASTE_CHARS = 1500;
const LONG_PASTE_LINES = 30;

export function ChatComposer({ placeholder, disabled = false, documents, textOptional = false, sendLabel = "Send", initialText = "", onSend }: Props) {
  const [text, setText] = useState(initialText);
  const [over, setOver] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const ready = !disabled && !documents?.reading && (textOptional || text.trim() !== "");

  // Put the cursor in the box when it's the learner's turn, unless they're typing somewhere else
  // (renaming a goal in the sidebar, the command palette): taking focus would end that.
  useEffect(() => {
    if (disabled) return;
    const active = document.activeElement;
    const elsewhere = active instanceof HTMLElement && active !== box.current && active.closest("input, textarea, select, [contenteditable], [role=dialog]");
    if (!elsewhere) box.current?.focus();
  }, [disabled]);

  function send(): void {
    if (!ready) return;
    if (onSend(text.trim()) !== false) setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  // Pasted files are attached. So is a long pasted text (a syllabus, notes): it's material, so it
  // goes to the agents as source text, not as the learner's own words. Short text goes in the box.
  function onPaste(event: ClipboardEvent): void {
    if (!documents) return;
    if (event.clipboardData.files.length > 0) {
      event.preventDefault();
      documents.addFiles(event.clipboardData.files);
      return;
    }
    const pasted = event.clipboardData.getData("text/plain");
    if (pasted.length >= LONG_PASTE_CHARS || pasted.split("\n").length >= LONG_PASTE_LINES) {
      event.preventDefault();
      documents.addText(pasted);
    }
  }

  function onDrop(event: DragEvent): void {
    if (!documents) return;
    event.preventDefault();
    setOver(false);
    documents.addFiles(event.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(e) => {
        if (!documents) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`rounded-2xl border bg-raised shadow-sm transition-[border-color,box-shadow] ${
        disabled ? "border-line" : over ? "border-accent ring-4 ring-accent/10" : "border-line-strong focus-within:border-accent/70 focus-within:ring-4 focus-within:ring-accent/10"
      }`}
    >
      {documents && documents.entries.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-3 pt-3">
          {documents.entries.map((entry) => (
            <li
              key={entry.key}
              title={entry.status === "error" ? entry.error : entry.name}
              className={`flex max-w-60 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${entry.status === "error" ? "border-danger/40 text-danger" : "border-line text-fg-muted"}`}
            >
              {entry.status === "reading" ? <Spinner className="size-3.5" /> : <FileIcon className="size-3.5" />}
              <span className="truncate">{entry.name}</span>
              <button type="button" onClick={() => documents.remove(entry.key)} aria-label={`Remove ${entry.name}`} className="-mr-0.5 rounded p-0.5 hover:bg-fill hover:text-fg">
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={box}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        disabled={disabled}
        rows={2}
        aria-label={placeholder}
        placeholder={placeholder}
        // field-sizing-content: the box grows with its text (up to max-h-60, then scrolls)
        className="block max-h-60 min-h-14 w-full resize-none field-sizing-content bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 text-fg placeholder:text-fg-subtle focus:outline-none disabled:cursor-not-allowed"
      />
      <div className="flex items-center gap-2 px-3 pt-1 pb-3">
        {documents && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => picker.current?.click()}
              aria-label="Attach documents"
              title="Attach a syllabus, notes, or a posting (PDF, Word, or text)"
              className="flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-fill hover:text-fg disabled:opacity-50"
            >
              <PaperclipIcon className="size-4" />
            </button>
            <input
              ref={picker}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) documents.addFiles(e.target.files);
                e.target.value = ""; // so choosing the same file again still fires
              }}
            />
          </>
        )}
        {documents && documents.failed > 0 && <span className="text-xs text-fg-subtle">Files that couldn't be read are left out.</span>}
        <span className="flex-1" />
        <Button variant="primary" size="sm" onClick={send} disabled={!ready} icon={<ArrowUpIcon className="size-3.5" />} className="h-8 shrink-0 rounded-lg px-3">
          {documents?.reading ? "Reading…" : sendLabel}
        </Button>
      </div>
    </div>
  );
}
