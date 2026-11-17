import { SummaryIcon } from "../ui/icons.tsx";

// The summary written when the session ended (K6).
export function SummaryCard({ text }: { text: string }) {
  return (
    <div className="w-full rounded-xl border border-line bg-raised px-5 py-4 shadow-xs">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
        <SummaryIcon className="size-4 text-fg-subtle" />
        Session summary
      </div>
      <div className="text-[14px] leading-6 whitespace-pre-wrap text-fg-muted">{text}</div>
    </div>
  );
}
