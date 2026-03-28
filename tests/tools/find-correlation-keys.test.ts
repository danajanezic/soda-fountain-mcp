import { describe, it, expect } from "vitest";
import { handleFindCorrelationKeys } from "../../src/tools/find-correlation-keys.js";

describe("handleFindCorrelationKeys", () => {
  it("returns all keys when no filters provided", () => {
    const result = handleFindCorrelationKeys({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.keys).toHaveLength(14);
    expect(parsed.domains).toBeDefined();
  });

  it("filters by key name", () => {
    const result = handleFindCorrelationKeys({ key: "county" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.keys).toHaveLength(1);
    expect(parsed.keys[0].key).toBe("county");
    expect(parsed.keys[0].datasets.length).toBeGreaterThanOrEqual(10);
  });

  it("filters by dataset ID", () => {
    const result = handleFindCorrelationKeys({ datasetId: "fbwv-q84y" });
    const parsed = JSON.parse(result.content[0].text);
    const keyNames = parsed.keys.map((k: { key: string }) => k.key);
    expect(keyNames).toContain("county");
    expect(keyNames).toContain("lat_long");
    expect(keyNames).toContain("calendar_year");
  });

  it("filters by domain", () => {
    const result = handleFindCorrelationKeys({ domain: "data.nj.gov" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.keys.length).toBeGreaterThanOrEqual(3);
    for (const key of parsed.keys) {
      const domains = key.datasets.map((d: { domain: string }) => d.domain);
      expect(domains).toContain("data.nj.gov");
    }
  });

  it("filters for cross-state keys only", () => {
    const result = handleFindCorrelationKeys({ crossStateOnly: true });
    const parsed = JSON.parse(result.content[0].text);
    for (const key of parsed.keys) {
      expect(key.crossStateJoin).toBe(true);
    }
    const keyNames = parsed.keys.map((k: { key: string }) => k.key);
    expect(keyNames).toContain("zip");
    expect(keyNames).not.toContain("county");
  });

  it("returns correlatable datasets for a given dataset+key", () => {
    const result = handleFindCorrelationKeys({
      datasetId: "fbwv-q84y",
      key: "county",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.keys).toHaveLength(1);
    const ids = parsed.keys[0].datasets.map((d: { id: string }) => d.id);
    expect(ids).not.toContain("fbwv-q84y");
    expect(ids).toContain("6x9d-idz4");
  });

  it("returns error for unknown key name", () => {
    const result = handleFindCorrelationKeys({ key: "nonexistent" });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe(true);
  });
});
