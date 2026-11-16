import { describe, expect, it } from "vitest";
import type { Answer } from "./mastery.ts";
import { misconceptionActive, misconceptionEvents } from "./misconceptions.ts";

let seq = 0;
function a(sessionId: string, correct: boolean, extra: Partial<Answer>): Answer {
  seq += 1;
  return { seq, conceptId: "lti", depth: 2, correct, confidence: null, sessionId, ts: `t${seq}`, aimedAt: null, misconceptionId: null, ...extra };
}
const shown = (s: string) => a(s, false, { misconceptionId: "m1" });
const fixed = (s: string) => a(s, true, { aimedAt: "m1" });

const active = (rows: Answer[]) => misconceptionActive(misconceptionEvents(rows, "m1"));

describe("misconceptionActive (K3: cleared after 2 later right answers aimed at it, in different sessions)", () => {
  it("is active once shown", () => {
    expect(active([shown("s1")])).toBe(true);
  });

  it("stays active after two right answers in one later session", () => {
    expect(active([shown("s1"), fixed("s2"), fixed("s2")])).toBe(true);
  });

  it("a right answer in the session where it was shown doesn't count", () => {
    expect(active([shown("s1"), fixed("s1"), fixed("s2")])).toBe(true);
  });

  it("clears after right answers in two different later sessions", () => {
    expect(active([shown("s1"), fixed("s2"), fixed("s3")])).toBe(false);
  });

  it("showing it again restarts the count", () => {
    expect(active([shown("s1"), fixed("s2"), shown("s3"), fixed("s4")])).toBe(true);
  });

  it("wrong answers to questions aimed at it don't count", () => {
    expect(active([shown("s1"), a("s2", false, { aimedAt: "m1" }), fixed("s3")])).toBe(true);
  });
});
