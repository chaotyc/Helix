// The connections, for the settings page: subscription tools (sign in with your plan) and API keys.
// Each row shows what the server found: a key set, a tool installed and signed in.
import type { ReactNode } from "react";
import { CONNECTIONS, Connection, type ProviderState, type ProviderStatus } from "@helix/contracts";
import { desktop, type KeyProvider } from "../desktop.ts";
import type { SignIn } from "../store.ts";
import { ApiKeyField } from "./ApiKeyField.tsx";
import { Badge } from "./ui/Badge.tsx";
import { Button } from "./ui/Button.tsx";
import { Alert, Spinner } from "./ui/feedback.tsx";
import { RefreshIcon } from "./ui/icons.tsx";

type Props = {
  providers: ProviderStatus[] | null;
  signIns: Partial<Record<Connection, SignIn>>;
  onRefresh: () => void;
  onSignIn: (connection: Connection) => void;
};

const STATE_BADGE: Record<ProviderState, { tone: "success" | "warning" | "neutral"; word: string }> = {
  ready: { tone: "success", word: "Ready" },
  unchecked: { tone: "warning", word: "Installed" },
  "signed-out": { tone: "warning", word: "Signed out" },
  missing: { tone: "neutral", word: "Not set up" },
};

const CLI = Connection.options.filter((c) => CONNECTIONS[c].kind === "cli");
const API = Connection.options.filter((c) => CONNECTIONS[c].kind === "api");

const LINK = "text-accent-text hover:underline";
const CODE = "rounded bg-fill px-1 py-0.5 font-mono text-[12px] text-fg";

export function ProvidersSection({ providers, signIns, onRefresh, onSignIn }: Props) {
  const status = (c: Connection) => providers?.find((p) => p.connection === c);
  return (
    <div className="flex flex-col gap-5">
      <Group
        title="Subscriptions"
        action={
          <Button size="sm" variant="ghost" icon={<RefreshIcon className="size-3.5" />} onClick={onRefresh}>
            Check again
          </Button>
        }
      >
        {CLI.map((c) => (
          <CliRow key={c} connection={c} status={status(c)} signIn={signIns[c]} onSignIn={() => onSignIn(c)} />
        ))}
      </Group>
      <Group title="API keys">
        {API.map((c) => (
          <ApiRow key={c} connection={c} status={status(c)} />
        ))}
      </Group>
    </div>
  );
}

function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex h-7 items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{title}</h3>
        {action}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised shadow-xs">{children}</div>
    </div>
  );
}

// Shown on connections and buttons that have never been run for real (`tested` in contracts).
function BetaBadge() {
  return (
    <span title="Not yet tested with real calls. Please report problems on GitHub.">
      <Badge tone="accent" className="ml-1.5 align-middle">
        Beta
      </Badge>
    </span>
  );
}

function Row({ title, detail, status, beta, children }: { title: ReactNode; detail?: string; status?: ProviderStatus; beta?: boolean; children?: ReactNode }) {
  const badge = status && STATE_BADGE[status.state];
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-fg">
            {title}
            {beta && <BetaBadge />}
          </div>
          {detail && <div className="mt-0.5 text-xs text-fg-subtle">{detail}</div>}
        </div>
        {badge ? (
          <Badge tone={badge.tone}>{badge.word}</Badge>
        ) : (
          <Badge>
            <Spinner className="size-3" /> Checking
          </Badge>
        )}
      </div>
      {children}
    </div>
  );
}

function CliRow({ connection, status, signIn, onSignIn }: { connection: Connection; status?: ProviderStatus; signIn?: SignIn; onSignIn: () => void }) {
  const info = CONNECTIONS[connection];
  const running = signIn !== undefined && signIn.done === null;
  const title = (
    <>
      {info.label} <span className="font-normal text-fg-subtle">· {info.plan}</span>
    </>
  );
  return (
    <Row title={title} detail={status?.detail} status={status} beta={!info.tested}>
      {status?.state === "missing" ? (
        <p className="text-xs text-fg-muted">
          Install <code className={CODE}>{info.command}</code>:{" "}
          <a href={info.installUrl} target="_blank" rel="noreferrer" className={LINK}>
            {info.installUrl}
          </a>
        </p>
      ) : (
        status &&
        status.state !== "ready" && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
            {info.signInArgs && (
              <Button size="sm" variant="primary" disabled={running} icon={running ? <Spinner className="size-3.5" /> : undefined} onClick={onSignIn}>
                {running ? "Signing in…" : "Sign in"}
              </Button>
            )}
            {/* No in-app sign-in has been run for real yet: it could replace a working login. */}
            {info.signInArgs && <BetaBadge />}
            <span>
              {info.signInArgs ? "or in Terminal: " : "Sign in from Terminal: "}
              <code className={CODE}>{info.signIn}</code>
            </span>
          </div>
        )
      )}
      {signIn && <SignInOutput signIn={signIn} />}
    </Row>
  );
}

// What the tool printed while signing in, with its links clickable (it usually opens the browser
// itself; the link is there in case it didn't).
function SignInOutput({ signIn }: { signIn: SignIn }) {
  const links = [...new Set(signIn.output.match(/https?:\/\/[^\s"'<>]+/g) ?? [])];
  return (
    <div className="flex flex-col gap-2">
      {links.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className={`text-xs ${LINK}`}>
          Open the sign-in page
        </a>
      ))}
      {signIn.output.trim() && (
        <pre className="max-h-32 overflow-y-auto rounded-lg bg-fill p-2.5 font-mono text-[11px] whitespace-pre-wrap text-fg-muted">{signIn.output.trim()}</pre>
      )}
      {signIn.done && <Alert tone={signIn.done.ok ? "success" : "danger"}>{signIn.done.detail}</Alert>}
    </div>
  );
}

function ApiRow({ connection, status }: { connection: Connection; status?: ProviderStatus }) {
  const info = CONNECTIONS[connection];
  const title = (
    <>
      {info.label}{" "}
      <a href={info.keyUrl} target="_blank" rel="noreferrer" className={`text-xs font-normal ${LINK}`}>
        Get a key
      </a>
    </>
  );
  return (
    <Row title={title} status={status} beta={!info.tested}>
      {desktop ? (
        <ApiKeyField desktop={desktop} provider={connection as KeyProvider} placeholder={info.keyPlaceholder ?? ""} />
      ) : (
        <p className="text-xs text-fg-muted">
          Set <code className={CODE}>{info.keyEnv}</code> in <code className={CODE}>apps/server/.env</code>, then restart the server.
        </p>
      )}
    </Row>
  );
}
