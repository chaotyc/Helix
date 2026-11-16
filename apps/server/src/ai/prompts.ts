// Prompts are versioned files (rule 5). A prompt's version is computed from its contents
// (D4): any edit, however small, gives a new version, so you can't forget to bump it.
// The version also covers the files that build the request around the data (the "template"),
// since Claude reads that wording too.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPTS_DIR = join(import.meta.dirname, "prompts");

export type Prompt = { name: string; text: string; version: string };

// "extract-map" → the text of prompts/extract-map.md and a version like "extract-map@3f9a1c2e".
// `templateFiles`: absolute paths of the files that write the request, hashed into the version.
// `includes`: shared prompt parts appended to the text, e.g. "depth-levels" (prompts/depth-levels.md),
// so several agents read the same definitions and each one's version changes when they do.
export function loadPrompt(name: string, templateFiles: string[] = [], includes: string[] = []): Prompt {
  const read = (file: string) => readFileSync(join(PROMPTS_DIR, `${file}.md`), "utf8");
  const text = [read(name), ...includes.map(read)].join("\n\n");
  const templates = templateFiles.map((file) => readFileSync(file, "utf8"));
  return { name, text, version: promptVersion(name, text, templates) };
}

export function promptVersion(name: string, text: string, templates: string[] = []): string {
  const hash = createHash("sha256");
  for (const part of [text, ...templates]) hash.update(part).update("\0"); // \0 keeps parts apart
  return `${name}@${hash.digest("hex").slice(0, 8)}`;
}
