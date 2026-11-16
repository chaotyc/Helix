// The warning shown before changing something other goals also use (V2).
export function SharedNote({ goals, what }: { goals: string[]; what: string }) {
  if (goals.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-900 bg-amber-950/40 px-2 py-1.5 text-xs text-amber-200">
      Also used by {goals.join(", ")}. {what}
    </div>
  );
}
