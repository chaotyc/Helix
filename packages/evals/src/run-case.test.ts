import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractionProposal, JudgeReport } from "@helix/contracts";
import { fakeModel } from "@helix/server";
import { loadCases } from "./cases.ts";
import { comparisonTable, loadResults, saveResults } from "./results.ts";
import { runCase } from "./run-case.ts";

const proposal: ExtractionProposal = {
  concepts: [
    { id: "complex-numbers", name: "Complex numbers", description: "a + bi.", kind: "concept", role: "background", targetDepth: 2 },
    { id: "lti", name: "LTI systems", description: "Linear, time-invariant.", kind: "concept", role: "taught", targetDepth: 4 },
  ],
  prerequisites: [{ concept: "lti", depth: 1, needs: "complex-numbers", needsDepth: 2, why: "Eigenfunctions." }],
  partOf: [],
};
const report: JudgeReport = {
  problems: [{ type: "missing_concept", severity: "major", conceptIds: [], reason: "Convolution is missing." }],
};

const [demo] = loadCases(undefined, "signals-demo");

function options(callModel: ReturnType<typeof fakeModel>["callModel"], run = 1) {
  return { callModel, model: "claude-opus-5-5" as const, judgeModel: "claude-opus-5-5" as const, effort: "high" as const, judgeEffort: "xhigh" as const, run };
}

describe("the committed demo case", () => {
  it("loads, with its syllabus and three fixed answers", () => {
    expect(demo?.sourceText).toContain("Signals and Systems");
    expect(demo?.answers.map((a) => a.about)).toEqual(["goal", "scope", "background"]);
  });
});

describe("runCase", () => {
  it("builds the map from the fixed answers (no clarifier call), judges it, and scores it", async () => {
    const { callModel, requests } = fakeModel([proposal, report]);
    const result = await runCase(demo!, options(callModel));

    expect(requests).toHaveLength(2); // extractor, judge: the fixed answers replace the clarifier
    expect(String(requests[0]?.messages[0]?.content)).toContain("Answer: Both, with more weight on discrete-time.");
    expect(String(requests[0]?.messages[0]?.content)).toContain("Kind: Syllabus");
    expect(result.score).toMatchObject({ concepts: 2, majors: 1, majorsPer10: 5 });
    expect(result.extractPromptVersion).toMatch(/^extract-map@/);
    expect(result.judgePromptVersion).toMatch(/^judge-map@/);
    expect(result.costUsd).toBeCloseTo(2 * ((1000 * 4 + 2000 * 20) / 1e6)); // two calls at the fake's token counts
  });

  it("gives every run its own empty graph", async () => {
    const first = await runCase(demo!, options(fakeModel([proposal, report]).callModel));
    const second = await runCase(demo!, options(fakeModel([proposal, report]).callModel, 2));
    expect(second.score.concepts).toBe(first.score.concepts); // nothing carried over from run 1
  });
});

describe("results", () => {
  it("save, load back, and group the table by judge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "helix-results-"));
    const run = await runCase(demo!, options(fakeModel([proposal, report]).callModel));
    saveResults({ date: "2026-11-11T14:02:00.000Z", effort: "high", judgeEffort: "xhigh", runs: [run] }, dir);
    saveResults(
      { date: "2026-11-12T09:30:00.000Z", effort: "high", judgeEffort: "xhigh", runs: [{ ...run, judgePromptVersion: "judge-map@00000000" }] },
      dir,
    );

    const table = comparisonTable(loadResults(dir));
    expect(table.match(/^Judge: /gm)).toHaveLength(2); // a different judge: a separate, non-comparable group
    expect(table).toContain("signals-demo");
    expect(table).toContain("5.0"); // majors per 10 concepts
  });

  it("says so when there are no results", () => {
    expect(comparisonTable(loadResults(join(tmpdir(), "helix-no-such-dir")))).toBe("No results yet.");
  });
});
