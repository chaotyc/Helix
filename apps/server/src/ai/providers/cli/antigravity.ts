// Gemini (and the other models your Google AI plan includes) through the Antigravity CLI, `agy`:
//   agy --print= --input-format stream-json --output-format stream-json --json-schema <file>
// The prompt goes in on stdin as one {"event":"user",...} line (a syllabus can be too long for a
// command-line argument), and the answer streams back as text deltas. The schema is enforced.
// Antigravity names one model per effort ("gemini-4-argon-high"); Helix stores "gemini-4-argon"
// and picks the variant for the effort asked.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effort, MODELS, modelIdFor, parseModelId, type ModelId } from "@helix/contracts";
import type { ModelCall, ModelResult } from "../../model-call.ts";
import { pickEffort } from "../effort.ts";
import { oneShotPrompt } from "./prompt.ts";
import { TOOL_TIMEOUT_MS, failureDetail, findCommand, requireCommand, runTool, toolEnv, withTempDir } from "./tools.ts";

const SUFFIX = new RegExp(`^(.*)-(${Effort.options.join("|")})$`);

type AgyEvent = {
  event?: string;
  step_update?: { step_type?: string; text_delta?: string };
  result?: {
    status?: string; // "SUCCESS" | "ERROR"
    error?: string;
    response?: string;
    structured_output?: unknown;
    finished_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number };
  };
};

export const callAntigravity: ModelCall = async (request) => {
  const command = requireCommand("agy", "Antigravity");
  const { model } = parseModelId(request.model);
  const variant = await variantFor(request.model, model, request.effort);
  let textSoFar = "";
  const result = await withTempDir(async (dir) => {
    const work = join(dir, "work");
    const schemaFile = join(dir, "schema.json");
    await writeFile(schemaFile, JSON.stringify(request.schema));
    await mkdir(work);
    const prompt = oneShotPrompt(request.system, request.messages);
    return runTool({
      command,
      args: ["--print=", "--input-format", "stream-json", "--output-format", "stream-json", "--json-schema", schemaFile, "--model", variant, "--disable-slash-commands"],
      cwd: work,
      env: toolEnv(command),
      stdin: `${JSON.stringify({ event: "user", message: { role: "user", content: prompt } })}\n`,
      timeoutMs: TOOL_TIMEOUT_MS,
      onLine: (line) => {
        const delta = streamedText(line);
        if (delta) {
          textSoFar += delta;
          request.onText?.(textSoFar);
        }
      },
    });
  });
  if (result.timedOut) throw new Error("Antigravity took too long and was stopped.");
  const parsed = parseAgyEvents(result.stdout, model);
  if (!parsed) throw new Error(`Antigravity failed: ${failureDetail(result)}`);
  return parsed;
};

function streamedText(line: string): string {
  try {
    const event = JSON.parse(line) as AgyEvent;
    return event.event === "step_update" && event.step_update?.step_type === "agent_response" ? (event.step_update.text_delta ?? "") : "";
  } catch {
    return "";
  }
}

// The final {"event":"result"} line. Null when there's none.
export function parseAgyEvents(stdout: string, model: string): ModelResult | null {
  let result: AgyEvent["result"];
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line) as AgyEvent;
      if (event.event === "result") result = event.result;
    } catch {
      // not JSON: a log line
    }
  }
  if (!result) return null;
  if (result.status !== "SUCCESS") throw new Error(`Antigravity failed: ${result.error || result.status || "unknown error"}`);
  const usage = result.usage ?? {};
  return {
    stopReason: result.finished_reason === "max_tokens" ? "max_tokens" : "end_turn",
    text: result.structured_output !== undefined ? JSON.stringify(result.structured_output) : (result.response ?? "").trim(),
    model: modelIdFor("antigravity", model),
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: (usage.output_tokens ?? 0) + (usage.thinking_tokens ?? 0),
  };
}

// ---- Models: `agy models` lists one line per model, "id<TAB>label" ----

export type AgyModel = { base: string; label: string; efforts: Effort[] };

// Groups effort variants: "gemini-4-argon-low/-medium/-high" → one model with three efforts.
export function groupAgyModels(listing: string): AgyModel[] {
  const byBase = new Map<string, AgyModel>();
  for (const line of listing.split("\n")) {
    const [id, label = ""] = line.split("\t").map((s) => s.trim());
    if (!id || !/^[\w.-]+$/.test(id) || !line.includes("\t")) continue;
    const match = SUFFIX.exec(id);
    const base = match ? match[1]! : id;
    const entry = byBase.get(base) ?? { base, label: label.replace(/\s*\((Low|Medium|High|XHigh|Max)\)$/i, ""), efforts: [] };
    if (match) entry.efforts.push(match[2] as Effort);
    byBase.set(base, entry);
  }
  return [...byBase.values()];
}

let listing: Promise<AgyModel[]> | null = null;

// What this account offers, asked once per server run (the settings tab refreshes it).
export function agyModels(refresh = false): Promise<AgyModel[]> {
  if (refresh || !listing) {
    listing = listAgyModels().catch((err: unknown) => {
      listing = null;
      throw err;
    });
  }
  return listing;
}

async function listAgyModels(): Promise<AgyModel[]> {
  const command = findCommand("agy");
  if (!command) return [];
  const result = await withTempDir((cwd) => runTool({ command, args: ["models"], cwd, env: toolEnv(command), timeoutMs: 30_000 }));
  if (result.code !== 0) throw new Error(failureDetail(result));
  return groupAgyModels(result.stdout);
}

async function variantFor(id: ModelId, model: string, wanted: Effort): Promise<string> {
  if (SUFFIX.test(model)) return model; // already a variant
  const efforts = MODELS[id]?.efforts ?? (await agyModels().catch(() => [])).find((m) => m.base === model)?.efforts ?? [];
  const effort = pickEffort(wanted, efforts);
  return effort ? `${model}-${effort}` : model;
}
