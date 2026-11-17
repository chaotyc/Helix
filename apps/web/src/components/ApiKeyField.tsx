// One provider's API key, in the Mac app only. The key goes straight to the app, which encrypts it
// with the macOS keychain and restarts the server with it; it's never sent to the server as a message.
import { useEffect, useState } from "react";
import type { DesktopBridge, KeyProvider } from "../desktop.ts";
import { BUTTON, INPUT, QUIET_BUTTON } from "./ui.tsx";

type Props = { desktop: DesktopBridge; provider: KeyProvider; placeholder: string };

export function ApiKeyField({ desktop, provider, placeholder }: Props) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [canEncrypt, setCanEncrypt] = useState(true);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    desktop.keysStatus().then(
      (status) => {
        setSaved(status.saved[provider]);
        setCanEncrypt(status.canEncrypt);
      },
      (err: unknown) => setError(String(err)),
    );
  }, [desktop, provider]);

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
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">
        {saved === null ? "Checking…" : saved ? "A key is saved, encrypted with your Mac's keychain. Enter a new one to replace it." : "No key saved."}
      </span>
      {!canEncrypt && <span className="text-xs text-red-300">The macOS keychain isn't available, so a key can't be saved.</span>}
      <div className="flex gap-2">
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={placeholder} autoComplete="off" className={INPUT} />
        <button disabled={saving || key.trim() === ""} onClick={() => run(() => desktop.setProviderKey(provider, key))} className={BUTTON}>
          Save
        </button>
        {saved && (
          <button disabled={saving} onClick={() => run(() => desktop.clearProviderKey(provider))} className={QUIET_BUTTON}>
            Remove
          </button>
        )}
      </div>
      {saving && <span className="text-xs text-zinc-500">Restarting Helix with the new key…</span>}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}
