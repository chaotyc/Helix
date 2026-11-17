// Turns files the learner drops in (PDF, Word, plain text) into text, here in the window, so the
// server gets the same thing it always has: one source text. Nothing is uploaded anywhere.
// The PDF and Word readers are large, so each loads only when its first file arrives.

// One file, read. `text` is empty when nothing could be read (a scanned PDF has no text layer).
export type SourceDocument = { id: string; name: string; text: string; pages?: number };

// What the file picker offers. Anything else that reads as text is accepted too.
export const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.tex,.html,.htm,.rtf,.json";

export async function readDocument(file: File): Promise<SourceDocument> {
  const id = `${file.name}-${file.size}-${file.lastModified}`;
  const name = file.name;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || file.type === "application/pdf") return { id, name, ...(await readPdf(file)) };
  if (lower.endsWith(".docx")) return { id, name, text: await readDocx(file) };
  if (lower.endsWith(".doc")) throw new Error("Old .doc files can't be read. Save it as .docx or PDF.");
  if (file.type.startsWith("image/")) throw new Error("Images can't be read yet. Use a PDF or text file.");
  return { id, name, text: (await file.text()).trim() };
}

// Pasted text becomes a document of its own, so it's treated like any other. It's named after
// its first words, so two pastes can be told apart.
export function pastedDocument(text: string, index: number): SourceDocument {
  const words = text.trim().split(/\s+/);
  const start = words.slice(0, 6).join(" ");
  return { id: `pasted-${index}`, name: `Pasted: ${start}${words.length > 6 ? "…" : ""}`, text: text.trim() };
}

async function readPdf(file: File): Promise<{ text: string; pages: number }> {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const count = pdf.numPages;
  const pages: string[] = [];
  for (let n = 1; n <= count; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    // Each item is a run of text; hasEOL marks where a line ends on the page.
    const line = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")).join("");
    pages.push(line.trim());
  }
  await task.destroy(); // frees the worker's copy of the file
  return { text: pages.filter(Boolean).join("\n\n"), pages: count };
}

async function readDocx(file: File): Promise<string> {
  const { default: mammoth } = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.trim();
}

// Every document as one source text for the clarifier and the extractor, each under its file name
// (the prompt works out what kind of material each one is from its text).
export function combineDocuments(docs: SourceDocument[]): string | undefined {
  const readable = docs.filter((d) => d.text);
  if (readable.length === 0) return undefined;
  if (readable.length === 1) return readable[0].text;
  return readable.map((d) => `=== ${d.name} ===\n${d.text}`).join("\n\n");
}
