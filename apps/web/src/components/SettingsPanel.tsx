import { MODELS, ModelId, ModelRole, type Settings } from "@helix/contracts";
import { desktop } from "../desktop.ts";
import { ApiKeySection } from "./ApiKeySection.tsx";

type Props = {
  settings: Settings | null; // null until the server replies
  onChange: (settings: Settings) => void;
};

const ROLE_INFO: Record<ModelRole, { title: string; detail: string }> = {
  generation: { title: "Generation", detail: "Builds concept maps and asks the clarifying questions." },
  teaching: { title: "Teaching", detail: "Tutors, writes questions, grades answers, and summarizes sessions." },
  evaluation: { title: "Evaluation", detail: "Judges Helix's own output, such as how good a map is." },
};

// "$4 / $20 per million tokens (in / out)"
function priceLabel(id: ModelId): string {
  const m = MODELS[id];
  return `$${m.inputPerM} / $${m.outputPerM} per M tokens`;
}

// The settings tab: the API key (Mac app only) and which model does each job. Model changes are
// saved on the server at once.
export function SettingsPanel({ settings, onChange }: Props) {
  return (
    <div className="max-w-xl p-8">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">Settings</h1>
      <p className="mb-6 text-sm text-zinc-500">Choose the model for each job. Prices are in / out.</p>

      {desktop && <ApiKeySection desktop={desktop} />}

      <h2 className="mb-3 text-sm font-semibold text-zinc-300">Models</h2>
      {!settings ? (
        <div className="text-sm text-zinc-600">Loading…</div>
      ) : (
        <div className="flex flex-col gap-4">
          {ModelRole.options.map((role) => (
            <label key={role} className="flex items-center justify-between gap-6">
              <span>
                <span className="block text-sm text-zinc-200">{ROLE_INFO[role].title}</span>
                <span className="block text-xs text-zinc-500">{ROLE_INFO[role].detail}</span>
              </span>
              <select
                value={settings.models[role]}
                onChange={(e) => {
                  const model = ModelId.safeParse(e.target.value); // check at the door (rule 2)
                  if (model.success) onChange({ models: { ...settings.models, [role]: model.data } });
                }}
                className="w-64 shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
              >
                {ModelId.options.map((id) => (
                  <option key={id} value={id}>
                    {MODELS[id].label} · {priceLabel(id)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
