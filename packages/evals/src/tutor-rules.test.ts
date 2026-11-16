import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@helix/contracts";
import { oneQuestion, retrievalAtEnd, type TurnRecord } from "./tutor-rules.ts";

const tutor = (text: string): TimelineItem => ({ type: "tutor", id: text, text });
const card: TimelineItem = { type: "question", id: "q", itemId: "i", conceptId: "a", depth: 1, prompt: "Why?" };
const feedback: TimelineItem = { type: "feedback", id: "f", correct: true, errorTag: null, explanation: "" };
const turns = (items: TimelineItem[], taskId = "t1"): TurnRecord[] => items.map((item) => ({ item, taskId }));

describe("retrievalAtEnd", () => {
  it("passes when every finished task had a graded answer", () => {
    expect(retrievalAtEnd(turns([tutor("Hi."), card, feedback]), [{ id: "t1", endedAt: "x" }]).verdict).toBe("pass");
  });

  it("fails a finished task without one", () => {
    expect(retrievalAtEnd(turns([tutor("Hi.")]), [{ id: "t1", endedAt: "x" }]).verdict).toBe("fail");
  });

  it("doesn't apply when no task finished", () => {
    expect(retrievalAtEnd([], [{ id: "t1", endedAt: null }]).verdict).toBe("not_applicable");
  });
});

describe("oneQuestion", () => {
  it("counts a question card as the message's question", () => {
    expect(oneQuestion(turns([tutor("From memory:"), card])).verdict).toBe("pass");
    expect(oneQuestion(turns([tutor("Ready?"), card])).verdict).toBe("fail");
  });

  it("fails a message asking two things", () => {
    expect(oneQuestion(turns([tutor("What is it? And why?")])).verdict).toBe("fail");
  });
});
