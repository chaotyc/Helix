// One concept drawn on the map: its name, the depth held out of the depth this goal needs, a bar
// for progress toward it, and whether it's background, shared, or held only through arrows.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ConceptKnowledge, ViewEntry } from "@helix/contracts";
import { depthClasses, masteryLine, progressToward } from "../../depth.ts";
import { NODE_HEIGHT, NODE_WIDTH } from "./layout.ts";

export type ConceptNodeData = { name: string; entry: ViewEntry; shared: boolean; knowledge: ConceptKnowledge | undefined };
export type ConceptNodeType = Node<ConceptNodeData, "concept">;

export function ConceptNode({ data, selected }: NodeProps<ConceptNodeType>) {
  const held = data.knowledge?.depthHeld ?? 0;
  const inferred = data.knowledge !== undefined && data.knowledge.depthHeld > data.knowledge.depthTested;
  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      title={masteryLine(data.knowledge)}
      className={`relative flex items-center gap-2 overflow-hidden rounded-lg border bg-zinc-900 px-3 text-left ${
        selected ? "border-sky-400" : data.entry.role === "background" ? "border-dashed border-zinc-600" : "border-zinc-700"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600" />
      <span className={`w-9 shrink-0 rounded text-center font-mono text-xs leading-5 ${depthClasses(held)}`}>
        {held}/{data.entry.targetDepth}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-zinc-100">{data.name}</span>
        <span className="block text-[11px] text-zinc-500">
          {data.entry.role === "background" ? "background" : "taught"}
          {data.shared ? " · shared" : ""}
          {inferred ? " · inferred" : ""}
        </span>
      </span>
      <span className="absolute bottom-0 left-0 h-0.5 bg-sky-500" style={{ width: `${progressToward(data.knowledge, data.entry.targetDepth) * 100}%` }} />
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600" />
    </div>
  );
}
