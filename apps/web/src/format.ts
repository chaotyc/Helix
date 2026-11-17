// Dates and labels as the UI shows them, in the learner's own time zone.
import type { SessionKind } from "@helix/contracts";

export const SESSION_KIND_LABEL: Record<SessionKind, string> = { diagnostic: "Diagnostic", tutoring: "Tutoring" };

// Whole days from today to `date` (negative if it's past). Counts calendar days, not 24-hour spans.
function daysFromToday(date: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(date) - start(new Date())) / 86_400_000);
}

// "Today", "Yesterday", "Nov 14", or "Nov 14, 2025" for another year.
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const days = daysFromToday(date);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

// "Today, 6:32 PM".
export function dayAndTime(iso: string): string {
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel(iso)}, ${time}`;
}

// Short, for a list: "6:32 PM" today, otherwise "Yesterday" or "Nov 14".
export function shortWhen(iso: string): string {
  const day = dayLabel(iso);
  return day === "Today" ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : day;
}

// An exam date ("2026-12-14", a calendar day with no time) as "Dec 14 · in 28 days".
export function examLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y!, m! - 1, d!); // local midnight, so the day doesn't shift with the time zone
  const days = daysFromToday(day);
  const text = day.toLocaleDateString(undefined, { month: "short", day: "numeric", year: day.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : days > 0 ? `in ${days} days` : days === -1 ? "yesterday" : `${-days} days ago`;
  return `${text} · ${when}`;
}
