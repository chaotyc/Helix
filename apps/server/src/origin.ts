// Only pages served from this machine may open a WebSocket to Helix. A browser always says
// which page opened a WebSocket (its Origin), so a website you visit can't drive Helix or spend
// your API credit. Scripts (the evals, a terminal client) send no Origin and are allowed.
export function allowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    return ["127.0.0.1", "localhost"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}
