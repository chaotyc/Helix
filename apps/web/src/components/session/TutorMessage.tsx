import { HelixAvatar } from "./HelixAvatar.tsx";

type Props = { text: string; streaming: boolean };

export function TutorMessage({ text, streaming }: Props) {
  return (
    <div className="flex w-full gap-3">
      <HelixAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 text-xs font-medium text-fg-subtle">Helix</div>
        <div className="text-[15px] leading-7 whitespace-pre-wrap text-fg">
          {text}
          {streaming && <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}
