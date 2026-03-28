import { describe, it, expect } from "vitest";
import { validate } from "../../src/lib/validator.js";

describe("validate", () => {
  it("returns empty diagnostics for valid params", () => {
    const result = validate({
      select: "name, revenue",
      where: "revenue > 1000",
      order: "revenue DESC",
      limit: "10",
    });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("catches errors across multiple clauses", () => {
    const result = validate({
      select: "cont(*)",
      where: "name LIEK '%test%'",
      limit: "-5",
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(3);
    expect(result.diagnostics.some((d) => d.clause === "$select")).toBe(true);
    expect(result.diagnostics.some((d) => d.clause === "$where")).toBe(true);
    expect(result.diagnostics.some((d) => d.clause === "$limit")).toBe(true);
  });

  it("returns valid true with warnings only", () => {
    const result = validate({ limit: "50000" });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ severity: "warning", code: "LARGE_LIMIT" }),
    ]);
  });

  it("skips undefined params", () => {
    const result = validate({ select: "name" });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("runs structural checks on all clauses", () => {
    const result = validate({ where: "(x > 1" });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "UNBALANCED_PARENS" }),
    ]);
  });

  it("does not validate $q (free-text)", () => {
    const result = validate({ q: "anything goes here (((" });
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("returns SELECT_STAR_WITH_GROUP warning", () => {
    const result = validate({ select: "*", group: "state" });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "SELECT_STAR_WITH_GROUP",
        severity: "warning",
      }),
    ]);
  });
});
