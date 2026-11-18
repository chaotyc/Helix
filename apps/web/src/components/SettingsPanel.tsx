import type { ReactNode } from "react";
import { CONNECTIONS, Connection, MODELS, MODEL_LIST, ModelId, ModelRole, modelLabel, parseModelId, type ProviderStatus, type Settings } from "@helix/contracts";
import type { SignIn } from "../store.ts";
import { ProvidersSection } from "./ProvidersSection.tsx";
import { Select } from "./ui/form.tsx";
import { ChipIcon, KeyIcon } from "./ui/icons.tsx";

type Props = {
  settings: Settings | null; // null until the server replies
  providers: ProviderStatus[] | null; // null until the server has checked
  signIns: Partial<Record<Connection, SignIn>>;
  onChange: (settings: Settings) => void;
  onRefreshProviders: () => void;
  onSignIn: (connection: Connection) => void;
};

const ROLE_INFO: Record<ModelRole, { title: string; detail: string }> = {
  generation: { title: "Generation", detail: "Builds concept maps and asks the clarifying questions." },
  teaching: { title: "Teaching", detail: "Tutors, writes questions, grades answers, and summarizes sessions." },
  evaluation: { title: "Evaluation", detail: "Judges Helix's own output, such as how good a map is." },
};

type Option = { id: ModelId; label: string };

// "GPT-6.1 Sol · $2 / $10" for an API model; "Opus 5.5 · plan" for a subscription tool's.
function optionLabel(option: Option): string {
  const m = MODELS[option.id];
  if (m?.inputPerM !== undefined && m.outputPerM !== undefined) return `${option.label} · $${m.inputPerM} / $${m.outputPerM}`;
  return CONNECTIONS[parseModelId(option.id).connection].kind === "cli" ? `${option.label} · plan` : option.label;
}

// The models to offer per connection: what a signed-in tool reports, else the catalog.
function optionsByConnection(providers: ProviderStatus[] | null): Map<Connection, Option[]> {
  const byConnection = new Map<Connection, Option[]>();
  for (const connection of Connection.options) {
    const reported = providers?.find((p) => p.connection === connection)?.models ?? [];
    const options = reported.length
      ? reported.map((m) => ({ id: m.id, label: MODELS[m.id]?.label ?? m.label }))
      : MODEL_LIST.filter((m) => m.connection === connection).map((m) => ({ id: m.id, label: m.label }));
    byConnection.set(connection, options);
  }
  return byConnection;
}

// The settings page: which model does each job, and the connections that reach them (subscription
// sign-ins and API keys). Model changes are saved on the server at once.
export function SettingsPanel({ settings, providers, signIns, onChange, onRefreshProviders, onSignIn }: Props) {
  const options = optionsByConnection(providers);
  const state = (c: Connection) => providers?.find((p) => p.connection === c)?.state;

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Settings</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Changes are saved as soon as you make them.</p>

      <Section
        icon={<ChipIcon />}
        title="Models"
        description="The model for each job. API prices are per million tokens, input / output; subscription models use your plan."
      >
        {!settings ? (
          <div className="rounded-xl border border-line bg-raised px-4 py-6 text-center text-[13px] text-fg-subtle">Loading…</div>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised shadow-xs">
            {ModelRole.options.map((role) => {
              const current = settings.models[role];
              return (
                <div key={role} className="flex items-center justify-between gap-6 px-4 py-3.5">
                  <div className="min-w-0">
                    <label htmlFor={`model-${role}`} className="block text-[13px] font-medium text-fg">
                      {ROLE_INFO[role].title}
                    </label>
                    <div className="mt-0.5 text-xs text-fg-subtle">{ROLE_INFO[role].detail}</div>
                  </div>
                  <Select
                    id={`model-${role}`}
                    value={current}
                    onChange={(e) => {
                      const model = ModelId.safeParse(e.target.value); // check at the door (rule 2)
                      if (model.success) onChange({ models: { ...settings.models, [role]: model.data } });
                    }}
                    className="w-64 shrink-0"
                  >
                    {Connection.options.map((connection) => {
                      const s = state(connection);
                      const setUp = s === "ready" || s === "unchecked";
                      const holdsCurrent = parseModelId(current).connection === connection;
                      // Only connections that are set up offer models. The saved choice stays
                      // visible (alone, marked) when its connection isn't, so the selector never
                      // shows a model other than the one Helix will call.
                      const list = setUp ? (options.get(connection) ?? []) : [];
                      const missing = holdsCurrent && !list.some((o) => o.id === current);
                      const withCurrent = missing ? [{ id: current, label: modelLabel(current) }, ...list] : list;
                      if (withCurrent.length === 0) return null;
                      return (
                        <optgroup key={connection} label={`${CONNECTIONS[connection].label}${CONNECTIONS[connection].tested ? "" : " (Beta)"}${setUp || !providers ? "" : " (not set up)"}`}>
                          {withCurrent.map((o) => (
                            <option key={o.id} value={o.id}>
                              {optionLabel(o)}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        icon={<KeyIcon />}
        title="Connections"
        description="A subscription tool is the maker's own command-line app, signed in with your plan; Helix runs it and never sees the login. An API key is billed per token."
      >
        <ProvidersSection providers={providers} signIns={signIns} onRefresh={onRefreshProviders} onSignIn={onSignIn} />
      </Section>
    </div>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 text-fg-subtle">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="text-xs text-fg-subtle">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
