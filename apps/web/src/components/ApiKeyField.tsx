// One provider's API key, in the desktop app only. The key goes straight to the app, which encrypts
// it with the system's secret store (macOS keychain, Windows' DPAPI, or a Linux keyring) and restarts
// the server with it; it's never sent to the server as a message.
import { useEffect, useState } from "react";
import { desktopPlatform, type DesktopBridge, type KeyProvider } from "../desktop.ts";
import { Button } from "./ui/Button.tsx";
import { Alert, Spinner } from "./ui/feedback.tsx";
import { INPUT } from "./ui/form.tsx";

type Props = { desktop: DesktopBridge; provider: KeyProvider; placeholder: string };

// Why a key can't be saved, in this system's words.
const NO_SECURE_STORAGE =
  desktopPlatform === "linux"
    ? "No system keyring (such as GNOME Keyring or KWallet) is available, so a key can't be saved safely."
    : desktopPlatform === "win32"
      ? "Windows' secure storage isn't available, so a key can't be saved."
      : "The macOS keychain isn't available, so a key can't be saved.";

export function ApiKeyField({ desktop, provider, placeholder }: Props) {
  const [saved, setSaved] = useState(false);
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
    <div className="flex flex-col gap-2">
      {!canEncrypt && <Alert tone="danger">{NO_SECURE_STORAGE}</Alert>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) run(() => desktop.setProviderKey(provider, key));
        }}
      >
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={saved ? "A key is saved, encrypted; enter one to replace it" : placeholder}
          autoComplete="off"
          aria-label="API key"
          className={`${INPUT} h-8 py-0 font-mono text-[13px]`}
        />
        <Button type="submit" variant="primary" disabled={saving || key.trim() === ""}>
          Save
        </Button>
        {saved && (
          <Button variant="danger" disabled={saving} onClick={() => run(() => desktop.clearProviderKey(provider))}>
            Remove
          </Button>
        )}
      </form>
      {saving && (
        <p className="flex items-center gap-2 text-xs text-fg-subtle">
          <Spinner className="size-3.5" /> Restarting Helix with the new key…
        </p>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
