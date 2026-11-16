type Props = { text: string; streaming: boolean };

export function TutorMessage({ text, streaming }: Props) {
  return (
    <div className="max-w-2xl text-sm leading-relaxed text-zinc-200">
      <div className="mb-1 text-xs font-medium text-zinc-500">Tutor</div>
      <div className="whitespace-pre-wrap">
        {text}
        {streaming && <span className="ml-0.5 animate-pulse text-zinc-500">▍</span>}
      </div>
    </div>
  );
}
