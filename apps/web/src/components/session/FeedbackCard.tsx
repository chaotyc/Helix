import type { TimelineItem } from "@helix/contracts";

type Props = { item: Extract<TimelineItem, { type: "feedback" }> };

// The grader's verdict on the answer above it.
export function FeedbackCard({ item }: Props) {
  return (
    <div className={`max-w-2xl rounded-lg border px-4 py-3 text-sm ${item.correct ? "border-emerald-900 bg-emerald-950/40" : "border-amber-900 bg-amber-950/40"}`}>
      <div className={`mb-1 text-xs font-medium ${item.correct ? "text-emerald-300" : "text-amber-300"}`}>
        {item.correct ? "✓ Right" : `✗ Not yet · ${item.errorTag?.replace("_", " ") ?? ""}`}
      </div>
      <div className="whitespace-pre-wrap text-zinc-200">{item.explanation}</div>
      {item.misconception && <div className="mt-2 text-xs text-amber-200/80">Noted: {item.misconception}</div>}
    </div>
  );
}
