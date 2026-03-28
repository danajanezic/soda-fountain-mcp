import { describe, it, expect } from "vitest";
import { DatasetIdSchema, CorrelationKeySeedSchema } from "../../src/lib/types.js";

describe("Zod schemas", () => {
  describe("DatasetIdSchema", () => {
    it("accepts valid 4x4 lowercase IDs", () => {
      expect(DatasetIdSchema.parse("tckn-sxa6")).toBe("tckn-sxa6");
      expect(DatasetIdSchema.parse("fbwv-q84y")).toBe("fbwv-q84y");
    });

    it("rejects uppercase characters", () => {
      expect(() => DatasetIdSchema.parse("ABCD-1234")).toThrow();
    });

    it("rejects missing dash", () => {
      expect(() => DatasetIdSchema.parse("abcd1234")).toThrow();
    });

    it("rejects too short", () => {
      expect(() => DatasetIdSchema.parse("abc-1234")).toThrow();
    });

    it("rejects too long", () => {
      expect(() => DatasetIdSchema.parse("abcde-12345")).toThrow();
    });

    it("rejects empty string", () => {
      expect(() => DatasetIdSchema.parse("")).toThrow();
    });
  });
});

describe("CorrelationKeySeedSchema", () => {
  it("accepts a valid minimal seed", () => {
    const seed = {
      version: "1.0",
      domains: {
        "data.oregon.gov": { state: "OR", name: "Oregon Open Data" },
      },
      keys: [
        {
          key: "county",
          type: "geographic",
          description: "County name within a US state",
          crossStateJoin: false,
          normalizations: ["upper()"],
          datasets: [
            {
              domain: "data.oregon.gov",
              id: "fbwv-q84y",
              name: "Fire Occurrence",
              column: "county",
              columnType: "text",
            },
          ],
        },
      ],
    };
    expect(CorrelationKeySeedSchema.parse(seed)).toEqual(seed);
  });

  it("accepts a dataset entry with optional columnNote", () => {
    const entry = {
      domain: "data.oregon.gov",
      id: "tckn-sxa6",
      name: "Active Businesses",
      column: "city",
      columnType: "text",
      columnNote: "city not county — needs zip-to-county mapping",
    };
    const seed = {
      version: "1.0",
      domains: { "data.oregon.gov": { state: "OR", name: "Oregon Open Data" } },
      keys: [
        {
          key: "city",
          type: "geographic",
          description: "City name",
          crossStateJoin: false,
          normalizations: [],
          datasets: [entry],
        },
      ],
    };
    expect(CorrelationKeySeedSchema.parse(seed)).toEqual(seed);
  });

  it("rejects invalid key type", () => {
    const seed = {
      version: "1.0",
      domains: {},
      keys: [
        {
          key: "test",
          type: "invalid_type",
          description: "test",
          crossStateJoin: false,
          normalizations: [],
          datasets: [],
        },
      ],
    };
    expect(() => CorrelationKeySeedSchema.parse(seed)).toThrow();
  });

  it("rejects dataset entry with invalid 4x4 ID", () => {
    const seed = {
      version: "1.0",
      domains: {},
      keys: [
        {
          key: "test",
          type: "geographic",
          description: "test",
          crossStateJoin: false,
          normalizations: [],
          datasets: [
            {
              domain: "data.oregon.gov",
              id: "INVALID",
              name: "Test",
              column: "col",
              columnType: "text",
            },
          ],
        },
      ],
    };
    expect(() => CorrelationKeySeedSchema.parse(seed)).toThrow();
  });
});
