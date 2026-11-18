import { z } from "zod";
import type { Effort } from "./extraction.ts";

// How Helix reaches a model: a "connection".
//   api  Helix calls the maker's API with your API key. Billed per token.
//   cli  Helix runs the maker's own command-line tool, signed in with your subscription
//        (ChatGPT, Claude, Google AI, Grok, Meta). The tool owns the login; Helix never sees it.
//        Covered by the plan's usage limits, not billed per token.
export const Connection = z.enum([
  "anthropic",
  "openai",
  "google",
  "xai",
  "meta",
  "claude-code",
  "codex",
  "antigravity",
  "grok",
  "muse",
]);
export type Connection = z.infer<typeof Connection>;

export type ConnectionInfo = {
  id: Connection;
  label: string; // "OpenAI API", "Codex (ChatGPT plan)"
  maker: "Anthropic" | "OpenAI" | "Google" | "xAI" | "Meta";
  kind: "api" | "cli";
  keyEnv?: string; // api: the environment variable that holds the key
  keyPlaceholder?: string; // api: what a key starts with
  keyUrl?: string; // api: where to create a key
  command?: string; // cli: the tool's command
  plan?: string; // cli: the subscription it signs in with
  signIn?: string; // cli: how to sign in, run in Terminal
  // cli: arguments that sign in without a terminal (Helix runs it and shows the link). Missing:
  // the tool only signs in interactively, so the settings tab shows `signIn` instead.
  signInArgs?: string[];
  installUrl?: string; // cli: how to install the tool
  // Whether Helix has been run for real through this connection (a map, a grade, a tutor turn).
  // Untested ones show a Beta tag. Set it once a real run has worked.
  tested: boolean;
};

