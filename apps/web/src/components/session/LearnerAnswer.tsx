type Props = { text: string; confidence?: number };

export function LearnerAnswer({ text, confidence }: Props) {
  return (
    <div className="ml-auto flex max-w-[80%] flex-col items-end gap-1">
      <div className="rounded-2xl rounded-br-md bg-fill-strong px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap text-fg">{text}</div>
      {confidence !== undefined && (
        <div className="flex items-center gap-1.5 pr-1 text-[11px] text-fg-subtle" aria-label={`Confidence ${confidence} out of 5`}>
          Confidence
          <span className="flex gap-0.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((level) => (
              <span key={level} className={`size-1.5 rounded-full ${level <= confidence ? "bg-fg-muted" : "bg-track"}`} />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
