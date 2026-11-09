import { describe, expect, it } from "vitest";
import type { ClarifyQuestion } from "@helix/contracts";
import { askQuestions } from "./ask-questions.ts";

const goal: ClarifyQuestion = { id: "q1", about: "goal", question: "What do you want?", why: "", answerType: "free_text", choices: [] };
const scope: ClarifyQuestion = {
  id: "q2",
  about: "scope",
  question: "Which parts?",
  why: "",
  answerType: "choice",
  choices: ["Analog only", "Analog and digital"],
};

// A fake terminal: answers with the typed lines in order and records what was printed.
function terminal(typed: string[]) {
  const printed: string[] = [];
  return { ask: async () => typed.shift() ?? "", print: (line: string) => printed.push(line), printed };
}

describe("askQuestions", () => {
  it("takes a choice's number or the learner's own words", async () => {
    const t = terminal(["Build a pedal", "2"]);
    expect(await askQuestions([goal, scope], t.ask, t.print)).toEqual([
      { questionId: "q1", answer: "Build a pedal" },
      { questionId: "q2", answer: "Analog and digital" },
    ]);
    expect(t.printed).toContain("   1) Analog only");
  });

  it("accepts a typed answer instead of a choice", async () => {
    const t = terminal(["Digital filters only"]);
    expect(await askQuestions([scope], t.ask, t.print)).toEqual([{ questionId: "q2", answer: "Digital filters only" }]);
  });

  it("asks again until it gets an answer", async () => {
    const t = terminal(["", "   ", "Pass the exam"]);
    expect(await askQuestions([goal], t.ask, t.print)).toEqual([{ questionId: "q1", answer: "Pass the exam" }]);
    expect(t.printed.filter((l) => l.includes("An answer is needed"))).toHaveLength(2);
  });
});
