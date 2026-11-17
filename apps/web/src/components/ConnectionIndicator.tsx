import { useAppStore } from "../store.ts";

// Bottom of the sidebar: is the server reachable, and what did the last ping return?
export function ConnectionIndicator() {
  // Each selector picks one piece of the store. This component redraws only when those pieces change.
  const status = useAppStore((state) => state.status);
  const lastPong = useAppStore((state) => state.lastPong);

  const connected = status === "connected";
  const label = { connecting: "Connecting…", connected: "Connected", reconnecting: "Reconnecting…" }[status];

  return (
    <div className="px-2 pt-1.5 text-xs text-fg-subtle" role="status">
      <div className="flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "animate-pulse bg-warning"}`} />
        {label}
      </div>
      {lastPong && (
        <div className="mt-0.5 truncate pl-3.5 text-fg-subtle" title={lastPong.text}>
          Pong: {lastPong.text} · {new Date(lastPong.receivedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
