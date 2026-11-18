// Claude on your Claude plan, through Claude Code in print mode:
//   claude -p --output-format stream-json --verbose --include-partial-messages
//          --json-schema <schema> --system-prompt <the agent's prompt> --tools "" ...   (prompt on stdin)
// --system-prompt replaces Claude Code's own instructions, and --tools "" gives it no tools, so
// the model sees what the API would send (about 1.5K tokens of overhead). The schema is enforced.
// The answer streams as it's written (claude-stream.ts reads the events).
import { parseModelId } from "@helix/contracts";
import type { ModelCall } from "../../model-call.ts";
import { effortFor } from "../effort.ts";
import { followClaudeStream, parseClaudeStream } from "./claude-stream.ts";
import { STREAMING_LIMITS, timeoutMessage } from "./deadline.ts";
import { oneShotPrompt } from "./prompt.ts";
import { failureDetail, requireCommand, runTool, toolEnv, withTempDir } from "./tools.ts";

export const callClaudeCode: ModelCall = async (request) => {
  const command = requireCommand("claude", "Claude Code");
  const { model } = parseModelId(request.model);
  const effort = effortFor(request.model, request.effort);
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose", // stream-json in print mode requires it
    "--include-partial-messages",
    "--json-schema", JSON.stringify(request.schema),
    "--model", model,
    ...(effort ? ["--effort", effort] : []),
    "--system-prompt", request.system,
    "--tools", "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  const result = await withTempDir((cwd) =>
    runTool({
      command,
      args,
      cwd,
      env: toolEnv(command),
      stdin: oneShotPrompt(null, request.messages),
      timeoutMs: STREAMING_LIMITS.totalMs,
      idleTimeoutMs: STREAMING_LIMITS.idleMs,
      onLine: followClaudeStream(request),
    }),
  );
  if (result.timedOutBy) throw new Error(timeoutMessage("Claude Code", result.timedOutBy, STREAMING_LIMITS));
  const parsed = parseClaudeStream(result.stdout, model);
  if (!parsed) throw new Error(`Claude Code failed: ${failureDetail(result)}`);
  return parsed;
};
