import { describe, it, expect } from "vitest";
import { validateStructural } from "../../../src/lib/rules/structural-rules.js";

describe("validateStructural", () => {
  describe("empty clause", () => {
    it("returns EMPTY_CLAUSE for empty string", () => {
      const result = validateStructural("$where", "");
      expect(result).toEqual([
        expect.objectContaining({ code: "EMPTY_CLAUSE", clause: "$where" }),
      ]);
    });

    it("returns EMPTY_CLAUSE for whitespace-only", () => {
      const result = validateStructural("$select", "   ");
      expect(result).toEqual([
        expect.objectContaining({ code: "EMPTY_CLAUSE", clause: "$select" }),
      ]);
    });
  });

  describe("unbalanced parentheses", () => {
    it("returns no errors for balanced parens", () => {
      const result = validateStructural("$where", "(x > 1) AND (y < 2)");
      expect(result).toEqual([]);
    });

    it("returns UNBALANCED_PARENS for missing closing paren", () => {
      const result = validateStructural("$where", "(x > 1");
      expect(result).toEqual([
        expect.objectContaining({
          code: "UNBALANCED_PARENS",
          clause: "$where",
          suggestion: "(x > 1)",
        }),
      ]);
    });

    it("returns UNBALANCED_PARENS for missing opening paren", () => {
      const result = validateStructural("$where", "x > 1)");
      expect(result).toEqual([
        expect.objectContaining({ code: "UNBALANCED_PARENS", clause: "$where" }),
      ]);
    });

    it("handles nested parens", () => {
      const result = validateStructural("$where", "((x > 1) AND (y < 2))");
      expect(result).toEqual([]);
    });

    it("ignores parens inside single-quoted strings", () => {
      const result = validateStructural("$where", "name = 'foo (bar)'");
      expect(result).toEqual([]);
    });
  });

  describe("unbalanced quotes", () => {
    it("returns no errors for balanced quotes", () => {
      const result = validateStructural("$where", "name = 'Oregon'");
      expect(result).toEqual([]);
    });

    it("returns UNBALANCED_QUOTES for odd number of quotes", () => {
      const result = validateStructural("$where", "name = 'Oregon");
      expect(result).toEqual([
        expect.objectContaining({ code: "UNBALANCED_QUOTES", clause: "$where" }),
      ]);
    });

    it("handles escaped quotes (two single quotes)", () => {
      const result = validateStructural("$where", "name = 'O''Reilly'");
      expect(result).toEqual([]);
    });
  });

  describe("valid input", () => {
    it("returns empty array for well-formed expression", () => {
      const result = validateStructural("$where", "revenue > 1000 AND state = 'OR'");
      expect(result).toEqual([]);
    });
  });
});
