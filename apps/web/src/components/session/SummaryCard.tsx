// The summary written when the session ended (K6).
export function SummaryCard({ text }: { text: string }) {
  return (
    <div className="max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm">
      <div className="mb-1 text-xs font-medium text-zinc-400">Session summary</div>
      <div className="whitespace-pre-wrap text-zinc-300">{text}</div>
    </div>
  );
}
