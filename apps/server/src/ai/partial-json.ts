// Reads one string field out of JSON that is still being written, so the tutor's message can
// be shown as it streams: '{"message":"The step resp' → "The step resp".
// Returns null until the field has started.
export function partialStringField(json: string, field: string): string | null {
  const start = json.match(new RegExp(`"${field}"\\s*:\\s*"`));
  if (!start || start.index === undefined) return null;

  let out = "";
  for (let i = start.index + start[0].length; i < json.length; i += 1) {
    const ch = json[i]!;
    if (ch === '"') return out; // the field is complete
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) return out; // an escape cut in half: wait for the rest
    if (next === "u") {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    out += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[next] ?? next; // \" \\ \/ stay as is
    i += 1;
  }
  return out;
}
