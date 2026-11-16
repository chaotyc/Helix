import type { TimelineItem } from "@helix/contracts";
import { FeedbackCard } from "./FeedbackCard.tsx";
import { LearnerAnswer } from "./LearnerAnswer.tsx";
import { QuestionCard } from "./QuestionCard.tsx";
import { SummaryCard } from "./SummaryCard.tsx";
import { TaskDivider } from "./TaskDivider.tsx";
import { TutorMessage } from "./TutorMessage.tsx";

type Props = { items: TimelineItem[]; conceptName: (conceptId: string) => string };

export function SessionTimeline({ items, conceptName }: Props) {
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
    <div className="flex flex-col gap-5 p-8">
      {items.map((item) => (
        <div key={item.id} className="flex">
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
