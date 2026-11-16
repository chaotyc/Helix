// The drawn map (V3): concepts as boxes, prerequisite arrows labeled with their depths
// ("1 → 2": the needed concept at depth 1, for the needing one at depth 2), part-of as dashed lines.
// Clicking selects; all editing happens in the inspector beside it.
import { useMemo } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge as FlowEdge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ConceptKnowledge, Edge, GoalMap, SharedWith } from "@helix/contracts";
import { ConceptNode, type ConceptNodeType } from "./ConceptNode.tsx";
import { edgeKey } from "./edits.ts";
import { layoutMap } from "./layout.ts";

type Props = {
  map: GoalMap;
  sharedWith: SharedWith;
  knowledge: Record<string, ConceptKnowledge>;
  selectedConceptId: string | null;
  selectedEdgeKey: string | null;
  onSelectConcept: (conceptId: string) => void;
  onSelectEdge: (edge: Edge) => void;
  onClear: () => void;
};

const NODE_TYPES = { concept: ConceptNode }; // defined once, outside render, as React Flow asks

export function MapCanvas({ map, sharedWith, knowledge, selectedConceptId, selectedEdgeKey, onSelectConcept, onSelectEdge, onClear }: Props) {
  const positions = useMemo(() => layoutMap(map), [map]);

  const nodes: ConceptNodeType[] = map.view.map((entry) => ({
    id: entry.conceptId,
    type: "concept",
    position: positions[entry.conceptId] ?? { x: 0, y: 0 },
    selected: entry.conceptId === selectedConceptId,
    data: { name: map.concepts.find((c) => c.id === entry.conceptId)?.name ?? entry.conceptId, entry, shared: entry.conceptId in sharedWith, knowledge: knowledge[entry.conceptId] },
  }));

  const edges: (FlowEdge & { data: { edge: Edge } })[] = map.edges.map((e) => {
    const key = edgeKey(e);
    const selected = key === selectedEdgeKey;
    return {
      id: key,
      source: e.src,
      target: e.dst,
      data: { edge: e },
      label: e.type === "prereq" ? `${e.srcDepth} → ${e.dstDepth}` : "part of",
      markerEnd: { type: MarkerType.ArrowClosed, color: selected ? "#38bdf8" : "#71717a" },
      style: { stroke: selected ? "#38bdf8" : "#71717a", strokeDasharray: e.type === "part_of" ? "4 4" : undefined },
      labelStyle: { fill: "#d4d4d8", fontSize: 11 },
      labelBgStyle: { fill: "#18181b" },
    };
  });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      colorMode="dark"
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, node) => onSelectConcept(node.id)}
      onEdgeClick={(_, edge) => onSelectEdge((edge.data as { edge: Edge }).edge)}
      onPaneClick={onClear}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#27272a" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
