// Prompts are versioned files (rule 5). A prompt's version is computed from its contents
// (D4): any edit, however small, gives a new version, so you can't forget to bump it.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPTS_DIR = join(import.meta.dirname, "prompts");

export type Prompt = { name: string; text: string; version: string };

// "extract-map" → the text of prompts/extract-map.md and a version like "extract-map@3f9a1c2e".
export function loadPrompt(name: string): Prompt {
  const text = readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8");
  return { name, text, version: promptVersion(name, text) };
}

export function promptVersion(name: string, text: string): string {
  const hash = createHash("sha256").update(text).digest("hex");
  return `${name}@${hash.slice(0, 8)}`;
}
