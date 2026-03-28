import { describe, it, expect } from "vitest";
import { SocrataClient } from "../src/lib/socrata-client.js";

const client = new SocrataClient(process.env.SOCRATA_API_KEY);

describe("integration: live Socrata API", () => {
  it("searchCatalog returns results for 'business'", async () => {
    const result = await client.searchCatalog({ domain: "data.oregon.gov", query: "business" });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].id).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(result.results[0].name).toBeTruthy();
  }, 15_000);

  it("getMetadata returns schema for tckn-sxa6", async () => {
    const result = await client.getMetadata("data.oregon.gov", "tckn-sxa6");
    expect(result.name).toBe("Active Businesses - ALL");
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.columns[0].fieldName).toBeTruthy();
    expect(result.columns[0].type).toBeTruthy();
    expect(result.sampleRows.length).toBeGreaterThan(0);
  }, 15_000);

  it("queryDataset returns data for tckn-sxa6", async () => {
    const result = await client.queryDataset("data.oregon.gov", "tckn-sxa6", {
      select: "business_name, city",
      limit: 1,
      offset: 0,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toHaveProperty("business_name");
    expect(result.metadata.rowsReturned).toBe(1);
  }, 15_000);

  it("queryDataset with aggregation works", async () => {
    const result = await client.queryDataset("data.oregon.gov", "tckn-sxa6", {
      select: "city, count(*) as total",
      group: "city",
      order: "total DESC",
      limit: 3,
      offset: 0,
    });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]).toHaveProperty("city");
    expect(result.results[0]).toHaveProperty("total");
  }, 15_000);
});
