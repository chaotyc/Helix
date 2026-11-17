// The drawn map (V3): concepts as cards, prerequisite arrows labeled with their depths
// ("1 → 2": the needed concept at depth 1, for the needing one at depth 2), part-of as dashed lines.
// Clicking selects; all editing happens in the inspector beside it.
import { useEffect, useMemo, type ReactNode } from "react";
import { Background, BackgroundVariant, MarkerType, Panel, ReactFlow, useReactFlow, useStore, type Edge as FlowEdge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ConceptKnowledge, Edge, GoalMap, SharedWith } from "@helix/contracts";
import { FitIcon, MinusIcon, PlusIcon } from "../ui/icons.tsx";
import { ConceptNode, type ConceptNodeType } from "./ConceptNode.tsx";
import { edgeKey } from "./edits.ts";
import { layoutMap, NODE_HEIGHT, NODE_WIDTH, type Positions } from "./layout.ts";
import { arrowSides, sourceHandle, targetHandle } from "./routing.ts";

type Props = {
  map: GoalMap;
  sharedWith: SharedWith;
  knowledge: Record<string, ConceptKnowledge>;
  selectedConceptId: string | null;
  selectedEdgeKey: string | null;
  onSelectConcept: (conceptId: string) => void;
  onSelectEdge: (edge: Edge) => void;
  onClear: () => void;
  rightInset: number; // px on the right covered by the inspector, so a selected concept isn't hidden under it
  children?: ReactNode; // overlays drawn on the canvas
};

const NODE_TYPES = { concept: ConceptNode }; // defined once, outside render, as React Flow asks
const EDGE = "var(--hx-edge)";
const SELECTED = "var(--hx-accent)";

export function MapCanvas({ map, sharedWith, knowledge, selectedConceptId, selectedEdgeKey, onSelectConcept, onSelectEdge, onClear, rightInset, children }: Props) {
  const positions = useMemo(() => layoutMap(map), [map]);
  const name = (id: string) => map.concepts.find((c) => c.id === id)?.name ?? id;

  const nodes: ConceptNodeType[] = map.view.map((entry) => {
    const concept = map.concepts.find((c) => c.id === entry.conceptId);
    const held = knowledge[entry.conceptId]?.depthHeld ?? 0;
    return {
      id: entry.conceptId,
      type: "concept",
      ariaLabel: `${concept?.name ?? entry.conceptId}, depth ${held} of ${entry.targetDepth}${entry.role === "background" ? ", background" : ""}`,
      position: positions[entry.conceptId] ?? { x: 0, y: 0 },
      selected: entry.conceptId === selectedConceptId,
      data: { name: concept?.name ?? entry.conceptId, kind: concept?.kind ?? "concept", entry, shared: entry.conceptId in sharedWith, knowledge: knowledge[entry.conceptId] },
    };
  });

  const edges: (FlowEdge & { data: { edge: Edge } })[] = map.edges.map((e) => {
    const key = edgeKey(e);
    const selected = key === selectedEdgeKey;
    const color = selected ? SELECTED : EDGE;
    const sides = arrowSides(e.type, positions[e.src] ?? { x: 0, y: 0 }, positions[e.dst] ?? { x: 0, y: 0 });
    return {
      id: key,
      source: e.src,
      target: e.dst,
      sourceHandle: sourceHandle(sides.from),
      targetHandle: targetHandle(sides.to),
      ariaLabel:
        e.type === "prereq"
          ? `${name(e.src)} at depth ${e.srcDepth} is needed for ${name(e.dst)} at depth ${e.dstDepth}`
          : `${name(e.src)} is part of ${name(e.dst)}`,
      data: { edge: e },
      label: e.type === "prereq" ? `${e.srcDepth} → ${e.dstDepth}` : "part of",
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      style: { stroke: color, strokeWidth: selected ? 2 : 1.5, strokeDasharray: e.type === "part_of" ? "5 4" : undefined },
      labelStyle: { fill: selected ? "var(--hx-accent-text)" : "var(--hx-fg-muted)", fontSize: 11 },
      labelBgStyle: { fill: "var(--hx-surface)", stroke: selected ? SELECTED : "var(--hx-line-strong)", strokeWidth: 1 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 6,
      interactionWidth: 16,
    };
  });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      colorMode="system"
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.2}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, node) => onSelectConcept(node.id)}
      onEdgeClick={(_, edge) => onSelectEdge((edge.data as { edge: Edge }).edge)}
      // Enter or Space on a focused (Tab-reached) node or arrow selects it, like a click. React Flow
      // reports that as a selection change rather than a click.
      onNodesChange={(changes) => {
        const picked = changes.find((c) => c.type === "select" && c.selected);
        if (picked && "id" in picked) onSelectConcept(picked.id);
      }}
      onEdgesChange={(changes) => {
        const picked = changes.find((c) => c.type === "select" && c.selected);
        const edge = picked && "id" in picked ? map.edges.find((e) => edgeKey(e) === picked.id) : undefined;
        if (edge) onSelectEdge(edge);
      }}
      onPaneClick={onClear}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.25} color="var(--hx-dots)" />
      {children}
      <KeepInView nodeId={selectedConceptId} positions={positions} rightInset={rightInset} />
      <Panel position="bottom-left" className="!m-3 flex items-end gap-2">
        <ZoomControls />
        {/* The legend steps aside when the inspector leaves too little room for it. */}
        <Legend className={rightInset > 0 ? "@max-[72rem]/map:hidden" : "@max-[44rem]/map:hidden"} />
      </Panel>
    </ReactFlow>
  );
}

