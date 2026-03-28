import { describe, it, expect } from "vitest";
import { validateWhere } from "../../../src/lib/rules/where-rules.js";

describe("validateWhere", () => {
  describe("valid expressions", () => {
    it("simple comparison", () => {
      expect(validateWhere("revenue > 1000")).toEqual([]);
    });

    it("string equality", () => {
      expect(validateWhere("state = 'OR'")).toEqual([]);
    });

    it("compound with AND/OR", () => {
      expect(validateWhere("revenue > 1000 AND state = 'OR'")).toEqual([]);
    });

    it("LIKE operator", () => {
      expect(validateWhere("name LIKE '%Oregon%'")).toEqual([]);
    });

    it("IN operator", () => {
      expect(validateWhere("state IN('OR', 'WA', 'CA')")).toEqual([]);
    });

    it("BETWEEN operator", () => {
      expect(validateWhere("revenue BETWEEN 1000 AND 5000")).toEqual([]);
    });

    it("IS NULL", () => {
      expect(validateWhere("name IS NULL")).toEqual([]);
    });

    it("IS NOT NULL", () => {
      expect(validateWhere("name IS NOT NULL")).toEqual([]);
    });

    it("NOT LIKE", () => {
      expect(validateWhere("name NOT LIKE '%test%'")).toEqual([]);
    });

    it("function call in where", () => {
      expect(validateWhere("starts_with(name, 'Oregon')")).toEqual([]);
    });

    it("CASE WHEN", () => {
      expect(validateWhere("CASE WHEN revenue > 1000 THEN 'high' ELSE 'low' END = 'high'")).toEqual([]);
    });
  });

  describe("unknown operators", () => {
    it("detects LIEK as typo for LIKE", () => {
      const result = validateWhere("name LIEK '%Oregon%'");
      expect(result).toEqual([
        expect.objectContaining({
          code: "UNKNOWN_OPERATOR",
          near: "LIEK",
          suggestion: "LIKE",
        }),
      ]);
    });

    it("detects ASND as typo for AND", () => {
      const result = validateWhere("x > 1 ASND y < 2");
      expect(result).toEqual([
        expect.objectContaining({
          code: "UNKNOWN_OPERATOR",
          near: "ASND",
          suggestion: "AND",
        }),
      ]);
    });
  });

  describe("unknown functions", () => {
    it("detects misspelled function", () => {
      const result = validateWhere("start_with(name, 'Oregon')");
      expect(result).toEqual([
        expect.objectContaining({
          code: "UNKNOWN_FUNCTION",
          near: "start_with",
          suggestion: "starts_with",
        }),
      ]);
    });
  });

  describe("malformed constructs", () => {
    it("detects BETWEEN without AND", () => {
      const result = validateWhere("revenue BETWEEN 1000 5000");
      expect(result).toEqual([
        expect.objectContaining({
          code: "MALFORMED_BETWEEN",
          clause: "$where",
        }),
      ]);
    });

    it("detects CASE without END", () => {
      const result = validateWhere("CASE WHEN revenue > 1000 THEN 'high'");
      expect(result).toEqual([
        expect.objectContaining({
          code: "MALFORMED_CASE",
          clause: "$where",
        }),
      ]);
    });
  });
});
