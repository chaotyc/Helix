// Checks the extractor's answer and turns it into a graph change. Everything Claude returns
// is outside data (rule 2): parse it, check it against the contract, then check the whole
// global graph with the proposal merged in. Problems come back as a list of plain sentences,
// which is also what Claude is shown on a retry (E6).
import { z } from "zod";
import { Concept, ExtractionProposal, type ConceptGraph, type Edge, type ViewEntry } from "@helix/contracts";
import { describeChange, type MapCommand } from "@helix/core";

export type ProposalCheck =
  | { ok: true; proposal: ExtractionProposal; command: MapCommand }
  | { ok: false; problems: string[] };

export function checkProposal(graph: ConceptGraph, goalId: string, text: string): ProposalCheck {
  // 1. Is it JSON at all?
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["The answer is not valid JSON."] };
  }

  // 2. Does it have the right shape?
  const parsed = ExtractionProposal.safeParse(data);
  if (!parsed.success) return { ok: false, problems: [z.prettifyError(parsed.error)] };
  const proposal = parsed.data;

  // 3. Is each concept valid by the contract's rules (e.g. id format)?
  const problems: string[] = [];
  const concepts: Concept[] = [];
  for (const p of proposal.concepts) {
    const concept = Concept.safeParse({ id: p.id, name: p.name, description: p.description, kind: p.kind });
    if (concept.success) concepts.push(concept.data);
    else problems.push(`concept "${p.id}": ${z.prettifyError(concept.error).replaceAll("\n", " ")}`);
  }
  if (problems.length > 0) return { ok: false, problems };

  // 4. Would the global graph still follow every rule (no missing concepts, duplicates, or loops)?
  const command: MapCommand = {
    op: "extract",
    goalId,
    concepts,
    edges: toEdges(proposal),
    view: proposal.concepts.map((p): ViewEntry => ({ conceptId: p.id, targetDepth: p.targetDepth, role: p.role })),
    raw: proposal,
  };
  try {
    describeChange(graph, command);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, problems: message.replace(/^This change would break the map: /, "").split("; ") };
  }

  return { ok: true, proposal, command };
}

function toEdges(proposal: ExtractionProposal): Edge[] {
  return [
    ...proposal.prerequisites.map(
      (p): Edge => ({ type: "prereq", src: p.needs, srcDepth: p.needsDepth, dst: p.concept, dstDepth: p.depth }),
    ),
    ...proposal.partOf.map((p): Edge => ({ type: "part_of", src: p.part, dst: p.whole })),
  ];
}
