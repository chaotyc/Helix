// Sections shared by the clarifier's and the extractor's requests. Both prompt versions
// include this file, so editing any wording here gives both a new version.
import type { ClarifyQuestion, Goal, SourceKind } from "@helix/contracts";

export const REQUEST_PARTS_FILE = import.meta.filename;

export type SourceInput = { text: string; kind: SourceKind };

const KIND_LABEL: Record<SourceKind, string> = {
  syllabus: "Syllabus",
  contents: "Table of contents",
  notes: "Notes",
  other: "Other",
};

// Outside text (a pasted source, the learner's own words) inside <tag>…</tag>, so the model can
// tell it apart from the request. A closing tag inside the text is defused (</source> becomes
// <\/source>), so the text can't end its own block early and pass what follows as instructions.
export function fenced(tag: string, text: string): string {
  const closing = new RegExp(`<\\s*/\\s*${tag}\\s*>`, "gi");
  return `<${tag}>\n${text.replace(closing, `<\\/${tag}>`)}\n</${tag}>`;
}

export function goalSection(goal: Goal): string {
  return [
    "# Goal",
    `Title: ${goal.title}`,
    `Kind: ${goal.kind}`,
    `Capstone: ${goal.capstone || "not given"}`,
    `Exam date: ${goal.examDate ?? "none"}`,
    // The learner's own words from the new-goal form; older goals have none.
    ...(goal.prompt ? ["In the learner's words:", fenced("learner_prompt", goal.prompt)] : []),
  ].join("\n");
}

export function sourceSection(source: SourceInput | undefined): string {
  const body = source
    ? `Kind: ${KIND_LABEL[source.kind]}\n${fenced("source", source.text)}`
    : "Kind: None\nNo source material. Work from the goal and the learner's answers.";
  return `# Source material\n${body}`;
}

// What the learner has told us about this goal, oldest first.
export function answersSection(answered: ClarifyQuestion[]): string {
  const lines = answered.length
    ? answered.map((q) => `- (${q.about}) ${q.question}\n  Answer: ${q.answer}`)
    : ["Nothing yet."];
  return ["# What the learner has told us", ...lines].join("\n");
}
