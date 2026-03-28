// tests/lib/rules/order-rules.test.ts
import { describe, it, expect } from "vitest";
import { validateOrder } from "../../../src/lib/rules/order-rules.js";

describe("validateOrder", () => {
  it("returns no errors for valid order", () => {
    expect(validateOrder("name ASC")).toEqual([]);
    expect(validateOrder("revenue DESC")).toEqual([]);
    expect(validateOrder("name ASC, revenue DESC")).toEqual([]);
  });

  it("returns no errors for column without direction", () => {
    expect(validateOrder("name")).toEqual([]);
  });

  it("detects misspelled sort direction", () => {
    const result = validateOrder("name ASEC");
    expect(result).toEqual([
      expect.objectContaining({
        code: "UNKNOWN_KEYWORD",
        near: "ASEC",
        suggestion: "ASC",
      }),
    ]);
  });

  it("detects another misspelled direction", () => {
    const result = validateOrder("revenue DECS");
    expect(result).toEqual([
      expect.objectContaining({
        code: "UNKNOWN_KEYWORD",
        near: "DECS",
        suggestion: "DESC",
      }),
    ]);
  });
});
