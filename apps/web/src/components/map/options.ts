// Choices the map forms offer, for segmented controls.
import type { Concept, ViewEntry } from "@helix/contracts";

export const ROLE_OPTIONS: { value: ViewEntry["role"]; label: string; title: string }[] = [
  { value: "taught", label: "Taught", title: "This goal teaches it" },
  { value: "background", label: "Background", title: "This goal assumes it" },
];

export const KIND_OPTIONS: { value: Concept["kind"]; label: string; title: string }[] = [
  { value: "concept", label: "Concept", title: "An idea to understand" },
  { value: "skill", label: "Skill", title: "A procedure to perform" },
  { value: "decision", label: "Decision", title: "A choice between approaches" },
];
