import { describe, it, expect } from "vitest";
import { findClosestMatch, levenshteinDistance } from "../../src/lib/fuzzy-match.js";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("LIKE", "LIKE")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("returns correct distance for transposition", () => {
    expect(levenshteinDistance("LIEK", "LIKE")).toBe(2);
  });

  it("returns correct distance for transposition pair", () => {
    expect(levenshteinDistance("BEWTEEN", "BETWEEN")).toBe(2);
  });

  it("is case-insensitive", () => {
    expect(levenshteinDistance("like", "LIKE")).toBe(0);
  });
});

describe("findClosestMatch", () => {
  const candidates = ["LIKE", "AND", "OR", "NOT", "BETWEEN", "IN", "ASC", "DESC"];

  it("returns the closest match within threshold", () => {
    expect(findClosestMatch("LIEK", candidates)).toBe("LIKE");
    expect(findClosestMatch("ASEC", candidates)).toBe("ASC");
    expect(findClosestMatch("DECS", candidates)).toBe("DESC");
  });

  it("returns null when no match is within threshold", () => {
    expect(findClosestMatch("xyzzy", candidates)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(findClosestMatch("", candidates)).toBeNull();
  });

  it("returns exact match", () => {
    expect(findClosestMatch("LIKE", candidates)).toBe("LIKE");
  });
});
