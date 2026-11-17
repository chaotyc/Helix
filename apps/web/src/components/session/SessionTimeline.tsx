import type { TimelineItem } from "@helix/contracts";
import { Spinner } from "../ui/feedback.tsx";
import { FeedbackCard } from "./FeedbackCard.tsx";
import { HelixAvatar } from "./HelixAvatar.tsx";
import { LearnerAnswer } from "./LearnerAnswer.tsx";
import { QuestionCard } from "./QuestionCard.tsx";
import { SummaryCard } from "./SummaryCard.tsx";
import { TaskDivider } from "./TaskDivider.tsx";
import { TutorMessage } from "./TutorMessage.tsx";

type Props = {
  items: TimelineItem[];
  conceptName: (conceptId: string) => string;
  working: string | null; // what the server is doing ("Writing a question…"), or null when idle
};

export function SessionTimeline({ items, conceptName, working }: Props) {
  // Pick the right component for each kind of timeline item.
  function renderItem(item: TimelineItem) {
    switch (item.type) {
      case "tutor":
        return <TutorMessage text={item.text} streaming={item.streaming ?? false} />;
      case "question":
        return <QuestionCard conceptName={conceptName(item.conceptId)} depth={item.depth} prompt={item.prompt} step={item.step} />;
      case "answer":
        return <LearnerAnswer text={item.text} confidence={item.confidence} />;
      case "feedback":
        return <FeedbackCard item={item} />;
      case "task":
        return <TaskDivider label={item.label} />;
      case "summary":
        return <SummaryCard text={item.text} />;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-8 pb-6 @xl/session:px-8">
      {items.map((item) => (
        <div key={item.id} className="flex animate-fade-in">
          {renderItem(item)}
        </div>
      ))}
      {working !== null && (
        <div className="flex animate-fade-in items-center gap-3" role="status">
          <HelixAvatar />
          <span className="flex items-center gap-2 text-[13px] text-fg-subtle">
            <Spinner className="size-3.5" />
            {working}
          </span>
        </div>
      )}
    </div>
  );
}
