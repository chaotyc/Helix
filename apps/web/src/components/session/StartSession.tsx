// What the Sessions tab shows when no session is open: start one.
import type { SessionKind } from "@helix/contracts";
import { BUTTON } from "../ui.tsx";

type Props = { hasMap: boolean; error: string | null; onStart: (kind: SessionKind) => void };

const KINDS: { kind: SessionKind; title: string; text: string }[] = [
  { kind: "diagnostic", title: "Diagnostic", text: "Up to 15 questions to find what you already know. The map colors in as you answer." },
  { kind: "tutoring", title: "Tutoring session", text: "Two short reviews, then the next concept you're ready for, taught one step at a time." },
];

export function StartSession({ hasMap, error, onStart }: Props) {
  if (!hasMap) return <div className="p-8 text-sm text-zinc-500">Build this goal's map first (the Map tab), then start a session.</div>;
  return (
    <div className="flex max-w-2xl flex-col gap-4 p-8">
      {KINDS.map((k) => (
        <div key={k.kind} className="flex items-center gap-4 rounded-lg border border-zinc-800 p-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-zinc-100">{k.title}</div>
            <div className="text-xs text-zinc-400">{k.text}</div>
          </div>
          <button onClick={() => onStart(k.kind)} className={BUTTON}>
            Start
          </button>
        </div>
      ))}
      {error && <div className="rounded-md bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>}
    </div>
  );
}
