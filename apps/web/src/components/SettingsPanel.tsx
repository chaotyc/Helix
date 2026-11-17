import type { ReactNode } from "react";
import { MODELS, ModelId, ModelRole, type Settings } from "@helix/contracts";
import { desktop } from "../desktop.ts";
import { ApiKeySection } from "./ApiKeySection.tsx";
import { Select } from "./ui/form.tsx";
import { ChipIcon, KeyIcon } from "./ui/icons.tsx";

type Props = {
  settings: Settings | null; // null until the server replies
  onChange: (settings: Settings) => void;
};

const ROLE_INFO: Record<ModelRole, { title: string; detail: string }> = {
  generation: { title: "Generation", detail: "Builds concept maps and asks the clarifying questions." },
  teaching: { title: "Teaching", detail: "Tutors, writes questions, grades answers, and summarizes sessions." },
  evaluation: { title: "Evaluation", detail: "Judges Helix's own output, such as how good a map is." },
};

// "Opus 5.5 · $4 / $20"
function optionLabel(id: ModelId): string {
  const m = MODELS[id];
  return `${m.label} · $${m.inputPerM} / $${m.outputPerM}`;
}

// The settings page: the API key (Mac app only) and which model does each job. Model changes are
// saved on the server at once.
export function SettingsPanel({ settings, onChange }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Settings</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Changes are saved as soon as you make them.</p>

      {desktop && (
        <Section icon={<KeyIcon />} title="Anthropic API key" description="Helix uses your key to build maps, ask questions, and tutor.">
          <ApiKeySection desktop={desktop} />
        </Section>
      )}

      <Section icon={<ChipIcon />} title="Models" description="The model for each job. Prices are per million tokens, input / output.">
        {!settings ? (
          <div className="rounded-xl border border-line bg-raised px-4 py-6 text-center text-[13px] text-fg-subtle">Loading…</div>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised shadow-xs">
            {ModelRole.options.map((role) => (
              <div key={role} className="flex items-center justify-between gap-6 px-4 py-3.5">
                <div className="min-w-0">
                  <label htmlFor={`model-${role}`} className="block text-[13px] font-medium text-fg">
                    {ROLE_INFO[role].title}
                  </label>
                  <div className="mt-0.5 text-xs text-fg-subtle">{ROLE_INFO[role].detail}</div>
                </div>
                <Select
                  id={`model-${role}`}
                  value={settings.models[role]}
                  onChange={(e) => {
                    const model = ModelId.safeParse(e.target.value); // check at the door (rule 2)
                    if (model.success) onChange({ models: { ...settings.models, [role]: model.data } });
                  }}
                  className="w-56 shrink-0"
                >
                  {ModelId.options.map((id) => (
                    <option key={id} value={id}>
                      {optionLabel(id)}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        )}
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
