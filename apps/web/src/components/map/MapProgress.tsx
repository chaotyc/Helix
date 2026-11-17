// What the map page shows while the model reads the source or builds the map.
import type { ExtractionStage } from "@helix/contracts";
import { Spinner } from "../ui/feedback.tsx";
import { BuildSteps } from "./BuildSteps.tsx";
import { ElapsedClock } from "./ElapsedClock.tsx";

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
  detail: string; // the latest activity: "12 concepts so far", a reasoning summary, ...
  startedAt?: number; // for the running clock
  step: 1 | 2; // 1 while the questions are being written, 2 while the map is built
};

export function MapProgress({ stage, detail, startedAt, step }: Props) {
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
          <ElapsedClock startedAt={startedAt} className="shrink-0 pt-0.5 text-[13px] text-fg-subtle" />
        </div>
        <div className="h-1 overflow-hidden bg-fill">
          <div className="h-full w-1/3 animate-slide rounded-full bg-accent/70" />
        </div>
      </div>
      <p className="mt-4 text-xs text-fg-subtle">
        {step === 1
          ? "This usually takes a minute or two."
          : "A long source at high effort can take 10 minutes or more, depending on the model."}{" "}
        You can switch to another page meanwhile; this one updates when it's done.
      </p>
    </div>
  );
}
