import { describe, it, expect } from "vitest";
import { validateSelect } from "../../../src/lib/rules/select-rules.js";

describe("validateSelect", () => {
  it("returns no errors for valid column list", () => {
    expect(validateSelect("name, revenue, state")).toEqual([]);
  });

  it("returns no errors for *", () => {
    expect(validateSelect("*")).toEqual([]);
  });

  it("returns no errors for valid function call", () => {
    expect(validateSelect("count(*)")).toEqual([]);
    expect(validateSelect("count(*), avg(revenue)")).toEqual([]);
  });

  it("returns no errors for alias with AS", () => {
    expect(validateSelect("count(*) AS total")).toEqual([]);
  });

  it("returns no errors for DISTINCT", () => {
    expect(validateSelect("DISTINCT state")).toEqual([]);
  });

  it("returns UNKNOWN_FUNCTION for misspelled function", () => {
    const result = validateSelect("cont(*)");
    expect(result).toEqual([
      expect.objectContaining({
        code: "UNKNOWN_FUNCTION",
        near: "cont",
        suggestion: "count",
      }),
    ]);
  });

  it("returns UNKNOWN_FUNCTION for another misspelling", () => {
    const result = validateSelect("sume(revenue)");
    expect(result).toEqual([
      expect.objectContaining({
        code: "UNKNOWN_FUNCTION",
        near: "sume",
        suggestion: "sum",
      }),
    ]);
  });

  it("returns MALFORMED_FUNCTION for unclosed paren", () => {
    const result = validateSelect("count(");
    expect(result).toEqual([
      expect.objectContaining({
        code: "MALFORMED_FUNCTION",
        near: "count(",
      }),
    ]);
  });

  it("handles multiple functions in one select", () => {
    const result = validateSelect("cont(*), sume(revenue)");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ code: "UNKNOWN_FUNCTION", near: "cont" });
    expect(result[1]).toMatchObject({ code: "UNKNOWN_FUNCTION", near: "sume" });
  });

  it("returns no errors for date functions", () => {
    expect(validateSelect("date_extract_y(created_at)")).toEqual([]);
    expect(validateSelect("date_trunc_ymd(updated_at) AS day")).toEqual([]);
  });
});
