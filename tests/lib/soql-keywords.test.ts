import { describe, it, expect } from "vitest";
import {
  SOQL_FUNCTIONS,
  SOQL_OPERATORS,
  SOQL_CLAUSES,
  isKnownFunction,
  isKnownOperator,
} from "../../src/lib/soql-keywords.js";

describe("SOQL_FUNCTIONS", () => {
  it("contains core aggregation functions", () => {
    expect(SOQL_FUNCTIONS).toHaveProperty("count");
    expect(SOQL_FUNCTIONS).toHaveProperty("sum");
    expect(SOQL_FUNCTIONS).toHaveProperty("avg");
    expect(SOQL_FUNCTIONS).toHaveProperty("min");
    expect(SOQL_FUNCTIONS).toHaveProperty("max");
  });

  it("contains string functions", () => {
    expect(SOQL_FUNCTIONS).toHaveProperty("upper");
    expect(SOQL_FUNCTIONS).toHaveProperty("lower");
    expect(SOQL_FUNCTIONS).toHaveProperty("starts_with");
  });

  it("contains date functions", () => {
    expect(SOQL_FUNCTIONS).toHaveProperty("date_extract_y");
    expect(SOQL_FUNCTIONS).toHaveProperty("date_trunc_ymd");
  });

  it("contains geospatial functions", () => {
    expect(SOQL_FUNCTIONS).toHaveProperty("within_box");
    expect(SOQL_FUNCTIONS).toHaveProperty("distance_in_meters");
  });
});

describe("isKnownFunction", () => {
  it("returns true for known functions (case-insensitive)", () => {
    expect(isKnownFunction("count")).toBe(true);
    expect(isKnownFunction("COUNT")).toBe(true);
    expect(isKnownFunction("Count")).toBe(true);
  });

  it("returns false for unknown functions", () => {
    expect(isKnownFunction("cont")).toBe(false);
    expect(isKnownFunction("foobar")).toBe(false);
  });
});

describe("isKnownOperator", () => {
  it("returns true for known operators", () => {
    expect(isKnownOperator("AND")).toBe(true);
    expect(isKnownOperator("LIKE")).toBe(true);
    expect(isKnownOperator("IS NULL")).toBe(true);
    expect(isKnownOperator("NOT IN")).toBe(true);
    expect(isKnownOperator("BETWEEN")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isKnownOperator("and")).toBe(true);
    expect(isKnownOperator("like")).toBe(true);
  });

  it("returns false for unknown operators", () => {
    expect(isKnownOperator("LIEK")).toBe(false);
  });
});

describe("SOQL_CLAUSES", () => {
  it("contains all valid clause names", () => {
    expect(SOQL_CLAUSES).toContain("select");
    expect(SOQL_CLAUSES).toContain("where");
    expect(SOQL_CLAUSES).toContain("order");
    expect(SOQL_CLAUSES).toContain("group");
    expect(SOQL_CLAUSES).toContain("having");
    expect(SOQL_CLAUSES).toContain("limit");
    expect(SOQL_CLAUSES).toContain("offset");
    expect(SOQL_CLAUSES).toContain("q");
  });
});
