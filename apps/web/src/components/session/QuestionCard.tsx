import { depthName } from "@helix/contracts";
import { depthClasses } from "../../depth.ts";

type Props = { conceptName: string; depth: number; prompt: string; step?: string };

// A graded question: the answer goes to the grader, with a confidence rating.
export function QuestionCard({ conceptName, depth, prompt, step }: Props) {
  return (
    <div className="max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="font-medium">Question</span>
        <span>·</span>
        <span>{conceptName}</span>
        <span className={`rounded px-1.5 py-0.5 font-mono ${depthClasses(depth)}`}>
          {depth} {depthName(depth)}
        </span>
        {step && <span className="text-zinc-500">· {step}</span>}
      </div>
      <div className="whitespace-pre-wrap text-sm text-zinc-100">{prompt}</div>
    </div>
  );
}
