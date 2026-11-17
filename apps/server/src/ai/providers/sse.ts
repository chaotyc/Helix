// Reads a server-sent-events response (how the OpenAI-style and Gemini APIs stream): blank-line
// separated events, each with `data:` lines. Yields each event's data parsed as JSON.
// `event:` names are ignored: every API used here repeats the type inside the data.
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true }).replaceAll("\r\n", "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = parseEvent(event);
      if (data !== undefined) yield data;
    }
  }
  const last = parseEvent(buffer);
  if (last !== undefined) yield last;
}

function parseEvent(event: string): unknown {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined; // a keep-alive or a malformed line: skip it
  }
}

// An API's error, without the request (which carries the key in a header, never in the URL here).
export async function apiError(api: string, response: Response): Promise<Error> {
  let detail = "";
  try {
    const text = await response.text();
    const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    detail = typeof json.error === "string" ? json.error : (json.error?.message ?? json.message ?? text);
  } catch {
    detail = response.statusText;
  }
  return new Error(`${api} answered ${response.status}: ${detail.slice(0, 500)}`);
}
