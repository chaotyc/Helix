// For tests only: a fake model that returns scripted answers in order and remembers every
// request it was sent. Objects are sent back as JSON; { stopReason } fakes a refusal or cut-off.
import type { ModelCall, ModelRequest, ModelResult } from "./model-call.ts";

export type FakeAnswer = object | string | { stopReason: string };

export function fakeModel(answers: FakeAnswer[]) {
  const requests: ModelRequest[] = [];
  const callModel: ModelCall = async (request) => {
    requests.push(structuredClone({ ...request, onText: undefined, onThinking: undefined }));
    const answer = answers[requests.length - 1];
    if (answer === undefined) throw new Error("the fake model ran out of answers");
    const stopReason = typeof answer === "object" && "stopReason" in answer ? String(answer.stopReason) : "end_turn";
    const text = typeof answer === "string" ? answer : "stopReason" in answer ? "" : JSON.stringify(answer);
    request.onThinking?.();
    request.onText?.(text);
    const result: ModelResult = {
      stopReason,
      text,
      native: [{ type: "text", text }],
      model: "claude-opus-5-5",
      inputTokens: 1000,
      outputTokens: 2000,
    };
    return result;
  };
  return { callModel, requests };
}
