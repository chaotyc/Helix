// One session: its timeline, and the answer box (or, once it has ended, a way to start another).
// The page's header (in App) shows what the session is and the End button.
import { useEffect, useRef } from "react";
import type { Confidence, Session, TimelineItem } from "@helix/contracts";
import type { SessionStatus } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Alert, Spinner } from "../ui/feedback.tsx";
import { PlayIcon, PlusIcon, RefreshIcon } from "../ui/icons.tsx";
import { Composer, type ComposerMode } from "./Composer.tsx";
import { SessionTimeline } from "./SessionTimeline.tsx";

type Props = {
  session: Session;
  items: TimelineItem[] | undefined; // undefined until the server sends the timeline
  status: SessionStatus | undefined;
  conceptName: (conceptId: string) => string;
  onReply: (text: string, confidence?: Confidence) => void;
  onResume: () => void;
  onNewSession: () => void;
};

export function SessionView({ session, items, status, conceptName, onReply, onResume, onNewSession }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // was the timeline scrolled to the bottom?
  const last = items?.at(-1);
  const busy = status?.busy ?? false;
  const failed = !busy && (status?.detail.startsWith("Failed") ?? false);
  const ended = session.endedAt !== undefined;

  // Whose turn it is decides what the box does.
  const learnersTurn = last?.type === "question" || (last?.type === "tutor" && !last.streaming);
  const mode: ComposerMode = ended || busy || !learnersTurn ? "closed" : last?.type === "question" ? "graded" : "reply";
  const closedText = busy ? (status?.detail ?? "Working…") : "Waiting for Helix";
  // The tutor's streaming text already shows it's working, so the "working" row is for the rest.
  const streaming = last?.type === "tutor" && last.streaming === true;
  const working = busy && !streaming ? (status?.detail || "Working…") : null;
  const stalled = !ended && !busy && !learnersTurn && items !== undefined;

  // A new item scrolls into view. The tutor's text as it streams (and the "working" row) keeps
  // the view at the bottom only if it was there, so you can scroll up and reread meanwhile.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items?.length]);
  useEffect(() => {
    if (pinned.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [last?.type === "tutor" ? last.text : null, working]);

  // When the timeline's space changes (the answer box grows, the window or the concepts panel
  // resizes) and it was at the bottom, keep it there, so the question stays in sight.
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (pinned.current) bottom.current?.scrollIntoView({ block: "end" });
    });
    if (scroller.current) observer.observe(scroller.current);
    if (footer.current) observer.observe(footer.current);
    return () => observer.disconnect();
  }, []);

  function onScroll(): void {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
  }

  return (
    <div className="@container/session flex h-full flex-col">
      {/* No scroll anchoring: new content only arrives at the bottom, and the browser's anchoring
          moves the scroll position on reflow, which would unpin the timeline. */}
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]">
        {items === undefined ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-fg-subtle">
            <Spinner /> Loading the session…
          </div>
        ) : (
          <SessionTimeline items={items} conceptName={conceptName} working={working} />
        )}
        <div ref={bottom} />
      </div>

      {/* The fade: text scrolls softly under the composer instead of being cut off. */}
      <div ref={footer} className="relative shrink-0 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-surface before:to-transparent">
        {ended ? (
          <div className="mx-auto w-full max-w-3xl px-4 pb-6 @xl/session:px-8">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-sunken px-5 py-4">
              <span className="text-[13px] text-fg-muted">This session has ended.</span>
              <Button variant="primary" onClick={onNewSession} icon={<PlusIcon className="size-4" />}>
                New session
              </Button>
            </div>
          </div>
        ) : (
          <>
            {stalled && (
              <div className="mx-auto w-full max-w-3xl px-4 pb-3 @xl/session:px-8">
                <Alert
                  tone={failed ? "danger" : "info"}
                  title={failed ? "Helix couldn't finish that step" : "Helix is waiting to continue"}
                  action={
                    <Button size="sm" variant={failed ? "secondary" : "primary"} onClick={onResume} icon={failed ? <RefreshIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}>
                      {failed ? "Try again" : "Continue"}
                    </Button>
                  }
                >
                  {failed ? status?.detail : "Pick up where the session left off."}
                </Alert>
              </div>
            )}
            <Composer key={last?.id ?? "none"} mode={mode} closedText={closedText} onSend={onReply} />
          </>
        )}
      </div>
    </div>
  );
}
