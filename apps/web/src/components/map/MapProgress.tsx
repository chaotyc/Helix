// What the map page shows while Claude reads the source or builds the map.
import type { ExtractionStage } from "@helix/contracts";
import { Spinner } from "../ui/feedback.tsx";
import { BuildSteps } from "./BuildSteps.tsx";

export const STAGE_LABEL: Record<ExtractionStage, string> = {
  started: "Starting",
  thinking: "Thinking",
  writing: "Writing the map",
  checking: "Checking the map",
  retrying: "Fixing what the check found",
  asked: "Questions ready",
  saved: "Saved",
  failed: "Failed",
};

type Props = {
  stage: ExtractionStage;
  detail: string;
  step: 1 | 2; // 1 while the questions are being written, 2 while the map is built
};

export function MapProgress({ stage, detail, step }: Props) {
  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <BuildSteps current={step} />
      <div className="mt-8 overflow-hidden rounded-xl border border-line bg-raised shadow-xs">
        <div className="flex items-start gap-4 p-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <Spinner className="size-5" />
          </span>
          <div className="min-w-0 flex-1" role="status">
            <div className="text-[15px] font-semibold text-fg">{STAGE_LABEL[stage]}…</div>
            <div className="mt-0.5 text-[13px] text-fg-muted">{detail}</div>
          </div>
        </div>
        <div className="h-1 overflow-hidden bg-fill">
          <div className="h-full w-1/3 animate-slide rounded-full bg-accent/70" />
        </div>
      </div>
      <p className="mt-4 text-xs text-fg-subtle">This can take a minute or two. You can switch to another page meanwhile; this one updates when it's done.</p>
    </div>
  );
}
