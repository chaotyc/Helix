import type { ErrorTag, TimelineItem } from "@helix/contracts";
import { CheckCircleIcon, XCircleIcon } from "../ui/icons.tsx";

type Props = { item: Extract<TimelineItem, { type: "feedback" }> };

// How each kind of mistake reads in the card's heading.
const ERROR_LABEL: Record<ErrorTag, string> = {
  misconception: "misconception",
  wrong_method: "wrong method",
  slip: "slip",
  incomplete: "incomplete",
  misread: "misread the question",
  no_answer: "no answer",
};

// The grader's verdict on the answer above it.
export function FeedbackCard({ item }: Props) {
  const Icon = item.correct ? CheckCircleIcon : XCircleIcon;
  return (
    <div
      className={`ml-10 min-w-0 flex-1 rounded-xl border px-4 py-3.5 ${item.correct ? "border-success/25 bg-success-soft" : "border-warning/25 bg-warning-soft"}`}
    >
      <div className={`mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold ${item.correct ? "text-success" : "text-warning"}`}>
        <Icon className="size-4" />
        {item.correct ? "Right" : "Not yet"}
        {!item.correct && item.errorTag && <span className="font-normal opacity-80">· {ERROR_LABEL[item.errorTag]}</span>}
      </div>
      <div className="text-[14px] leading-6 whitespace-pre-wrap text-fg">{item.explanation}</div>
      {item.misconception && (
        <div className="mt-3 rounded-lg border border-warning/20 bg-surface/60 px-3 py-2 text-[13px] text-fg-muted">
          <span className="font-medium text-fg">Noted: </span>
          {item.misconception}
        </div>
      )}
    </div>
  );
}
