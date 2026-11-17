// Grok on your Grok account, through the Grok CLI's ACP mode (`grok agent stdio`), as xAI's
// headless docs describe: initialize → authenticate with the saved login → session/new →
// session/set_model → session/prompt, with the reply arriving as agent_message_chunk updates.
// The CLI has no schema flag, so the prompt carries the schema and the JSON is cut out of the reply.
// Not yet run against the real CLI (it isn't installed on the machine this was built on).
import { parseModelId, modelIdFor, type Effort } from "@helix/contracts";
import type { ModelCall } from "../../model-call.ts";
import { pickEffort } from "../effort.ts";
import { AcpClient } from "./acp.ts";
import { extractJson, oneShotPrompt } from "./prompt.ts";
import { TOOL_TIMEOUT_MS, requireCommand, toolEnv, withTempDir } from "./tools.ts";

type InitializeResult = { authMethods?: { id?: string }[] };
type AvailableModel = { modelId: string; _meta?: { reasoningEfforts?: { value?: string }[] } };
type NewSessionResult = { sessionId: string; models?: { currentModelId?: string; availableModels?: AvailableModel[] } };
type PromptResult = { stopReason?: string; usage?: { inputTokens?: number; outputTokens?: number } };
type Update = { sessionUpdate?: string; content?: { type?: string; text?: string } };

export const callGrokCli: ModelCall = async (request) => {
  const command = requireCommand("grok", "Grok CLI");
  const { model } = parseModelId(request.model);
  return withTempDir(async (cwd) => {
    const acp = new AcpClient({ command, args: ["--no-auto-update", "--permission-mode", "default", "agent", "stdio"], cwd, env: toolEnv(command) });
    const timer = setTimeout(() => acp.close(), TOOL_TIMEOUT_MS);
    let text = "";
    acp.onNotification((method, params) => {
      if (method !== "session/update") return;
      const update = params.update as Update | undefined;
      if (update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        text += update.content.text ?? "";
        request.onText?.(text);
      } else if (update?.sessionUpdate === "agent_thought_chunk") {
        request.onThinking?.();
      }
    });
    try {
      const init = await acp.request<InitializeResult>("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "helix", version: "0.1.0" },
      });
      if (init.authMethods?.some((m) => m.id === "cached_token")) {
        // headless: fail instead of opening a browser when there's no saved login
        await acp.request("authenticate", { methodId: "cached_token", _meta: { headless: true } }).catch(() => {
          throw new Error("Grok CLI isn't signed in. Run `grok login` in Terminal, or use Sign in in Settings.");
        });
      }
      const session = await acp.request<NewSessionResult>("session/new", { cwd, mcpServers: [] });
      const offered = session.models?.availableModels?.find((m) => m.modelId === model);
      const efforts = (offered?._meta?.reasoningEfforts ?? []).flatMap((e) => (e.value ? [e.value as Effort] : []));
      const effort = pickEffort(request.effort, efforts);
      if (model !== session.models?.currentModelId || effort) {
        await acp.request("session/set_model", { sessionId: session.sessionId, modelId: model, ...(effort ? { _meta: { reasoningEffort: effort } } : {}) });
      }
      const prompt = oneShotPrompt(request.system, request.messages, { schema: request.schema });
      const done = await acp.request<PromptResult>("session/prompt", { sessionId: session.sessionId, prompt: [{ type: "text", text: prompt }] });
      if (done.stopReason === "cancelled") throw new Error("Grok CLI cancelled the reply.");
      return {
        stopReason: done.stopReason === "refusal" ? "refusal" : done.stopReason === "max_tokens" ? "max_tokens" : "end_turn",
        text: extractJson(text),
        model: modelIdFor("grok", model),
        inputTokens: done.usage?.inputTokens ?? 0,
        outputTokens: done.usage?.outputTokens ?? 0,
      };
    } catch (err) {
      throw new Error(`Grok CLI failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
      acp.close();
    }
  });
};
