import { depthName } from "@helix/contracts";
import { Badge } from "../ui/Badge.tsx";

type Props = { conceptName: string; depth: number; prompt: string; step?: string };

// A graded question: the answer goes to the grader, with a confidence rating.
export function QuestionCard({ conceptName, depth, prompt, step }: Props) {
  return (
    <div className="ml-10 min-w-0 flex-1 overflow-hidden rounded-xl border border-line-strong bg-raised shadow-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-sunken px-4 py-2 text-xs">
        <Badge tone="accent">Question</Badge>
        <span className="font-medium text-fg">{conceptName}</span>
        <span className="text-fg-subtle">
          Depth {depth} · {depthName(depth)}
        </span>
        {step && (
          <span className="ml-auto text-fg-subtle">
            Step: <span className="text-fg-muted">{step}</span>
          </span>
        )}
      </div>
      <div className="px-4 py-3.5 text-[15px] leading-7 whitespace-pre-wrap text-fg">{prompt}</div>
    </div>
  );
}
