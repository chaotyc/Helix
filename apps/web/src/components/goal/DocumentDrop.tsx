// Where the learner gives Helix its material: drop files, pick them, or paste. Each file is read
// to text in the window (documents.ts); the list shows what was read and how much.
import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ACCEPT, combineDocuments, pastedDocument, readDocument, type SourceDocument } from "../../documents.ts";
import { Button } from "../ui/Button.tsx";
import { Spinner } from "../ui/feedback.tsx";
import { INPUT } from "../ui/form.tsx";
import { FileIcon, UploadIcon, XIcon } from "../ui/icons.tsx";

type Entry = { key: string; name: string; file?: string } & ({ status: "reading" } | { status: "ready"; doc: SourceDocument } | { status: "error"; error: string });

// The list of documents and what can be done to it. Kept in the form that shows the drop zone.
export function useDocuments() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const pasted = useRef(0);

  function addFiles(files: Iterable<File>): void {
    const have = new Set(entries.map((e) => e.file)); // the same file twice is skipped
    for (const file of files) {
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;
      if (have.has(fileId)) continue;
      have.add(fileId);
      const key = `${fileId}-${Math.random()}`;
      setEntries((list) => [...list, { key, name: file.name, file: fileId, status: "reading" }]);
      readDocument(file).then(
        (doc) =>
          setEntries((list) =>
            list.map((e) =>
              e.key !== key ? e : doc.text ? { key, name: e.name, status: "ready", doc } : { key, name: e.name, status: "error", error: "No text found in it (a scanned PDF?)" },
            ),
          ),
        (err: unknown) => {
          console.error(`Couldn't read ${file.name}:`, err); // the details, for whoever is debugging
          setEntries((list) => list.map((e) => (e.key === key ? { key, name: e.name, status: "error", error: plainError(err) } : e)));
        },
      );
    }
  }

  function addText(text: string): void {
    if (!text.trim()) return;
    pasted.current += 1;
    const doc = pastedDocument(text, pasted.current);
    setEntries((list) => [...list, { key: doc.id, name: doc.name, status: "ready", doc }]);
  }

  function remove(key: string): void {
    setEntries((list) => list.filter((e) => e.key !== key));
  }

  const docs = entries.flatMap((e) => (e.status === "ready" ? [e.doc] : []));
  return {
    entries,
    failed: entries.filter((e) => e.status === "error").length,
    addFiles,
    addText,
    remove,
    reading: entries.some((e) => e.status === "reading"),
    sourceText: combineDocuments(docs),
  };
}

export type Documents = ReturnType<typeof useDocuments>;

export function DocumentDrop({ documents }: { documents: Documents }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pasting, setPasting] = useState<string | null>(null); // the paste box's text; null: closed

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    setOver(false);
    documents.addFiles(event.dataTransfer.files);
  }

  // ⌘V on the drop zone: pasted files are added as files, pasted text as a document of its own.
  function onPaste(event: ClipboardEvent): void {
    const files = event.clipboardData.files;
    if (files.length > 0) documents.addFiles(files);
    else documents.addText(event.clipboardData.getData("text/plain"));
    event.preventDefault();
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add documents: drop files, click to choose, or paste"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 ${
          over ? "border-accent bg-accent/5" : "border-line-strong hover:bg-fill"
        }`}
      >
        <UploadIcon className="size-5 text-fg-subtle" />
        <span className="text-[13px] font-medium text-fg">Drop files here, or click to choose</span>
        <span className="text-xs text-fg-subtle">Syllabus, textbook, notes, job posting: PDF, Word, or text.</span>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) documents.addFiles(e.target.files);
            e.target.value = ""; // so choosing the same file again still fires
          }}
        />
      </div>

      {pasting === null ? (
        <button type="button" onClick={() => setPasting("")} className="self-start text-xs font-medium text-accent hover:underline">
          Or paste text instead
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={pasting}
            onChange={(e) => setPasting(e.target.value)}
            rows={6}
            autoFocus
            placeholder="Paste a syllabus, a table of contents, notes…"
            className={`${INPUT} resize-y text-[13px]`}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPasting(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!pasting.trim()}
              onClick={() => {
                documents.addText(pasting);
                setPasting(null);
              }}
            >
              Add text
            </Button>
          </div>
        </div>
      )}

      {documents.entries.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {documents.entries.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
              {entry.status === "reading" ? <Spinner className="size-4 text-fg-subtle" /> : <FileIcon className={`size-4 ${entry.status === "error" ? "text-danger" : "text-fg-subtle"}`} />}
              <span className="min-w-16 flex-1 truncate text-fg" title={entry.name}>
                {entry.name}
              </span>
              <span
                className={`max-w-[60%] min-w-0 truncate text-xs ${entry.status === "error" ? "text-danger" : "text-fg-subtle"}`}
                title={entry.status === "error" ? entry.error : undefined}
              >
                {entry.status === "reading" ? "Reading…" : entry.status === "error" ? entry.error : sizeLabel(entry.doc)}
              </span>
              <button
                type="button"
                onClick={() => documents.remove(entry.key)}
                aria-label={`Remove ${entry.name}`}
                className="-m-0.5 shrink-0 rounded p-0.5 text-fg-subtle hover:bg-fill hover:text-fg"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {documents.failed > 0 && (
        <span className="text-xs text-fg-subtle">
          {documents.failed === 1 ? "1 file couldn't be read and will be left out." : `${documents.failed} files couldn't be read and will be left out.`} Remove it, or paste its text instead.
        </span>
      )}
    </div>
  );
}

function sizeLabel(doc: SourceDocument): string {
  const words = doc.text.split(/\s+/).filter(Boolean).length;
  const wordLabel = words >= 1000 ? `${Math.round(words / 100) / 10}k words` : `${words} words`;
  return doc.pages ? `${doc.pages} ${doc.pages === 1 ? "page" : "pages"} · ${wordLabel}` : wordLabel;
}

// What went wrong, in words for the learner. Our own messages (documents.ts) are already plain;
// anything from the PDF or Word reader is not.
function plainError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (message.startsWith("Old .doc") || message.startsWith("Images can't")) return message;
  if (err instanceof Error && err.name === "PasswordException") return "It's password-protected";
  return "Couldn't read this file";
}
