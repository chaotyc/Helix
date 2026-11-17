// One concept drawn on the map: its kind and name, the depth held out of the depth this goal
// needs, and whether it's background, shared, or held only through arrows.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { Concept, ConceptKnowledge, ViewEntry } from "@helix/contracts";
import { masteryLine, nextDepthChance } from "../../depth.ts";
import { DepthMeter } from "../DepthMeter.tsx";
import { ConceptKindIcon, DecisionKindIcon, SkillKindIcon } from "../ui/icons.tsx";
import { NODE_HEIGHT, NODE_WIDTH } from "./layout.ts";

export type ConceptNodeData = { name: string; kind: Concept["kind"]; entry: ViewEntry; shared: boolean; knowledge: ConceptKnowledge | undefined };
export type ConceptNodeType = Node<ConceptNodeData, "concept">;

const KIND_ICON = { concept: ConceptKindIcon, skill: SkillKindIcon, decision: DecisionKindIcon } as const;

// The handles are where arrows attach. Nothing is connected by dragging, so they stay invisible.
const HANDLE = "!h-1 !w-1 !min-w-0 !border-0 !bg-transparent";

export function ConceptNode({ data, selected }: NodeProps<ConceptNodeType>) {
  const held = data.knowledge?.depthHeld ?? 0;
  const inferred = data.knowledge !== undefined && data.knowledge.depthHeld > data.knowledge.depthTested;
  const background = data.entry.role === "background";
  const tags = [background && "background", data.shared && "shared", inferred && "inferred"].filter(Boolean).join(" · ");
  const Kind = KIND_ICON[data.kind];

  return (
    <div
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      title={masteryLine(data.knowledge)}
      className={`flex flex-col justify-center gap-2 rounded-xl border px-3.5 text-left shadow-xs transition-[border-color,box-shadow] ${
        selected
          ? "border-accent bg-raised ring-4 ring-accent/20"
          : background
            ? "border-dashed border-line-strong bg-sunken hover:border-fg-faint"
            : "border-line-strong bg-raised hover:border-fg-faint"
      }`}
    >
      <Handle type="target" position={Position.Top} className={HANDLE} />
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="text-fg-subtle" title={data.kind}>
          <Kind className="size-3.5" />
        </span>
        <span className="truncate text-[13px] font-medium text-fg">{data.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <DepthMeter held={held} target={data.entry.targetDepth} next={nextDepthChance(data.knowledge, data.entry.targetDepth)} />
        {tags && <span className="ml-auto truncate text-[11px] text-fg-subtle">{tags}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className={HANDLE} />
    </div>
  );
}
