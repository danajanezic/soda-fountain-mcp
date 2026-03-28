// tests/lib/rules/group-rules.test.ts
import { describe, it, expect } from "vitest";
import { validateGroup } from "../../../src/lib/rules/group-rules.js";

describe("validateGroup", () => {
  it("returns no errors for valid group", () => {
    expect(validateGroup("state")).toEqual([]);
    expect(validateGroup("state, county")).toEqual([]);
  });

  it("returns no errors for function in group", () => {
    expect(validateGroup("date_extract_y(created_at)")).toEqual([]);
  });
});
