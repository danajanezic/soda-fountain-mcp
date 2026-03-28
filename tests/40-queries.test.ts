/**
 * 40 queries of increasing complexity tested through the MCP tool handlers
 * AND validated against direct SODA API calls.
 *
 * Levels:
 *   1-10   Basic: simple selects, limits, single filters
 *  11-20   Intermediate: multiple filters, text search, date filters
 *  21-30   Aggregation: GROUP BY, COUNT, SUM, AVG, HAVING
 *  31-40   Advanced: multi-clause, nested logic, geo, cross-field
 */

import { describe, it, expect } from "vitest";
import { SocrataClient } from "../src/lib/socrata-client.js";
import { handleSearchDatasets } from "../src/tools/search-datasets.js";
import { handleGetDatasetSchema } from "../src/tools/get-dataset-schema.js";
import { handleQueryDataset } from "../src/tools/query-dataset.js";

const client = new SocrataClient(process.env.SOCRATA_API_KEY);

/** Helper: call tool handler, parse the JSON from the text content */
function parseToolResult(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

/** Helper: direct SODA API query for validation */
async function directQuery(datasetId: string, params: Record<string, string>): Promise<unknown[]> {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    parts.push(`${key}=${encodeURIComponent(val)}`);
  }
  const url = `https://data.oregon.gov/resource/${datasetId}.json?${parts.join("&")}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.SOCRATA_API_KEY) {
    headers["X-App-Token"] = process.env.SOCRATA_API_KEY;
  }
  const res = await fetch(url, { headers });
  return res.json();
}

// ─────────────────────────────────────────────────────
// LEVEL 1: Basic (queries 1-10)
// ─────────────────────────────────────────────────────

describe("Level 1: Basic queries", () => {
  // Q1: Search for datasets about "fire"
  it("Q1: search datasets for 'fire'", async () => {
    const result = parseToolResult(await handleSearchDatasets(client, { domain: "data.oregon.gov", query: "fire" }));
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some((d: { name: string }) => d.name.toLowerCase().includes("fire"))).toBe(true);
  }, 15_000);

  // Q2: Search for datasets in "Business" category
  it("Q2: search datasets by category 'Business'", async () => {
    const result = parseToolResult(await handleSearchDatasets(client, { domain: "data.oregon.gov", category: "Business" }));
    expect(result.results.length).toBeGreaterThan(0);
  }, 15_000);

  // Q3: Get schema for Active Businesses
  it("Q3: get schema for active businesses (tckn-sxa6)", async () => {
    const result = parseToolResult(await handleGetDatasetSchema(client, { domain: "data.oregon.gov", datasetId: "tckn-sxa6" }));
    expect(result.name).toBe("Active Businesses - ALL");
    expect(result.columns.length).toBeGreaterThan(5);
    expect(result.sampleRows.length).toBeGreaterThan(0);
  }, 15_000);

  // Q4: Simple select 3 rows from active businesses
  it("Q4: select 3 rows from active businesses", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name, city", limit: 3, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", { $select: "business_name, city", $limit: "3" });
    expect(mcp.results).toHaveLength(3);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q5: Select from state salaries dataset
  it("Q5: select 5 rows from state salaries (4cmg-5yp4)", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "4cmg-5yp4", select: "agency_title, classification, annual_salary", limit: 5, offset: 0,
    }));
    const direct = await directQuery("4cmg-5yp4", { $select: "agency_title, classification, annual_salary", $limit: "5" });
    expect(mcp.results).toHaveLength(5);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q6: Get schema for fire occurrence data
  it("Q6: get schema for fire occurrence (fbwv-q84y)", async () => {
    const result = parseToolResult(await handleGetDatasetSchema(client, { domain: "data.oregon.gov", datasetId: "fbwv-q84y" }));
    expect(result.name).toContain("Fire Occurrence");
    const colNames = result.columns.map((c: { fieldName: string }) => c.fieldName);
    expect(colNames).toContain("esttotalacres");
    expect(colNames).toContain("county");
    // Verify system columns are filtered
    expect(colNames.every((n: string) => !n.startsWith(":"))).toBe(true);
  }, 15_000);

  // Q7: Select with offset (pagination)
  it("Q7: pagination - page 2 of active businesses", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name", limit: 5, offset: 5,
    }));
    const direct = await directQuery("tckn-sxa6", { $select: "business_name", $limit: "5", $offset: "5" });
    expect(mcp.results).toHaveLength(5);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q8: Select with order ASC
  it("Q8: oldest businesses by registry_date ASC", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name, registry_date",
      order: "registry_date ASC", limit: 3, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "business_name, registry_date", $order: "registry_date ASC", $limit: "3",
    });
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q9: Full-text search
  it("Q9: full-text search for 'coffee' in businesses", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", search: "coffee", limit: 5, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", { $q: "coffee", $limit: "5" });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q10: Search datasets with keyword + category
  it("Q10: search datasets 'salary' in Revenue & Expense", async () => {
    const result = parseToolResult(await handleSearchDatasets(client, { domain: "data.oregon.gov",
      query: "salary", category: "Revenue & Expense",
    }));
    expect(result.results.length).toBeGreaterThan(0);
  }, 15_000);
});

// ─────────────────────────────────────────────────────
// LEVEL 2: Intermediate (queries 11-20)
// ─────────────────────────────────────────────────────

describe("Level 2: Intermediate queries", () => {
  // Q11: WHERE with equality filter
  it("Q11: businesses in PORTLAND", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name, city",
      where: "city='PORTLAND'", limit: 5, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "business_name, city", $where: "city='PORTLAND'", $limit: "5",
    });
    expect(mcp.results.every((r: { city: string }) => r.city === "PORTLAND")).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q12: WHERE with comparison operator
  it("Q12: salaries above $150,000", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "4cmg-5yp4", select: "agency_title, classification, annual_salary",
      where: "annual_salary > 150000", order: "annual_salary DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("4cmg-5yp4", {
      $select: "agency_title, classification, annual_salary",
      $where: "annual_salary > 150000", $order: "annual_salary DESC", $limit: "5",
    });
    expect(mcp.results.every((r: { annual_salary: string }) => Number(r.annual_salary) > 150000)).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q13: WHERE with AND
  it("Q13: businesses in SALEM that are nonprofits", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name, city, entity_type",
      where: "city='SALEM' AND entity_type='DOMESTIC NONPROFIT CORPORATION'",
      limit: 5, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "business_name, city, entity_type",
      $where: "city='SALEM' AND entity_type='DOMESTIC NONPROFIT CORPORATION'", $limit: "5",
    });
    expect(mcp.results.every((r: { city: string; entity_type: string }) =>
      r.city === "SALEM" && r.entity_type === "DOMESTIC NONPROFIT CORPORATION"
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q14: WHERE with LIKE
  it("Q14: businesses with 'BREW' in name", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name, city",
      where: "business_name LIKE '%BREW%'", limit: 5, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "business_name, city", $where: "business_name LIKE '%BREW%'", $limit: "5",
    });
    expect(mcp.results.every((r: { business_name: string }) =>
      r.business_name.toUpperCase().includes("BREW")
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q15: WHERE with IN
  it("Q15: businesses in BEND, EUGENE, or CORVALLIS", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name, city",
      where: "city IN('BEND','EUGENE','CORVALLIS')", limit: 10, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "business_name, city",
      $where: "city IN('BEND','EUGENE','CORVALLIS')", $limit: "10",
    });
    const validCities = new Set(["BEND", "EUGENE", "CORVALLIS"]);
    expect(mcp.results.every((r: { city: string }) => validCities.has(r.city))).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q16: WHERE with BETWEEN on salary
  it("Q16: salaries between 80000 and 90000", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "4cmg-5yp4", select: "agency_title, classification, annual_salary",
      where: "annual_salary BETWEEN 80000 AND 90000", limit: 5, offset: 0,
    }));
    const direct = await directQuery("4cmg-5yp4", {
      $select: "agency_title, classification, annual_salary",
      $where: "annual_salary BETWEEN 80000 AND 90000", $limit: "5",
    });
    expect(mcp.results.every((r: { annual_salary: string }) => {
      const s = Number(r.annual_salary);
      return s >= 80000 && s <= 90000;
    })).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q17: WHERE with NOT LIKE
  it("Q17: businesses NOT containing 'LLC' in name", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "business_name, entity_type",
      where: "business_name NOT LIKE '%LLC%'", limit: 5, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "business_name, entity_type",
      $where: "business_name NOT LIKE '%LLC%'", $limit: "5",
    });
    expect(mcp.results.every((r: { business_name: string }) =>
      !r.business_name.toUpperCase().includes("LLC")
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q18: Fire data filtered by year
  it("Q18: fires in 2020", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y", select: "firename, esttotalacres, county",
      where: "fireyear='2020' AND esttotalacres IS NOT NULL",
      order: "esttotalacres DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "firename, esttotalacres, county",
      $where: "fireyear='2020' AND esttotalacres IS NOT NULL",
      $order: "esttotalacres DESC", $limit: "5",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q19: WHERE with OR
  it("Q19: fires caused by lightning OR smoking", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y", select: "firename, generalcause, county",
      where: "generalcause='Lightning' OR generalcause='Smoking'",
      order: "firename ASC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "firename, generalcause, county",
      $where: "generalcause='Lightning' OR generalcause='Smoking'",
      $order: "firename ASC", $limit: "10",
    });
    expect(mcp.results.every((r: { generalcause: string }) =>
      r.generalcause === "Lightning" || r.generalcause === "Smoking"
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q20: IS NOT NULL filter
  it("Q20: consumer complaints with closing description", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "2ix7-8hwk", select: "respondent, complaint_description, closing_description",
      where: "closing_description IS NOT NULL", limit: 5, offset: 0,
    }));
    const direct = await directQuery("2ix7-8hwk", {
      $select: "respondent, complaint_description, closing_description",
      $where: "closing_description IS NOT NULL", $limit: "5",
    });
    expect(mcp.results.every((r: { closing_description: string }) =>
      r.closing_description !== null && r.closing_description !== undefined
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);
});

// ─────────────────────────────────────────────────────
// LEVEL 3: Aggregation (queries 21-30)
// ─────────────────────────────────────────────────────

describe("Level 3: Aggregation queries", () => {
  // Q21: COUNT businesses by city
  it("Q21: count businesses by city, top 5", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "city, count(*) as total",
      group: "city", order: "total DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "city, count(*) as total", $group: "city",
      $order: "total DESC", $limit: "5",
    });
    expect(mcp.results).toHaveLength(5);
    expect(Number(mcp.results[0].total)).toBeGreaterThan(Number(mcp.results[4].total));
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q22: COUNT businesses by entity_type
  it("Q22: count businesses by entity type", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "entity_type, count(*) as cnt",
      group: "entity_type", order: "cnt DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "entity_type, count(*) as cnt", $group: "entity_type",
      $order: "cnt DESC", $limit: "10",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q23: AVG salary by agency
  it("Q23: average salary by agency, top 5", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "4cmg-5yp4", select: "agency_title, avg(annual_salary) as avg_salary",
      group: "agency_title", order: "avg_salary DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("4cmg-5yp4", {
      $select: "agency_title, avg(annual_salary) as avg_salary",
      $group: "agency_title", $order: "avg_salary DESC", $limit: "5",
    });
    expect(mcp.results).toHaveLength(5);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q24: SUM of fire acres by county
  it("Q24: total fire acres by county, top 5", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y", select: "county, sum(esttotalacres) as total_acres",
      group: "county", order: "total_acres DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "county, sum(esttotalacres) as total_acres",
      $group: "county", $order: "total_acres DESC", $limit: "5",
    });
    expect(mcp.results).toHaveLength(5);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q25: COUNT fires by year
  it("Q25: fire count by year", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y", select: "fireyear, count(*) as fire_count",
      group: "fireyear", order: "fireyear DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "fireyear, count(*) as fire_count", $group: "fireyear",
      $order: "fireyear DESC", $limit: "10",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q26: MIN and MAX salary
  it("Q26: min and max salary by agency", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "4cmg-5yp4",
      select: "agency_title, min(annual_salary) as min_sal, max(annual_salary) as max_sal",
      group: "agency_title", order: "max_sal DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("4cmg-5yp4", {
      $select: "agency_title, min(annual_salary) as min_sal, max(annual_salary) as max_sal",
      $group: "agency_title", $order: "max_sal DESC", $limit: "5",
    });
    expect(mcp.results).toHaveLength(5);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q27: COUNT fires by general cause
  it("Q27: fire count by general cause", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y", select: "generalcause, count(*) as cnt",
      group: "generalcause", order: "cnt DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "generalcause, count(*) as cnt", $group: "generalcause",
      $order: "cnt DESC", $limit: "10",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q28: HAVING - cities with more than 10000 businesses
  it("Q28: cities with more than 10000 businesses", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6", select: "city, count(*) as total",
      group: "city", having: "count(*) > 10000",
      order: "total DESC", limit: 20, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "city, count(*) as total", $group: "city",
      $having: "count(*) > 10000", $order: "total DESC", $limit: "20",
    });
    expect(mcp.results.every((r: { total: string }) => Number(r.total) > 10000)).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q29: AVG fire size by year
  it("Q29: average fire size by year, recent first", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y", select: "fireyear, avg(esttotalacres) as avg_acres",
      group: "fireyear", order: "fireyear DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "fireyear, avg(esttotalacres) as avg_acres",
      $group: "fireyear", $order: "fireyear DESC", $limit: "10",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q30: HAVING on fire acres - counties with >100000 total acres burned
  it("Q30: counties with >100000 total acres burned", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y", select: "county, sum(esttotalacres) as total_acres",
      group: "county", having: "sum(esttotalacres) > 100000",
      order: "total_acres DESC", limit: 20, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "county, sum(esttotalacres) as total_acres", $group: "county",
      $having: "sum(esttotalacres) > 100000", $order: "total_acres DESC", $limit: "20",
    });
    expect(mcp.results.every((r: { total_acres: string }) => Number(r.total_acres) > 100000)).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);
});

// ─────────────────────────────────────────────────────
// LEVEL 4: Advanced (queries 31-40)
// ─────────────────────────────────────────────────────

describe("Level 4: Advanced queries", () => {
  // Q31: Compound WHERE with AND + OR + grouping
  it("Q31: Portland or Salem nonprofits registered after 2020", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6",
      select: "business_name, city, entity_type, registry_date",
      where: "(city='PORTLAND' OR city='SALEM') AND entity_type='DOMESTIC NONPROFIT CORPORATION' AND registry_date > '2020-01-01'",
      order: "registry_date DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "business_name, city, entity_type, registry_date",
      $where: "(city='PORTLAND' OR city='SALEM') AND entity_type='DOMESTIC NONPROFIT CORPORATION' AND registry_date > '2020-01-01'",
      $order: "registry_date DESC", $limit: "10",
    });
    expect(mcp.results.every((r: { city: string; entity_type: string }) =>
      (r.city === "PORTLAND" || r.city === "SALEM") &&
      r.entity_type === "DOMESTIC NONPROFIT CORPORATION"
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q32: Aggregation with WHERE filter
  it("Q32: avg salary by agency for full-time only", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "4cmg-5yp4",
      select: "agency_title, avg(annual_salary) as avg_sal, count(*) as emp_count",
      where: "full_part_time='FULL TIME'",
      group: "agency_title", order: "avg_sal DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("4cmg-5yp4", {
      $select: "agency_title, avg(annual_salary) as avg_sal, count(*) as emp_count",
      $where: "full_part_time='FULL TIME'",
      $group: "agency_title", $order: "avg_sal DESC", $limit: "5",
    });
    expect(mcp.results).toHaveLength(5);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q33: Multiple aggregation functions in one query
  it("Q33: fire stats by county - count, sum, avg, max", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y",
      select: "county, count(*) as fires, sum(esttotalacres) as total_acres, avg(esttotalacres) as avg_acres, max(esttotalacres) as biggest",
      group: "county", order: "total_acres DESC", limit: 5, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "county, count(*) as fires, sum(esttotalacres) as total_acres, avg(esttotalacres) as avg_acres, max(esttotalacres) as biggest",
      $group: "county", $order: "total_acres DESC", $limit: "5",
    });
    expect(mcp.results).toHaveLength(5);
    // Verify all agg fields present
    expect(mcp.results[0]).toHaveProperty("fires");
    expect(mcp.results[0]).toHaveProperty("total_acres");
    expect(mcp.results[0]).toHaveProperty("avg_acres");
    expect(mcp.results[0]).toHaveProperty("biggest");
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q34: LIKE with aggregation
  it("Q34: count businesses with 'FARM' in name by city", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6",
      select: "city, count(*) as farm_businesses",
      where: "business_name LIKE '%FARM%'",
      group: "city", order: "farm_businesses DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "city, count(*) as farm_businesses",
      $where: "business_name LIKE '%FARM%'",
      $group: "city", $order: "farm_businesses DESC", $limit: "10",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q35: Aggregation + HAVING + WHERE combined
  it("Q35: agencies with >500 full-time employees earning avg >80k", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "4cmg-5yp4",
      select: "agency_title, count(*) as cnt, avg(annual_salary) as avg_sal",
      where: "full_part_time='FULL TIME' AND fiscal_year='2023'",
      group: "agency_title",
      having: "count(*) > 500 AND avg(annual_salary) > 80000",
      order: "avg_sal DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("4cmg-5yp4", {
      $select: "agency_title, count(*) as cnt, avg(annual_salary) as avg_sal",
      $where: "full_part_time='FULL TIME' AND fiscal_year='2023'",
      $group: "agency_title",
      $having: "count(*) > 500 AND avg(annual_salary) > 80000",
      $order: "avg_sal DESC", $limit: "10",
    });
    expect(mcp.results.every((r: { cnt: string; avg_sal: string }) =>
      Number(r.cnt) > 500 && Number(r.avg_sal) > 80000
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q36: Human vs Lightning fires by year
  it("Q36: human vs lightning fires by year (2018-2022)", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y",
      select: "fireyear, humanorlightning, count(*) as cnt",
      where: "fireyear >= '2018' AND (humanorlightning='Human' OR humanorlightning='Lightning')",
      group: "fireyear, humanorlightning",
      order: "fireyear DESC, cnt DESC", limit: 20, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "fireyear, humanorlightning, count(*) as cnt",
      $where: "fireyear >= '2018' AND (humanorlightning='Human' OR humanorlightning='Lightning')",
      $group: "fireyear, humanorlightning",
      $order: "fireyear DESC, cnt DESC", $limit: "20",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q37: Expenditure analysis - top vendors by total spending
  it("Q37: top vendors by total state expenditure", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "y9g9-xsxs",
      select: "vendor, sum(expense) as total_expense, count(*) as transactions",
      where: "expense > 0",
      group: "vendor",
      having: "sum(expense) > 10000000",
      order: "total_expense DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("y9g9-xsxs", {
      $select: "vendor, sum(expense) as total_expense, count(*) as transactions",
      $where: "expense > 0",
      $group: "vendor",
      $having: "sum(expense) > 10000000",
      $order: "total_expense DESC", $limit: "10",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q38: Full-text search with aggregation
  it("Q38: search 'solar' in businesses and count by state", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "tckn-sxa6",
      select: "state, count(*) as cnt",
      search: "solar",
      group: "state", order: "cnt DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("tckn-sxa6", {
      $select: "state, count(*) as cnt",
      $q: "solar",
      $group: "state", $order: "cnt DESC", $limit: "10",
    });
    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q39: Complex date + aggregation on fire data
  it("Q39: largest fire per county in 2020-2022", async () => {
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: "fbwv-q84y",
      select: "county, max(esttotalacres) as max_fire, count(*) as fire_count",
      where: "fireyear >= '2020' AND fireyear <= '2022' AND esttotalacres IS NOT NULL",
      group: "county",
      having: "max(esttotalacres) > 1000",
      order: "max_fire DESC", limit: 10, offset: 0,
    }));
    const direct = await directQuery("fbwv-q84y", {
      $select: "county, max(esttotalacres) as max_fire, count(*) as fire_count",
      $where: "fireyear >= '2020' AND fireyear <= '2022' AND esttotalacres IS NOT NULL",
      $group: "county",
      $having: "max(esttotalacres) > 1000",
      $order: "max_fire DESC", $limit: "10",
    });
    expect(mcp.results.every((r: { max_fire: string }) => Number(r.max_fire) > 1000)).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 15_000);

  // Q40: Multi-dataset workflow simulation - search, schema, query
  it("Q40: full workflow - search, schema, then complex query", async () => {
    // Step 1: Search for salary data
    const searchResult = parseToolResult(await handleSearchDatasets(client, { domain: "data.oregon.gov", query: "salary state" }));
    expect(searchResult.results.length).toBeGreaterThan(0);
    const salaryDataset = searchResult.results.find(
      (d: { id: string }) => d.id === "4cmg-5yp4"
    ) || searchResult.results[0];

    // Step 2: Get schema
    const schema = parseToolResult(await handleGetDatasetSchema(client, { domain: "data.oregon.gov", datasetId: salaryDataset.id }));
    expect(schema.columns.length).toBeGreaterThan(0);

    // Step 3: Complex query using schema knowledge
    const mcp = parseToolResult(await handleQueryDataset(client, {
      domain: "data.oregon.gov", datasetId: salaryDataset.id,
      select: "agency_title, service_type, count(*) as employees, avg(annual_salary) as avg_sal, max(annual_salary) as top_sal",
      where: "fiscal_year='2023' AND annual_salary > 0",
      group: "agency_title, service_type",
      having: "count(*) > 100",
      order: "avg_sal DESC",
      limit: 10, offset: 0,
    }));

    // Validate against direct
    const direct = await directQuery(salaryDataset.id, {
      $select: "agency_title, service_type, count(*) as employees, avg(annual_salary) as avg_sal, max(annual_salary) as top_sal",
      $where: "fiscal_year='2023' AND annual_salary > 0",
      $group: "agency_title, service_type",
      $having: "count(*) > 100",
      $order: "avg_sal DESC",
      $limit: "10",
    });

    expect(mcp.results.length).toBeGreaterThan(0);
    expect(mcp.results.every((r: { employees: string; avg_sal: string }) =>
      Number(r.employees) > 100 && Number(r.avg_sal) > 0
    )).toBe(true);
    expect(mcp.results).toEqual(direct);
  }, 30_000);
});
