// tests/tools/validate-soql.test.ts
import { describe, it, expect } from "vitest";
import { handleValidateSoql } from "../../src/tools/validate-soql.js";

describe("handleValidateSoql", () => {
  it("returns valid result for correct SoQL", () => {
    const result = handleValidateSoql({
      select: "name, revenue",
      where: "revenue > 1000",
      limit: "10",
    });
    expect(result).toEqual({ valid: true, diagnostics: [] });
  });

  it("returns diagnostics for invalid SoQL", () => {
    const result = handleValidateSoql({
      select: "cont(*)",
      where: "name LIEK '%test%'",
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].source).toBe("local");
  });

  it("handles empty params", () => {
    const result = handleValidateSoql({});
    expect(result).toEqual({ valid: true, diagnostics: [] });
  });

  it("returns structured diagnostic with all fields", () => {
    const result = handleValidateSoql({ select: "cont(*)" });
    expect(result.valid).toBe(false);
    const diag = result.diagnostics[0];
    expect(diag).toHaveProperty("source", "local");
    expect(diag).toHaveProperty("severity", "error");
    expect(diag).toHaveProperty("code");
    expect(diag).toHaveProperty("clause");
    expect(diag).toHaveProperty("message");
  });
});
