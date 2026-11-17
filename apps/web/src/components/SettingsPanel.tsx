import { CONNECTIONS, Connection, MODELS, MODEL_LIST, ModelId, ModelRole, modelLabel, parseModelId, type ProviderStatus, type Settings } from "@helix/contracts";
import type { SignIn } from "../store.ts";
import { ProvidersSection } from "./ProvidersSection.tsx";

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

// "$4 / $20 per M tokens" for an API model; "plan" for a subscription tool's.
function priceLabel(id: ModelId): string {
  const m = MODELS[id];
  if (m?.inputPerM !== undefined && m.outputPerM !== undefined) return `$${m.inputPerM} / $${m.outputPerM} per M tokens`;
  return CONNECTIONS[parseModelId(id).connection].kind === "cli" ? "your plan" : "price unknown";
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

// The settings tab: which model does each job, and the connections that reach them (API keys and
// subscription sign-ins). Model changes are saved on the server at once.
export function SettingsPanel({ settings, providers, signIns, onChange, onRefreshProviders, onSignIn }: Props) {
  const options = optionsByConnection(providers);
  const state = (c: Connection) => providers?.find((p) => p.connection === c)?.state;

  return (
    <div className="max-w-2xl p-8">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">Settings</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Choose the model for each job. API models show their price (in / out); models through a subscription tool use your plan.
      </p>

      <h2 className="mb-3 text-sm font-semibold text-zinc-300">Models</h2>
      {!settings ? (
        <div className="text-sm text-zinc-600">Loading…</div>
      ) : (
        <div className="mb-10 flex flex-col gap-4">
          {ModelRole.options.map((role) => {
            const current = settings.models[role];
            return (
              <label key={role} className="flex items-center justify-between gap-6">
                <span>
                  <span className="block text-sm text-zinc-200">{ROLE_INFO[role].title}</span>
                  <span className="block text-xs text-zinc-500">{ROLE_INFO[role].detail}</span>
                </span>
                <select
                  value={current}
                  onChange={(e) => {
                    const model = ModelId.safeParse(e.target.value); // check at the door (rule 2)
                    if (model.success) onChange({ models: { ...settings.models, [role]: model.data } });
                  }}
                  className="w-80 shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
                >
                  {Connection.options.map((connection) => {
                    const list = options.get(connection) ?? [];
                    // Keep the saved choice visible even when its connection no longer lists it.
                    const missing = parseModelId(current).connection === connection && !list.some((o) => o.id === current);
                    const withCurrent = missing ? [{ id: current, label: modelLabel(current) }, ...list] : list;
                    if (withCurrent.length === 0) return null;
                    const s = state(connection);
                    const setUp = s === "ready" || s === "unchecked";
                    return (
                      <optgroup key={connection} label={`${CONNECTIONS[connection].label}${s && !setUp ? " (not set up)" : ""}`}>
                        {withCurrent.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label} · {priceLabel(o.id)}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
            );
          })}
        </div>
      )}

      <ProvidersSection providers={providers} signIns={signIns} onRefresh={onRefreshProviders} onSignIn={onSignIn} />
    </div>
  );
}