export const CONNECTIONS: Record<Connection, ConnectionInfo> = {
  anthropic: {
    id: "anthropic",
    tested: false,
    label: "Anthropic API",
    maker: "Anthropic",
    kind: "api",
    keyEnv: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://platform.claude.com/settings/keys",
  },
  openai: {
    id: "openai",
    tested: false,
    label: "OpenAI API",
    maker: "OpenAI",
    kind: "api",
    keyEnv: "OPENAI_API_KEY",
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  google: {
    id: "google",
    tested: false,
    label: "Gemini API",
    maker: "Google",
    kind: "api",
    keyEnv: "GEMINI_API_KEY",
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  xai: {
    id: "xai",
    tested: false,
    label: "xAI API",
    maker: "xAI",
    kind: "api",
    keyEnv: "XAI_API_KEY",
    keyPlaceholder: "xai-…",
    keyUrl: "https://console.x.ai",
  },
  meta: {
    id: "meta",
    tested: false,
    label: "Meta Model API",
    maker: "Meta",
    kind: "api",
    keyEnv: "META_API_KEY",
    keyPlaceholder: "LLM_…",
    keyUrl: "https://dev.meta.ai",
  },
  "claude-code": {
    id: "claude-code",
    tested: true,
    label: "Claude Code (Claude plan)",
    maker: "Anthropic",
    kind: "cli",
    command: "claude",
    plan: "Claude Pro or Max",
    signIn: "claude auth login",
    signInArgs: ["auth", "login", "--claudeai"],
    installUrl: "https://code.claude.com/docs/en/setup",
  },
  codex: {
    id: "codex",
    tested: true,
    label: "Codex (ChatGPT plan)",
    maker: "OpenAI",
    kind: "cli",
    command: "codex",
    plan: "ChatGPT Plus, Pro, or Business",
    signIn: "codex login",
    signInArgs: ["login"],
    installUrl: "https://developers.openai.com/codex/cli",
  },
  antigravity: {
    id: "antigravity",
    tested: true,
    label: "Antigravity (Google AI plan)",
    maker: "Google",
    kind: "cli",
    command: "agy",
    plan: "Google AI Pro or Ultra",
    signIn: "agy   (then sign in with Google, and quit)",
    installUrl: "https://antigravity.google/docs/getting-started",
  },
  grok: {
    id: "grok",
    tested: false,
    label: "Grok CLI (Grok account)",
    maker: "xAI",
    kind: "cli",
    command: "grok",
    plan: "your Grok account",
    signIn: "grok login",
    signInArgs: ["login"],
    installUrl: "https://docs.x.ai/build/cli",
  },
  muse: {
    id: "muse",
    tested: false,
    label: "Muse Code (Meta account)",
    maker: "Meta",
    kind: "cli",
    command: "muse",
    plan: "your Meta account",
    signIn: "muse   (then choose Sign in with your browser, and quit)",
    installUrl: "https://dev.meta.ai/docs/muse-code",
  },
};

// ---- Model ids ----
// What settings store and every log records (ai_call, evidence, map_event): the connection and
// the maker's model id, "codex:gpt-6.1-sol". Claude by Anthropic API key is the one exception: a
// bare id, "claude-opus-5-5", as before connections existed, so older rows keep their meaning.
const PREFIXED = Connection.options.filter((c) => c !== "anthropic").join("|");
const MODEL_ID_PATTERN = new RegExp(`^(?:claude-[\\w.-]+|(?:${PREFIXED}):\\w[\\w.-]*)$`);

export const ModelId = z.string().regex(MODEL_ID_PATTERN, "Not a model id: expected claude-… or <connection>:<model>, e.g. codex:gpt-6.1-sol");
export type ModelId = z.infer<typeof ModelId>;

export function parseModelId(id: string): { connection: Connection; model: string } {
  const colon = id.indexOf(":");
  if (colon === -1) return { connection: "anthropic", model: id };
  const connection = Connection.parse(id.slice(0, colon));
  return { connection, model: id.slice(colon + 1) };
}

export function modelIdFor(connection: Connection, model: string): ModelId {
  return connection === "anthropic" ? model : `${connection}:${model}`;
}

// ---- The catalog: models offered in the settings tab ----
// CLI connections also list what the signed-in account offers (the server asks the tool), so a
// model missing here can still be picked there.

export type ModelInfo = {
  id: ModelId;
  connection: Connection;
  model: string; // the maker's id
  label: string;
  // Effort levels the model accepts. Helix asks for an effort per agent; a level the model lacks
  // becomes the nearest one it has (see the server's pickEffort). Empty: no effort control.
  efforts: readonly Effort[];
  // US dollars per million tokens, for API connections (checked 2026-11). A subscription has no
  // per-call price, so CLI models have none and their calls get no cost estimate.
  inputPerM?: number;
  outputPerM?: number;
  // Some models charge more for the whole call once the prompt passes a size.
  longPrompt?: { aboveTokens: number; inputPerM: number; outputPerM: number };
  // Whether the API can re-run a refused request on another model automatically (Anthropic only).
  refusalFallback?: boolean;
};

const ALL: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];
const TO_HIGH: readonly Effort[] = ["low", "medium", "high"];
const TO_XHIGH: readonly Effort[] = ["low", "medium", "high", "xhigh"];

type Entry = Omit<ModelInfo, "id" | "connection" | "model">;
function models(connection: Connection, entries: Record<string, Entry>): ModelInfo[] {
  return Object.entries(entries).map(([model, info]) => ({ id: modelIdFor(connection, model), connection, model, ...info }));
}

export const MODEL_LIST: readonly ModelInfo[] = [
  ...models("anthropic", {
    "claude-fable-5-1": { label: "Fable 5.1", efforts: ALL, inputPerM: 10, outputPerM: 50, refusalFallback: true },
    "claude-opus-5-5": { label: "Opus 5.5", efforts: ALL, inputPerM: 4, outputPerM: 20, refusalFallback: true },
    "claude-sonnet-5-5": { label: "Sonnet 5.5", efforts: ALL, inputPerM: 2, outputPerM: 10, refusalFallback: false },
    "claude-haiku-5-5": {
      label: "Haiku 5.5",
      efforts: ALL,
      inputPerM: 0.1,
      outputPerM: 0.5,
      longPrompt: { aboveTokens: 100_000, inputPerM: 0.5, outputPerM: 2.5 },
      refusalFallback: false,
    },
  }),
  ...models("openai", {
    "gpt-6-astra": { label: "GPT-6 Astra", efforts: ALL, inputPerM: 10, outputPerM: 50, longPrompt: { aboveTokens: 272_000, inputPerM: 20, outputPerM: 75 } },
    "gpt-6.1-sol": { label: "GPT-6.1 Sol", efforts: ALL, inputPerM: 2, outputPerM: 10, longPrompt: { aboveTokens: 272_000, inputPerM: 4, outputPerM: 15 } },
    "gpt-6.1-terra": { label: "GPT-6.1 Terra", efforts: ALL, inputPerM: 1, outputPerM: 5, longPrompt: { aboveTokens: 272_000, inputPerM: 2, outputPerM: 7.5 } },
    "gpt-6-luna": { label: "GPT-6 Luna", efforts: ALL, inputPerM: 0.1, outputPerM: 0.5, longPrompt: { aboveTokens: 272_000, inputPerM: 0.2, outputPerM: 0.75 } },
  }),
  // Google raises Carbon and Argon to $4 / $20 on 2026-12-01, and 3.8 Flash to $1.50 / $7.50 on 2027-01-01.
  ...models("google", {
    "gemini-4-carbon": { label: "Gemini 4 Carbon", efforts: TO_HIGH, inputPerM: 2, outputPerM: 10 },
    "gemini-4-argon": { label: "Gemini 4 Argon", efforts: TO_HIGH, inputPerM: 2, outputPerM: 10 },
    "gemini-4-hydrogen": { label: "Gemini 4 Hydrogen", efforts: TO_XHIGH, inputPerM: 1.5, outputPerM: 7.5 },
    "gemini-3.8-flash": { label: "Gemini 3.8 Flash", efforts: TO_HIGH, inputPerM: 0.75, outputPerM: 3.75 },
  }),
  ...models("xai", {
    "grok-4.7": { label: "Grok 4.7", efforts: TO_XHIGH, inputPerM: 2, outputPerM: 6, longPrompt: { aboveTokens: 200_000, inputPerM: 4, outputPerM: 12 } },
    "grok-4.6": { label: "Grok 4.6", efforts: TO_XHIGH, inputPerM: 2, outputPerM: 6, longPrompt: { aboveTokens: 200_000, inputPerM: 4, outputPerM: 12 } },
    "grok-4.3": { label: "Grok 4.3", efforts: [], inputPerM: 1.25, outputPerM: 2.5, longPrompt: { aboveTokens: 200_000, inputPerM: 2.5, outputPerM: 5 } },
  }),
  ...models("meta", {
    "muse-wonder-1.0": { label: "Muse Wonder 1.0 (preview)", efforts: ALL, inputPerM: 4, outputPerM: 20 },
    "muse-spark-1.3": { label: "Muse Spark 1.3", efforts: ALL, inputPerM: 1.25, outputPerM: 4.25 },
    "muse-ember-1.0": { label: "Muse Ember 1.0", efforts: ALL, inputPerM: 0.1, outputPerM: 0.5, longPrompt: { aboveTokens: 200_000, inputPerM: 0.3, outputPerM: 1.5 } },
  }),
  ...models("claude-code", {
    "claude-opus-5-5": { label: "Opus 5.5", efforts: ALL },
    "claude-sonnet-5-5": { label: "Sonnet 5.5", efforts: ALL },
    "claude-haiku-5-5": { label: "Haiku 5.5", efforts: ALL },
  }),
  ...models("codex", {
    "gpt-6.1-sol": { label: "GPT-6.1 Sol", efforts: ALL },
    "gpt-6-astra": { label: "GPT-6 Astra", efforts: ALL },
    "gpt-6.1-terra": { label: "GPT-6.1 Terra", efforts: ALL },
    "gpt-6-luna": { label: "GPT-6 Luna", efforts: ALL },
  }),
  // Antigravity names one model per effort ("gemini-4-argon-high"); Helix stores the base name and
  // picks the variant for each call's effort.
  ...models("antigravity", {
    "gemini-4-argon": { label: "Gemini 4 Argon", efforts: TO_HIGH },
    "gemini-4-hydrogen": { label: "Gemini 4 Hydrogen", efforts: TO_XHIGH },
    "gemini-3.8-flash": { label: "Gemini 3.8 Flash", efforts: TO_HIGH },
    "claude-opus-5-5": { label: "Claude Opus 5.5", efforts: TO_HIGH },
    "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", efforts: TO_HIGH },
  }),
  ...models("grok", {
    "grok-4.6": { label: "Grok 4.6", efforts: TO_XHIGH },
    "grok-4.6-fast": { label: "Grok 4.6 Fast", efforts: ["low", "high"] },
  }),
  ...models("muse", {
    "muse-spark-1.3": { label: "Muse Spark 1.3", efforts: ALL },
    "muse-wonder-1.0": { label: "Muse Wonder 1.0 (preview)", efforts: ALL },
  }),
];

// Lookup by id. A model the account offers but the catalog doesn't list is missing here.
export const MODELS: Readonly<Record<ModelId, ModelInfo | undefined>> = Object.fromEntries(MODEL_LIST.map((m) => [m.id, m]));

// "GPT-6.1 Sol" for a catalog model, else the maker's id.
export function modelLabel(id: ModelId): string {
  return MODELS[id]?.label ?? parseModelId(id).model;
}

// ---- What the server reports about each connection (settings tab) ----

export const ProviderState = z.enum([
  "ready", // a key is set, or the tool is installed and signed in
  "unchecked", // the tool is installed, but its sign-in can't be checked without using it
  "signed-out", // the tool is installed, not signed in
  "missing", // no key, or the tool isn't installed
]);
export type ProviderState = z.infer<typeof ProviderState>;

export const ProviderStatus = z.object({
  connection: Connection,
  state: ProviderState,
  detail: z.string(), // one line for the settings tab
  // Models the signed-in account offers, when the tool can list them. Empty: use the catalog.
  models: z.array(z.object({ id: ModelId, label: z.string() })),
});
export type ProviderStatus = z.infer<typeof ProviderStatus>;
