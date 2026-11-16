// The Anthropic API key, in the Mac app only. The key goes straight to the app, which encrypts it
// with the macOS keychain and restarts the server with it; it's never sent to the server as a message.
import { useEffect, useState } from "react";
import type { DesktopBridge, KeyStatus } from "../desktop.ts";
import { BUTTON, INPUT, QUIET_BUTTON } from "./ui.tsx";

export function ApiKeySection({ desktop }: { desktop: DesktopBridge }) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    desktop.keyStatus().then(setStatus, (err: unknown) => setError(String(err)));
  }, [desktop]);

  // Saving restarts the server and reloads this page, so success needs no message here.
  function run(action: () => Promise<void>): void {
    setSaving(true);
    setError(null);
    action().catch((err: unknown) => {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(err));
      setSaving(false);
    });
  }

  return (
    <div className="mb-8">
      <h2 className="mb-1 text-sm font-semibold text-zinc-300">Anthropic API key</h2>
      <p className="mb-3 text-xs text-zinc-500">
        {status === null
          ? "Checking…"
          : status.saved
            ? "A key is saved, encrypted with your Mac's keychain. Enter a new one to replace it."
            : "No key saved yet. Helix needs one to build maps, ask questions, and tutor."}
      </p>
      {status && !status.canEncrypt && <p className="mb-3 text-xs text-red-300">The macOS keychain isn't available, so a key can't be saved.</p>}
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          className={INPUT}
        />
        <button disabled={saving || key.trim() === ""} onClick={() => run(() => desktop.setKey(key))} className={BUTTON}>
          Save
        </button>
        {status?.saved && (
          <button disabled={saving} onClick={() => run(() => desktop.clearKey())} className={QUIET_BUTTON}>
            Remove
          </button>
        )}
      </div>
      {saving && <p className="mt-2 text-xs text-zinc-500">Restarting Helix with the new key…</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
