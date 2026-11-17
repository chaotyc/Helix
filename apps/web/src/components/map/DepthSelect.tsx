import { DEPTH_NAMES } from "@helix/contracts";
import { Select } from "../ui/form.tsx";

type Level = number; // a depth, 1–5 (the contract checks the range)

// A depth, 1–5, with its name: "3 · Apply".
export function DepthSelect({ value, onChange, id }: { value: Level; onChange: (d: Level) => void; id?: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {DEPTH_NAMES.map((name, i) => (
        <option key={name} value={i + 1}>
          {i + 1} · {name}
        </option>
      ))}
    </Select>
  );
}
