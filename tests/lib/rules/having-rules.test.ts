// tests/lib/rules/having-rules.test.ts
import { describe, it, expect } from "vitest";
import { validateHaving } from "../../../src/lib/rules/having-rules.js";

describe("validateHaving", () => {
  it("returns no errors for valid having", () => {
    expect(validateHaving("count(*) > 5")).toEqual([]);
  });

  it("detects unknown operator", () => {
    const result = validateHaving("count(*) GRAETER 5");
    expect(result.some((d) => d.code === "UNKNOWN_OPERATOR")).toBe(true);
  });

  it("sets clause to $having", () => {
    const result = validateHaving("count(*) GRAETER 5");
    expect(result.every((d) => d.clause === "$having")).toBe(true);
  });
});
