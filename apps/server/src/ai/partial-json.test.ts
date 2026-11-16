import { describe, expect, it } from "vitest";
import { partialStringField } from "./partial-json.ts";

describe("partialStringField", () => {
  it("is null before the field starts", () => {
    expect(partialStringField('{"mess', "message")).toBeNull();
  });

  it("returns what's been written so far", () => {
    expect(partialStringField('{"message": "The step resp', "message")).toBe("The step resp");
  });

  it("stops at the closing quote and decodes escapes", () => {
    expect(partialStringField('{"message":"Say \\"why\\"\\nnow","method":"socratic"}', "message")).toBe('Say "why"\nnow');
  });

  it("waits out an escape cut in half", () => {
    expect(partialStringField('{"message":"a\\', "message")).toBe("a");
    expect(partialStringField('{"message":"a\\u00', "message")).toBe("a");
    expect(partialStringField('{"message":"a\\u00e9', "message")).toBe("aé");
  });
});
