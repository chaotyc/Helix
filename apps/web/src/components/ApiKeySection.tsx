// The Anthropic API key, in the Mac app only. The key goes straight to the app, which encrypts it
// with the macOS keychain and restarts the server with it; it's never sent to the server as a message.
import { useEffect, useState } from "react";
import type { DesktopBridge, KeyStatus } from "../desktop.ts";
import { Badge } from "./ui/Badge.tsx";
import { Button } from "./ui/Button.tsx";
import { Alert, Spinner } from "./ui/feedback.tsx";
import { INPUT } from "./ui/form.tsx";

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
    <div className="rounded-xl border border-line bg-raised p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          {status === null
            ? "Checking…"
            : status.saved
              ? "A key is saved, encrypted with your Mac's keychain. Enter a new one to replace it."
              : "No key saved yet. Helix needs one to build maps, ask questions, and tutor."}
        </p>
        {status && <Badge tone={status.saved ? "success" : "warning"}>{status.saved ? "Saved" : "Not set"}</Badge>}
      </div>
      {status && !status.canEncrypt && (
        <Alert tone="danger" className="mb-3">
          The macOS keychain isn't available, so a key can't be saved.
        </Alert>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) run(() => desktop.setKey(key));
        }}
      >
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          aria-label="API key"
          className={`${INPUT} h-8 py-0 font-mono text-[13px]`}
        />
        <Button type="submit" variant="primary" disabled={saving || key.trim() === ""}>
          Save
        </Button>
        {status?.saved && (
          <Button variant="danger" disabled={saving} onClick={() => run(() => desktop.clearKey())}>
            Remove
          </Button>
        )}
      </form>
      {saving && (
        <p className="mt-3 flex items-center gap-2 text-xs text-fg-subtle">
          <Spinner className="size-3.5" /> Restarting Helix with the new key…
        </p>
      )}
      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  );
}