// When a concept is selected, slide the drawing so it isn't under the inspector or off screen.
// Draws nothing; it's inside <ReactFlow> so it can move the view.
function KeepInView({ nodeId, positions, rightInset }: { nodeId: string | null; positions: Positions; rightInset: number }) {
  const flow = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  useEffect(() => {
    const pos = nodeId ? positions[nodeId] : undefined;
    if (!pos) return;
    const { x, y, zoom } = flow.getViewport();
    const margin = 16;
    const visibleWidth = width - rightInset;
    const left = pos.x * zoom + x;
    const right = (pos.x + NODE_WIDTH) * zoom + x;
    const top = pos.y * zoom + y;
    const bottom = (pos.y + NODE_HEIGHT) * zoom + y;
    const edge = margin * 4; // the toolbar and legend sit at the top and bottom
    // How far to move so the node is just inside the visible area (0 if it already is).
    const dx = left < margin ? margin - left : right > visibleWidth - margin ? visibleWidth - margin - right : 0;
    const dy = top < edge ? edge - top : bottom > height - edge ? height - edge - bottom : 0;
    if (dx === 0 && dy === 0) return;
    flow.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 250 });
  }, [nodeId, width, height, rightInset, positions]); // not the viewport: panning by hand stays free

  return null;
}

// Zoom in, out, and fit, matched to the rest of the UI. Inside <ReactFlow>, so it can reach its view.
function ZoomControls() {
  const flow = useReactFlow();
  const button = "flex size-8 items-center justify-center text-fg-muted hover:bg-fill hover:text-fg";
  return (
    <div className="flex divide-x divide-line overflow-hidden rounded-lg border border-line-strong bg-overlay shadow-sm">
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => flow.zoomIn()} className={button}>
        <PlusIcon />
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => flow.zoomOut()} className={button}>
        <MinusIcon />
      </button>
      <button type="button" aria-label="Fit the map" title="Fit the map" onClick={() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 })} className={button}>
        <FitIcon />
      </button>
    </div>
  );
}

// How to read the drawing.
function Legend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-8 items-center gap-4 rounded-lg border border-line-strong bg-overlay px-3 text-[11px] whitespace-nowrap text-fg-muted shadow-sm ${className}`}>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[3px] border border-line-strong bg-raised" /> Taught
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-3.5 rounded-[3px] border border-dashed border-fg-faint" /> Background
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rounded border border-line-strong px-1 font-medium tabular-nums">1 → 2</span> depth 1 needed for depth 2
      </span>
    </div>
  );
}
