// Muse on your Meta account, through Muse Code's host (`muse serve`) and Meta's official SDK,
// the same route T3 Code takes: a read-only host (no shell, no file writes) in an empty folder,
// one session, one turn. The host has no schema option, so the prompt carries the schema and the
// JSON is cut out of the final answer.
// Not yet run against the real CLI (it isn't installed on the machine this was built on).
import { MuseClient } from "@muse-code/sdk";
import { modelIdFor, parseModelId } from "@helix/contracts";
import type { ModelCall } from "../../model-call.ts";
import { effortFor } from "../effort.ts";
import { QUIET_LIMITS, startDeadline, timeoutMessage } from "./deadline.ts";
import { extractJson, oneShotPrompt } from "./prompt.ts";
import { requireCommand, toolEnv, toolLaunch, withTempDir } from "./tools.ts";

export const callMuse: ModelCall = async (request) => {
  const museBin = requireCommand("muse", "Muse Code");
  const { model } = parseModelId(request.model);
  const effort = effortFor(request.model, request.effort);
  return withTempDir(async (cwd) => {
    let client: MuseClient;
    try {
      // No shell: on Windows, an npm-installed muse.cmd runs as node <script> (windows-shim.ts).
      const launch = toolLaunch(museBin, ["serve", "--disable-shell", "--disable-write"]);
      client = await MuseClient.spawn({
        museBin: launch.command,
        args: launch.args,
        cwd,
        env: toolEnv(museBin), // without META_API_KEY, which Muse would use before your login
        clientInfo: { name: "helix", version: "0.1.0" },
      });
    } catch (err) {
      throw new Error(`Muse Code couldn't start: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const session = await client.startSession({ workspaceRoot: cwd, modelId: model });
      const prompt = oneShotPrompt(request.system, request.messages, { schema: request.schema });
      const turn = await session.sendUserTurn({ input: [{ type: "text", text: prompt }], ...(effort ? { reasoningEffort: effort } : {}) });

      // Stopped when it goes quiet too long, or runs past the ceiling (deadline.ts).
      let stop!: (err: Error) => void;
      const stopped = new Promise<never>((_, reject) => (stop = reject));
      const deadline = startDeadline(QUIET_LIMITS, (kind) => stop(new Error(timeoutMessage("Muse Code", kind, QUIET_LIMITS))));

      // The answer is the last finished agent message that isn't commentary (Muse's own rule).
      let finalText: string | undefined;
      const reading = (async () => {
        for await (const item of turn.items()) {
          deadline.touch();
          if (item.kind === "reasoning") request.onThinking?.();
          if (item.kind === "agentMessage" && typeof item.text === "string" && item.messagePhase !== "commentary") {
            request.onText?.(item.text);
            if (item.status === "completed") finalText = item.text;
          }
        }
      })();
      const outcome = await Promise.race([turn.completed, stopped]).finally(() => deadline.clear());
      await reading;

      if (outcome.kind !== "completed" || outcome.params.terminal !== "completed") {
        const why = outcome.kind === "completed" ? (outcome.params.error?.message ?? outcome.params.reason ?? outcome.params.terminal) : outcome.kind;
        throw new Error(`Muse Code didn't finish the reply: ${why}. If you're signed out, run \`muse\` in Terminal and sign in.`);
      }
      const usage = outcome.params.usage;
      return {
        stopReason: outcome.params.error?.requestDenied ? "refusal" : "end_turn",
        text: extractJson(finalText ?? ""),
        model: modelIdFor("muse", model),
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      };
    } finally {
      await client.close();
    }
  });
};
