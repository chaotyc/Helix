// The connections, for the settings tab: subscription tools (sign in with your plan) and API keys.
// Each row shows what the server found: a key set, a tool installed and signed in.
import { CONNECTIONS, Connection, type ProviderState, type ProviderStatus } from "@helix/contracts";
import { desktop, type KeyProvider } from "../desktop.ts";
import type { SignIn } from "../store.ts";
import { ApiKeyField } from "./ApiKeyField.tsx";
import { QUIET_BUTTON } from "./ui.tsx";

type Props = {
  providers: ProviderStatus[] | null;
  signIns: Partial<Record<Connection, SignIn>>;
  onRefresh: () => void;
  onSignIn: (connection: Connection) => void;
};

const STATE_STYLE: Record<ProviderState, { dot: string; word: string }> = {
  ready: { dot: "bg-emerald-400", word: "Ready" },
  unchecked: { dot: "bg-amber-400", word: "Installed" },
  "signed-out": { dot: "bg-amber-400", word: "Signed out" },
  missing: { dot: "bg-zinc-600", word: "Not set up" },
};

const CLI = Connection.options.filter((c) => CONNECTIONS[c].kind === "cli");
const API = Connection.options.filter((c) => CONNECTIONS[c].kind === "api");

export function ProvidersSection({ providers, signIns, onRefresh, onSignIn }: Props) {
  const status = (c: Connection) => providers?.find((p) => p.connection === c);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Connections</h2>
        <button onClick={onRefresh} className={QUIET_BUTTON}>
          Check again
        </button>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        A subscription tool is the maker's own command-line app, signed in with your plan; Helix runs it and never sees the login. An API key
        is billed per token.
      </p>

      <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Subscriptions</h3>
      <div className="mb-6 flex flex-col divide-y divide-zinc-800 rounded-md border border-zinc-800">
        {CLI.map((c) => (
          <CliRow key={c} connection={c} status={status(c)} signIn={signIns[c]} onSignIn={() => onSignIn(c)} />
        ))}
      </div>

      <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">API keys</h3>
      <div className="flex flex-col divide-y divide-zinc-800 rounded-md border border-zinc-800">
        {API.map((c) => (
          <ApiRow key={c} connection={c} status={status(c)} />
        ))}
      </div>
    </div>
  );
}

function StateBadge({ status }: { status: ProviderStatus | undefined }) {
  if (!status) return <span className="text-xs text-zinc-600">Checking…</span>;
  const style = STATE_STYLE[status.state];
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.word}
    </span>
  );
}

function CliRow({ connection, status, signIn, onSignIn }: { connection: Connection; status?: ProviderStatus; signIn?: SignIn; onSignIn: () => void }) {
  const info = CONNECTIONS[connection];
  const running = signIn !== undefined && signIn.done === null;
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-zinc-200">
          {info.label} <span className="text-xs text-zinc-500">· {info.plan}</span>
        </span>
        <StateBadge status={status} />
      </div>
      {status && <span className="text-xs text-zinc-500">{status.detail}</span>}
      {status?.state === "missing" ? (
        <span className="text-xs text-zinc-500">
          Install <code className="text-zinc-300">{info.command}</code>:{" "}
          <a href={info.installUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
            {info.installUrl}
          </a>
        </span>
      ) : (
        status &&
        status.state !== "ready" && (
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            {info.signInArgs && (
              <button onClick={onSignIn} disabled={running} className={QUIET_BUTTON}>
                {running ? "Signing in…" : "Sign in"}
              </button>
            )}
            <span>
              {info.signInArgs ? "or in Terminal: " : "Sign in from Terminal: "}
              <code className="text-zinc-300">{info.signIn}</code>
            </span>
          </div>
        )
      )}
      {signIn && <SignInOutput signIn={signIn} />}
    </div>
  );
}

// What the tool printed while signing in, with its links clickable (it usually opens the browser
// itself; the link is there in case it didn't).
function SignInOutput({ signIn }: { signIn: SignIn }) {
  const links = [...new Set(signIn.output.match(/https?:\/\/[^\s"'<>]+/g) ?? [])];
  return (
    <div className="flex flex-col gap-1 text-xs">
      {links.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="truncate text-sky-400 hover:underline">
          Open the sign-in page
        </a>
      ))}
      {signIn.output.trim() && (
        <pre className="max-h-32 overflow-y-auto rounded bg-zinc-950 p-2 whitespace-pre-wrap text-zinc-500">{signIn.output.trim()}</pre>
      )}
      {signIn.done && <span className={signIn.done.ok ? "text-emerald-400" : "text-red-300"}>{signIn.done.detail}</span>}
    </div>
  );
}

function ApiRow({ connection, status }: { connection: Connection; status?: ProviderStatus }) {
  const info = CONNECTIONS[connection];
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-zinc-200">
          {info.label}{" "}
          <a href={info.keyUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
            get a key
          </a>
        </span>
        <StateBadge status={status} />
      </div>
      {desktop ? (
        <ApiKeyField desktop={desktop} provider={connection as KeyProvider} placeholder={info.keyPlaceholder ?? ""} />
      ) : (
        <span className="text-xs text-zinc-500">
          Set <code className="text-zinc-300">{info.keyEnv}</code> in <code className="text-zinc-300">apps/server/.env</code>, then restart the
          server.
        </span>
      )}
    </div>
  );
}
