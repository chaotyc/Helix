// Shared by the agents: turn a Zod schema into the output format the API is given, and check
// an answer against it (JSON first, then shape). Each agent adds its own rules after.
import { z } from "zod";
import type { Check } from "./structured-call.ts";

export function outputSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _unused, ...rest } = z.toJSONSchema(schema);
  return rest;
}

export function parseAnswer<T>(text: string, schema: z.ZodType<T>): Check<T> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["The answer is not valid JSON."] };
  }
  const parsed = schema.safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, problems: [z.prettifyError(parsed.error)] };
}

// The standard retry message: the problems, then a request for the whole answer again.
export function retryWith(problems: string[]): string {
  return ["The checker rejected that answer:", ...problems.map((p) => `- ${p}`), "", "Return the complete corrected answer."].join("\n");
}
