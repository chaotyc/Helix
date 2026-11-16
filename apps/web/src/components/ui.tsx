// Small pieces shared by the forms: input and button styles, and a labeled field.
import type { ReactNode } from "react";

export const INPUT =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-60";
export const BUTTON =
  "self-start rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40";
export const QUIET_BUTTON = "rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40";
export const DANGER_BUTTON = "rounded-md border border-red-900 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-zinc-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
