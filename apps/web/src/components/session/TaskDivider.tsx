// A line between tasks in a tutoring session, or the diagnostic's opening note.
export function TaskDivider({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center gap-3 pt-2" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-line" />
      <span className="max-w-xl rounded-full border border-line bg-surface px-3 py-1 text-center text-xs font-medium text-fg-muted">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
