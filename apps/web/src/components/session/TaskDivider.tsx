// A line between tasks in a tutoring session, or the diagnostic's opening note.
export function TaskDivider({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center gap-3 text-xs text-zinc-500">
      <span className="h-px flex-1 bg-zinc-800" />
      <span className="max-w-xl text-center">{label}</span>
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}
