// Finding out whether a newer Helix exists, from the repository's GitHub Releases.
//
// Helix isn't signed with an Apple Developer ID, so it can't install updates itself: macOS only
// lets an app be replaced in place by a build signed by the same registered developer. Instead,
// main.ts tells the user and opens the download. No Electron here, so this file runs under plain
// Node too.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RELEASES_REPO = "chaotyc/Helix";
const TIMEOUT_MS = 10_000;
const SKIP_FILE = "skipped-update.json"; // in the data folder: the version the user chose to skip

export type Release = {
  version: string; // "0.2.0", without the tag's "v"
  notes: string; // the release description as plain text, possibly empty
  downloadUrl: string; // the Apple silicon .dmg, or the release page if there's none
};

// "v1.2.3" or "1.2.3" → [1, 2, 3]; anything else (pre-releases included) → null.
export function parseVersion(version: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}

// Release notes are Markdown; the macOS dialog shows plain text. Keeps the words, drops the marks
// and the URLs (links can't be clicked there anyway).
export function plainNotes(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/ by @\S+ in https?:\/\/\S+/g, "") // GitHub's generated "… by @name in <link>"
    .replace(/\s*\(?https?:\/\/[^\s)]+\)?/g, "") // bare URLs, with any brackets around them
    .replace(/<[^>]+>/g, "") // HTML tags such as <sup>
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[*-]\s+/gm, "• ") // bullets
    .replace(/(\*\*|__|`)/g, "") // bold and code marks
    .replace(/^Full Changelog:\s*$/gm, "") // its link is gone, so the label goes too
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const isGitHubUrl =(value: unknown): value is string => typeof value === "string" && value.startsWith("https://github.com/");

// Checks GitHub's answer before use: only github.com links are ever handed to the browser.
export function readRelease(body: unknown): Release | null {
  if (typeof body !== "object" || body === null) return null;
  const { tag_name, html_url, body: notes, assets } = body as Record<string, unknown>;
  const version = typeof tag_name === "string" ? parseVersion(tag_name)?.join(".") : undefined;
  if (!version || !isGitHubUrl(html_url)) return null;

  const dmg = Array.isArray(assets)
    ? assets.find((a: unknown) => {
        const { name, browser_download_url } = (a ?? {}) as Record<string, unknown>;
        return typeof name === "string" && name.endsWith("-arm64.dmg") && isGitHubUrl(browser_download_url);
      })
    : undefined;
  return {
    version,
    notes: typeof notes === "string" ? plainNotes(notes) : "",
    downloadUrl: (dmg as { browser_download_url: string } | undefined)?.browser_download_url ?? html_url,
  };
}

// The latest published release (GitHub leaves out drafts and pre-releases), or null if there's none.
export async function latestRelease(repo: string = RELEASES_REPO): Promise<Release | null> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "Helix" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText}`);
  const release = readRelease(await res.json());
  if (!release) throw new Error("GitHub's answer didn't look like a release");
  return release;
}

export function skippedVersion(dataDir: string): string | null {
  try {
    const { version } = JSON.parse(readFileSync(join(dataDir, SKIP_FILE), "utf8")) as { version?: unknown };
    return typeof version === "string" ? version : null;
  } catch {
    return null; // never skipped one, or the file is unreadable
  }
}

export function skipVersion(dataDir: string, version: string): void {
  writeFileSync(join(dataDir, SKIP_FILE), JSON.stringify({ version }));
}
