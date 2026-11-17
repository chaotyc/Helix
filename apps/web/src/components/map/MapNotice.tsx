// A short note over the map after something happened to it ("Removed “LTI” from this goal",
// "Undid: Add “Convolution”"), with an Undo button when the change can be taken back.
// Hides itself after a while, unless focus is inside it.
import { useEffect, useRef } from "react";
import { Button } from "../ui/Button.tsx";
import { Alert } from "../ui/feedback.tsx";
import { UndoIcon } from "../ui/icons.tsx";

export type Notice = { message: string; undoable: boolean; n: number }; // n: a new notice restarts the timer

type Props = { notice: Notice; onUndo: () => void; onDismiss: () => void };

const SHOW_MS = 8000;

export function MapNotice({ notice, onUndo, onDismiss }: Props) {
  const box = useRef<HTMLDivElement>(null);

  // If the change took focus with it (the inspector closed under it), give it to Undo, so the
  // keyboard isn't left at the top of the page.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost && notice.undoable) box.current?.querySelector("button")?.focus();
  }, [notice.n, notice.undoable]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!box.current?.contains(document.activeElement)) onDismiss();
    }, SHOW_MS);
    return () => clearInterval(timer);
  }, [notice.n, onDismiss]);

  return (
    <div ref={box} className="pointer-events-auto w-96 max-w-full">
      <Alert
        tone="success"
        className="bg-overlay"
        action={
          notice.undoable && (
            <Button size="sm" variant="secondary" icon={<UndoIcon className="size-3.5" />} onClick={onUndo}>
              Undo
            </Button>
          )
        }
        onDismiss={onDismiss}
      >
        {notice.message}
      </Alert>
    </div>
  );
}
