// tests/lib/rules/limit-offset-rules.test.ts
import { describe, it, expect } from "vitest";
import { validateLimit, validateOffset } from "../../../src/lib/rules/limit-offset-rules.js";

describe("validateLimit", () => {
  it("returns no errors for valid limit", () => {
    expect(validateLimit("100")).toEqual([]);
    expect(validateLimit("0")).toEqual([]);
  });

  it("returns INVALID_LIMIT for negative number", () => {
    const result = validateLimit("-5");
    expect(result).toEqual([
      expect.objectContaining({ code: "INVALID_LIMIT" }),
    ]);
  });

  it("returns INVALID_LIMIT for non-numeric", () => {
    const result = validateLimit("abc");
    expect(result).toEqual([
      expect.objectContaining({ code: "INVALID_LIMIT" }),
    ]);
  });

  it("returns INVALID_LIMIT for float", () => {
    const result = validateLimit("10.5");
    expect(result).toEqual([
      expect.objectContaining({ code: "INVALID_LIMIT" }),
    ]);
  });

  it("returns LARGE_LIMIT warning for limit > 10000", () => {
    const result = validateLimit("50000");
    expect(result).toEqual([
      expect.objectContaining({
        code: "LARGE_LIMIT",
        severity: "warning",
      }),
    ]);
  });
});

describe("validateOffset", () => {
  it("returns no errors for valid offset", () => {
    expect(validateOffset("0")).toEqual([]);
    expect(validateOffset("100")).toEqual([]);
  });

  it("returns INVALID_OFFSET for negative number", () => {
    const result = validateOffset("-1");
    expect(result).toEqual([
      expect.objectContaining({ code: "INVALID_OFFSET" }),
    ]);
  });

  it("returns INVALID_OFFSET for non-numeric", () => {
    const result = validateOffset("abc");
    expect(result).toEqual([
      expect.objectContaining({ code: "INVALID_OFFSET" }),
    ]);
  });
});
