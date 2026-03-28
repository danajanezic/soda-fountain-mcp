import { describe, it, expect } from "vitest";
import { CorrelationKeyIndex } from "../../src/lib/correlation-keys.js";

describe("CorrelationKeyIndex", () => {
  const index = new CorrelationKeyIndex();

  describe("listKeys", () => {
    it("returns all 14 keys", () => {
      const keys = index.listKeys();
      expect(keys).toHaveLength(14);
    });

    it("each key has required fields", () => {
      const keys = index.listKeys();
      for (const key of keys) {
        expect(key.key).toBeTruthy();
        expect(key.type).toBeTruthy();
        expect(key.description).toBeTruthy();
        expect(typeof key.crossStateJoin).toBe("boolean");
        expect(Array.isArray(key.normalizations)).toBe(true);
        expect(Array.isArray(key.datasets)).toBe(true);
        expect(key.datasets.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getKey", () => {
    it("returns the county key", () => {
      const key = index.getKey("county");
      expect(key).toBeDefined();
      expect(key!.type).toBe("geographic");
      expect(key!.crossStateJoin).toBe(false);
      expect(key!.datasets.length).toBeGreaterThanOrEqual(10);
    });

    it("returns undefined for unknown key", () => {
      expect(index.getKey("nonexistent")).toBeUndefined();
    });
  });

  describe("getKeysForDataset", () => {
    it("returns keys for OR fire data", () => {
      const keys = index.getKeysForDataset("fbwv-q84y");
      const keyNames = keys.map((k) => k.key);
      expect(keyNames).toContain("county");
      expect(keyNames).toContain("lat_long");
      expect(keyNames).toContain("calendar_year");
      expect(keyNames).toContain("date");
    });

    it("returns empty array for unknown dataset", () => {
      expect(index.getKeysForDataset("zzzz-zzzz")).toEqual([]);
    });
  });

  describe("getKeysForDomain", () => {
    it("returns keys for data.oregon.gov", () => {
      const keys = index.getKeysForDomain("data.oregon.gov");
      expect(keys.length).toBeGreaterThanOrEqual(10);
    });

    it("returns keys for data.nj.gov", () => {
      const keys = index.getKeysForDomain("data.nj.gov");
      expect(keys.length).toBeGreaterThanOrEqual(3);
    });

    it("returns empty array for unknown domain", () => {
      expect(index.getKeysForDomain("data.unknown.gov")).toEqual([]);
    });
  });

  describe("getCrossStateKeys", () => {
    it("returns only keys where crossStateJoin is true", () => {
      const keys = index.getCrossStateKeys();
      for (const key of keys) {
        expect(key.crossStateJoin).toBe(true);
      }
      const keyNames = keys.map((k) => k.key);
      expect(keyNames).toContain("zip");
      expect(keyNames).toContain("naics");
      expect(keyNames).toContain("calendar_year");
      expect(keyNames).not.toContain("county");
      expect(keyNames).not.toContain("agency");
    });
  });

  describe("findCorrelatable", () => {
    it("finds datasets correlatable with OR fire data by county", () => {
      const results = index.findCorrelatable("fbwv-q84y", "county");
      expect(results.length).toBeGreaterThanOrEqual(5);
      const ids = results.map((r) => r.id);
      expect(ids).not.toContain("fbwv-q84y");
      expect(ids).toContain("6x9d-idz4");
      expect(ids).toContain("8h6y-5uec");
    });

    it("returns empty array for unknown dataset", () => {
      expect(index.findCorrelatable("zzzz-zzzz", "county")).toEqual([]);
    });

    it("returns empty array for key the dataset does not have", () => {
      expect(index.findCorrelatable("fbwv-q84y", "business_name")).toEqual([]);
    });
  });

  describe("getDomains", () => {
    it("returns all 6 domains", () => {
      const domains = index.getDomains();
      expect(Object.keys(domains)).toHaveLength(6);
      expect(domains["data.oregon.gov"]).toEqual({
        state: "OR",
        name: "Oregon Open Data",
      });
    });
  });
});
