import { Alert } from "../ui/feedback.tsx";

// The warning shown before changing something other goals also use (V2).
export function SharedNote({ goals, what }: { goals: string[]; what: string }) {
  if (goals.length === 0) return null;
  return (
    <Alert tone="warning" title={`Also used by ${goals.join(", ")}`}>
      {what}
    </Alert>
  );
}
