// One session: what it is and what the server is doing, its timeline, and the answer box.
import { useEffect, useRef } from "react";
import type { Confidence, Session, TimelineItem } from "@helix/contracts";
import type { SessionStatus } from "../../store.ts";
import { QUIET_BUTTON } from "../ui.tsx";
import { Composer, type ComposerMode } from "./Composer.tsx";
import { SessionTimeline } from "./SessionTimeline.tsx";

type Props = {
  session: Session;
  items: TimelineItem[] | undefined; // undefined until the server sends the timeline
  status: SessionStatus | undefined;
  conceptName: (conceptId: string) => string;
  onReply: (text: string, confidence?: Confidence) => void;
  onResume: () => void;
  onEnd: () => void;
};

export function SessionView({ session, items, status, conceptName, onReply, onResume, onEnd }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  const last = items?.at(-1);
  const busy = status?.busy ?? false;
  const failed = !busy && (status?.detail.startsWith("Failed") ?? false);
  const ended = session.endedAt !== undefined;

  // Whose turn it is decides what the box does.
  const learnersTurn = last?.type === "question" || (last?.type === "tutor" && !last.streaming);
  const mode: ComposerMode = ended || busy || !learnersTurn ? "closed" : last?.type === "question" ? "graded" : "reply";
  const closedText = ended ? "This session has ended." : busy ? (status?.detail ?? "Working…") : "Waiting for Helix. Press Continue.";

  // Keep the newest item in view, including the tutor's text as it streams.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items?.length, last?.type === "tutor" ? last.text : null]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-2 text-xs">
        <span className="text-zinc-400">{session.kind === "diagnostic" ? "Diagnostic" : "Tutoring"}</span>
        {busy && <span className="rounded bg-sky-950 px-2 py-0.5 text-sky-200">{status?.detail}</span>}
        {failed && <span className="rounded bg-red-950 px-2 py-0.5 text-red-200">{status?.detail}</span>}
        {ended && <span className="text-zinc-600">ended</span>}
        <span className="flex-1" />
        {!ended && !busy && !learnersTurn && items !== undefined && (
          <button onClick={onResume} className={QUIET_BUTTON}>
            {failed ? "Try again" : "Continue"}
          </button>
        )}
        {!ended && !busy && (
          <button onClick={onEnd} className={QUIET_BUTTON}>
            End session
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === undefined ? (
          <div className="p-8 text-sm text-zinc-500">Loading…</div>
        ) : (
          <SessionTimeline items={items} conceptName={conceptName} />
        )}
        <div ref={bottom} />
      </div>

      <Composer key={last?.id ?? "none"} mode={mode} closedText={closedText} onSend={onReply} />
    </div>
  );
}
