/**
 * 40 correlation key queries of increasing complexity.
 *
 * Tests the find_correlation_keys tool AND validates that the correlation
 * metadata actually works by using it to drive real cross-dataset SODA queries.
 *
 * Levels:
 *   1-10   Key Discovery: tool lookups, filtering, error handling
 *  11-20   Single-Portal Correlation: use keys to query related OR datasets
 *  21-30   Cross-Portal Correlation: use keys to query datasets across states
 *  31-40   Multi-Key Matrix: combine geographic + temporal + entity keys
 */

import { describe, it, expect } from "vitest";
import { SocrataClient } from "../src/lib/socrata-client.js";
import { handleFindCorrelationKeys } from "../src/tools/find-correlation-keys.js";
import { handleQueryDataset } from "../src/tools/query-dataset.js";

const client = new SocrataClient(process.env.SOCRATA_API_KEY);

/** Parse JSON from tool result */
function parse(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text);
}

/** Shorthand for querying a dataset on any domain */
async function query(domain: string, id: string, opts: {
  select?: string; where?: string; group?: string; having?: string;
  order?: string; limit?: number; offset?: number; search?: string;
}) {
  return parse(await handleQueryDataset(client, {
    domain, datasetId: id, limit: opts.limit ?? 10, offset: opts.offset ?? 0, ...opts,
  }));
}

// ─────────────────────────────────────────────────────
// LEVEL 1: Key Discovery (1-10)
// ─────────────────────────────────────────────────────

describe("Level 1: Key Discovery", () => {
  it("Q1: list all correlation keys", () => {
    const result = parse(handleFindCorrelationKeys({}));
    expect(result.keys).toHaveLength(14);
    expect(result.domains).toBeDefined();
    expect(Object.keys(result.domains)).toHaveLength(6);
  });

  it("Q2: look up the 'county' key", () => {
    const result = parse(handleFindCorrelationKeys({ key: "county" }));
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].key).toBe("county");
    expect(result.keys[0].type).toBe("geographic");
    expect(result.keys[0].crossStateJoin).toBe(false);
    expect(result.keys[0].datasets.length).toBeGreaterThanOrEqual(10);
  });

  it("Q3: look up the 'zip' key — verify cross-state", () => {
    const result = parse(handleFindCorrelationKeys({ key: "zip" }));
    expect(result.keys[0].crossStateJoin).toBe(true);
    // Should span at least 4 different domains
    const domains = new Set(result.keys[0].datasets.map((d: { domain: string }) => d.domain));
    expect(domains.size).toBeGreaterThanOrEqual(4);
  });

  it("Q4: find keys for OR fire dataset (fbwv-q84y)", () => {
    const result = parse(handleFindCorrelationKeys({ datasetId: "fbwv-q84y" }));
    const keyNames = result.keys.map((k: { key: string }) => k.key);
    expect(keyNames).toContain("county");
    expect(keyNames).toContain("lat_long");
    expect(keyNames).toContain("calendar_year");
    expect(keyNames).toContain("date");
  });

  it("Q5: find keys for NJ domain", () => {
    const result = parse(handleFindCorrelationKeys({ domain: "data.nj.gov" }));
    expect(result.keys.length).toBeGreaterThanOrEqual(3);
    // All dataset entries should be from NJ
    for (const key of result.keys) {
      for (const ds of key.datasets) {
        expect(ds.domain).toBe("data.nj.gov");
      }
    }
  });

  it("Q6: filter cross-state keys only", () => {
    const result = parse(handleFindCorrelationKeys({ crossStateOnly: true }));
    for (const key of result.keys) {
      expect(key.crossStateJoin).toBe(true);
    }
    const names = result.keys.map((k: { key: string }) => k.key);
    expect(names).toContain("zip");
    expect(names).toContain("naics");
    expect(names).toContain("calendar_year");
    expect(names).not.toContain("county");
  });

  it("Q7: find datasets correlatable with fire data by county", () => {
    const result = parse(handleFindCorrelationKeys({ datasetId: "fbwv-q84y", key: "county" }));
    expect(result.keys).toHaveLength(1);
    const ids = result.keys[0].datasets.map((d: { id: string }) => d.id);
    expect(ids).not.toContain("fbwv-q84y"); // source excluded
    expect(ids).toContain("6x9d-idz4"); // library directory
    expect(ids).toContain("8h6y-5uec"); // voter registration
  });

  it("Q8: error for unknown key name", () => {
    const result = handleFindCorrelationKeys({ key: "nonexistent" });
    expect(result.isError).toBe(true);
    const parsed = parse(result);
    expect(parsed.error).toBe(true);
    expect(parsed.code).toBe("KEY_NOT_FOUND");
    expect(parsed.suggestion).toContain("county");
  });

  it("Q9: find keys for TX domain — verify correct column names", () => {
    const result = parse(handleFindCorrelationKeys({ domain: "data.texas.gov" }));
    const countyKey = result.keys.find((k: { key: string }) => k.key === "county");
    expect(countyKey).toBeDefined();
    // TX PUC complaints uses 'county', TX expenditures uses 'county'
    const txDatasets = countyKey.datasets;
    expect(txDatasets.length).toBeGreaterThanOrEqual(2);
  });

  it("Q10: verify NAICS key spans 4 states", () => {
    const result = parse(handleFindCorrelationKeys({ key: "naics" }));
    const domains = new Set(result.keys[0].datasets.map((d: { domain: string }) => d.domain));
    expect(domains.size).toBe(4); // OR, CT, TX, NY
    // Verify column name heterogeneity
    const columns = result.keys[0].datasets.map((d: { column: string }) => d.column);
    expect(columns).toContain("naics"); // OR
    expect(columns).toContain("naics_code"); // CT
    expect(columns).toContain("sic_code_naics_code"); // TX
    expect(columns).toContain("industry_code"); // NY
  });
});

// ─────────────────────────────────────────────────────
// LEVEL 2: Single-Portal Correlation (11-20)
// Uses correlation keys to drive real queries within OR
// ─────────────────────────────────────────────────────

describe("Level 2: Single-Portal Correlation (Oregon)", () => {
  // Q11: Use county key to query fire data and voter data for same county
  // Fire data uses mixed case (e.g., "Jackson"), voter data uses uppercase (e.g., "JACKSON")
  it("Q11: fires vs voters in Jackson County", async () => {
    const fires = await query("data.oregon.gov", "fbwv-q84y", {
      select: "county, count(*) as fire_count",
      where: "upper(county)='JACKSON'",
      group: "county",
    });
    const voters = await query("data.oregon.gov", "8h6y-5uec", {
      select: "county, sum(sum_partycount) as total_voters",
      where: "county='JACKSON'",
      group: "county",
      limit: 1,
    });
    expect(fires.results).toHaveLength(1);
    expect(voters.results.length).toBeGreaterThanOrEqual(1);
    expect(Number(fires.results[0].fire_count)).toBeGreaterThan(0);
    expect(Number(voters.results[0].total_voters)).toBeGreaterThan(0);
  }, 15_000);

  // Q12: Use city key to compare businesses and consumer complaints in Portland
  it("Q12: businesses vs complaints in Portland", async () => {
    const businesses = await query("data.oregon.gov", "tckn-sxa6", {
      select: "count(*) as count",
      where: "city='PORTLAND'",
    });
    const complaints = await query("data.oregon.gov", "2ix7-8hwk", {
      select: "count(*) as count",
      where: "upper(city)='PORTLAND'",
    });
    expect(Number(businesses.results[0].count)).toBeGreaterThan(100_000);
    expect(Number(complaints.results[0].count)).toBeGreaterThan(0);
  }, 15_000);

  // Q13: Use calendar_year key — fire count by year from fire data
  it("Q13: fire count by year (2018-2022)", async () => {
    const result = await query("data.oregon.gov", "fbwv-q84y", {
      select: "fireyear, count(*) as count",
      where: "fireyear >= '2018' AND fireyear <= '2022'",
      group: "fireyear",
      order: "fireyear ASC",
    });
    expect(result.results.length).toBe(5);
    for (const row of result.results) {
      expect(Number(row.count)).toBeGreaterThan(0);
    }
  }, 15_000);

  // Q14: Use calendar_year key — OSHA violations by year
  it("Q14: OSHA violations trend", async () => {
    const result = await query("data.oregon.gov", "xc4e-hg3n", {
      select: "year, violations, inspections",
      where: "year >= 2018",
      order: "year ASC",
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const row of result.results) {
      expect(Number(row.violations)).toBeGreaterThan(0);
    }
  }, 15_000);

  // Q15: Use business_name key — look up a business across businesses + workers comp
  it("Q15: search business across OR registrations and workers comp", async () => {
    // Find a business name from active businesses
    const biz = await query("data.oregon.gov", "tckn-sxa6", {
      select: "business_name",
      where: "entity_type='DOMESTIC BUSINESS CORPORATION'",
      limit: 1,
    });
    expect(biz.results.length).toBe(1);
    const name = biz.results[0].business_name;

    // Search for it in workers comp employers using the mapped column name
    const wc = await query("data.oregon.gov", "q9zj-c8r2", {
      search: name,
      select: "legal_business_name, naics_description",
      limit: 5,
    });
    // May or may not find a match — just verify the query works
    expect(wc.results).toBeDefined();
  }, 20_000);

  // Q16: Use county key — top 5 counties by fire count
  it("Q16: top 5 OR counties by fire count", async () => {
    const result = await query("data.oregon.gov", "fbwv-q84y", {
      select: "county, count(*) as fire_count",
      group: "county",
      order: "fire_count DESC",
      limit: 5,
    });
    expect(result.results).toHaveLength(5);
    for (const row of result.results) {
      expect(row.county).toBeTruthy();
      expect(Number(row.fire_count)).toBeGreaterThan(100);
    }
  }, 15_000);

  // Q17: Use county key — top 5 counties by voter count
  it("Q17: top 5 OR counties by voter registration", async () => {
    const result = await query("data.oregon.gov", "8h6y-5uec", {
      select: "county, sum(sum_partycount) as total",
      group: "county",
      order: "total DESC",
      limit: 5,
    });
    expect(result.results).toHaveLength(5);
    // Multnomah should be #1 or near top
    const counties = result.results.map((r: { county: string }) => r.county.toUpperCase());
    expect(counties.some((c: string) => c.includes("MULTNOMAH"))).toBe(true);
  }, 15_000);

  // Q18: Use fiscal_year key — salary trends across years
  it("Q18: average state salary by fiscal year", async () => {
    const result = await query("data.oregon.gov", "4cmg-5yp4", {
      select: "fiscal_year, avg(annual_salary) as avg_salary, count(*) as employees",
      group: "fiscal_year",
      order: "fiscal_year DESC",
      limit: 5,
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const row of result.results) {
      expect(Number(row.avg_salary)).toBeGreaterThan(20_000);
    }
  }, 15_000);

  // Q19: Use lat_long key — fire data has coordinates
  it("Q19: fires near Portland (within_circle geospatial)", async () => {
    const result = await query("data.oregon.gov", "fbwv-q84y", {
      select: "firename, county, esttotalacres, latlongdd",
      where: "within_circle(latlongdd, 45.52, -122.68, 50000)",
      limit: 10,
    });
    // May or may not have fires within 50km of Portland
    expect(result.results).toBeDefined();
  }, 15_000);

  // Q20: Use date key — complaints opened in 2019
  it("Q20: consumer complaints opened in 2019", async () => {
    const result = await query("data.oregon.gov", "2ix7-8hwk", {
      select: "date_extract_m(date_open) as month, count(*) as count",
      where: "date_open >= '2019-01-01' AND date_open < '2020-01-01'",
      group: "date_extract_m(date_open)",
      order: "month ASC",
    });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThanOrEqual(12);
  }, 15_000);
});

// ─────────────────────────────────────────────────────
// LEVEL 3: Cross-Portal Correlation (21-30)
// Uses correlation keys to query the same concept across states
// ─────────────────────────────────────────────────────

describe("Level 3: Cross-Portal Correlation", () => {
  // Q21: Use county key — OR fire counties vs TX expenditure counties
  it("Q21: county key works on both OR fire and TX expenditures", async () => {
    const orFires = await query("data.oregon.gov", "fbwv-q84y", {
      select: "county, count(*) as count",
      group: "county",
      order: "count DESC",
      limit: 3,
    });
    const txSpend = await query("data.texas.gov", "2zpi-yjjs", {
      select: "county, sum(amount) as total",
      where: "county IS NOT NULL",
      group: "county",
      order: "total DESC",
      limit: 3,
    });
    expect(orFires.results).toHaveLength(3);
    expect(txSpend.results).toHaveLength(3);
    expect(orFires.results[0].county).toBeTruthy();
    expect(txSpend.results[0].county).toBeTruthy();
  }, 20_000);

  // Q22: Use city key — OR vs WA consumer complaints by city
  it("Q22: consumer complaints in OR vs WA (city key)", async () => {
    const orComplaints = await query("data.oregon.gov", "2ix7-8hwk", {
      select: "city, count(*) as count",
      where: "city IS NOT NULL",
      group: "city",
      order: "count DESC",
      limit: 3,
    });
    const waComplaints = await query("data.wa.gov", "gpri-47xz", {
      select: "businesscity, count(*) as count",
      where: "businesscity IS NOT NULL",
      group: "businesscity",
      order: "count DESC",
      limit: 3,
    });
    expect(orComplaints.results).toHaveLength(3);
    expect(waComplaints.results).toHaveLength(3);
  }, 20_000);

  // Q23: Use fiscal_year key — OR vs NJ agency expenditures
  it("Q23: expenditure comparison OR vs NJ by fiscal year", async () => {
    const orExpend = await query("data.oregon.gov", "y9g9-xsxs", {
      select: "fiscal_year, sum(expense) as total",
      group: "fiscal_year",
      order: "fiscal_year DESC",
      limit: 3,
    });
    const njExpend = await query("data.nj.gov", "apet-rp2i", {
      select: "budget_fiscal_year, sum(expended_amt) as total",
      group: "budget_fiscal_year",
      order: "budget_fiscal_year DESC",
      limit: 3,
    });
    expect(orExpend.results.length).toBeGreaterThan(0);
    expect(njExpend.results.length).toBeGreaterThan(0);
  }, 20_000);

  // Q24: Use zip key — OR businesses vs CT businesses by zip
  it("Q24: business registrations by zip — OR vs CT", async () => {
    const orBiz = await query("data.oregon.gov", "tckn-sxa6", {
      select: "zip, count(*) as count",
      where: "zip IS NOT NULL",
      group: "zip",
      order: "count DESC",
      limit: 3,
    });
    const ctBiz = await query("data.ct.gov", "n7gp-d28j", {
      select: "billingpostalcode, count(*) as count",
      where: "billingpostalcode IS NOT NULL",
      group: "billingpostalcode",
      order: "count DESC",
      limit: 3,
    });
    expect(orBiz.results).toHaveLength(3);
    expect(ctBiz.results).toHaveLength(3);
  }, 20_000);

  // Q25: Use complaint_status key — OR vs TX complaints by status
  it("Q25: complaint status distribution OR vs TX", async () => {
    const orStatus = await query("data.oregon.gov", "2ix7-8hwk", {
      select: "status, count(*) as count",
      group: "status",
      order: "count DESC",
    });
    const txStatus = await query("data.texas.gov", "cxnx-7tf4", {
      select: "staffdetermination, count(*) as count",
      where: "staffdetermination IS NOT NULL",
      group: "staffdetermination",
      order: "count DESC",
    });
    expect(orStatus.results.length).toBeGreaterThan(0);
    expect(txStatus.results.length).toBeGreaterThan(0);
  }, 20_000);

  // Q26: Use naics key — OR workers comp employers by NAICS description
  it("Q26: OR workers comp employers by NAICS description", async () => {
    const result = await query("data.oregon.gov", "q9zj-c8r2", {
      select: "naics_description, count(*) as count",
      where: "naics_description IS NOT NULL",
      group: "naics_description",
      order: "count DESC",
      limit: 10,
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const row of result.results) {
      expect(row.naics_description).toBeTruthy();
    }
  }, 15_000);

  // Q27: Use agency key — OR vs NJ agency names
  it("Q27: top agencies by expenditure — OR vs NJ", async () => {
    const orAgencies = await query("data.oregon.gov", "y9g9-xsxs", {
      select: "agency_1, sum(expense) as total",
      where: "agency_1 IS NOT NULL",
      group: "agency_1",
      order: "total DESC",
      limit: 5,
    });
    const njAgencies = await query("data.nj.gov", "apet-rp2i", {
      select: "ibno_agency, sum(expended_amt) as total",
      where: "ibno_agency IS NOT NULL",
      group: "ibno_agency",
      order: "total DESC",
      limit: 5,
    });
    expect(orAgencies.results).toHaveLength(5);
    expect(njAgencies.results).toHaveLength(5);
  }, 20_000);

  // Q28: Use entity_type key — OR vs CT business types
  it("Q28: business entity type distribution OR vs CT", async () => {
    const orTypes = await query("data.oregon.gov", "tckn-sxa6", {
      select: "entity_type, count(*) as count",
      group: "entity_type",
      order: "count DESC",
      limit: 5,
    });
    const ctTypes = await query("data.ct.gov", "n7gp-d28j", {
      select: "business_type, count(*) as count",
      where: "business_type IS NOT NULL",
      group: "business_type",
      order: "count DESC",
      limit: 5,
    });
    expect(orTypes.results.length).toBeGreaterThan(0);
    expect(ctTypes.results.length).toBeGreaterThan(0);
  }, 20_000);

  // Q29: Use date key — TX PUC complaints by month
  it("Q29: TX utility complaints by month (2024)", async () => {
    const result = await query("data.texas.gov", "cxnx-7tf4", {
      select: "date_extract_m(datereceived) as month, count(*) as count",
      where: "datereceived >= '2024-01-01' AND datereceived < '2025-01-01'",
      group: "date_extract_m(datereceived)",
      order: "month ASC",
    });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.length).toBeLessThanOrEqual(12);
  }, 15_000);

  // Q30: Use calendar_year key — NY workers comp claims by year
  // This is a large dataset — use a tight filter and longer timeout
  it("Q30: NY workers comp claims by accident year", async () => {
    const result = await query("data.ny.gov", "jshw-gkgu", {
      select: "date_extract_y(accident_date) as year, count(*) as count",
      where: "accident_date >= '2023-01-01' AND accident_date < '2025-01-01'",
      group: "date_extract_y(accident_date)",
      order: "year ASC",
      limit: 5,
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const row of result.results) {
      expect(Number(row.year)).toBeGreaterThanOrEqual(2023);
    }
  }, 45_000);
});

// ─────────────────────────────────────────────────────
// LEVEL 4: Multi-Key Matrix (31-40)
// Combines multiple correlation keys in complex queries
// ─────────────────────────────────────────────────────

describe("Level 4: Multi-Key Matrix", () => {
  // Q31: county + calendar_year — fires per county per year
  it("Q31: fire count by county and year (county + calendar_year)", async () => {
    const result = await query("data.oregon.gov", "fbwv-q84y", {
      select: "county, fireyear, count(*) as count",
      where: "fireyear >= '2020' AND county IS NOT NULL",
      group: "county, fireyear",
      order: "count DESC",
      limit: 10,
    });
    expect(result.results).toHaveLength(10);
    for (const row of result.results) {
      expect(row.county).toBeTruthy();
      expect(row.fireyear).toBeTruthy();
    }
  }, 15_000);

  // Q32: county + complaint_status — complaints by county and status
  it("Q32: TX complaints by county and determination (county + complaint_status)", async () => {
    const result = await query("data.texas.gov", "cxnx-7tf4", {
      select: "county, staffdetermination, count(*) as count",
      where: "county IS NOT NULL AND staffdetermination IS NOT NULL",
      group: "county, staffdetermination",
      order: "count DESC",
      limit: 10,
    });
    expect(result.results.length).toBeGreaterThan(0);
  }, 15_000);

  // Q33: agency + fiscal_year + expenditure_category — OR expenditure matrix
  it("Q33: OR expenditures by agency x year x category", async () => {
    const result = await query("data.oregon.gov", "y9g9-xsxs", {
      select: "agency_1, fiscal_year, expend_class_1, sum(expense) as total",
      where: "fiscal_year >= 2022 AND agency_1 IS NOT NULL AND expend_class_1 IS NOT NULL",
      group: "agency_1, fiscal_year, expend_class_1",
      order: "total DESC",
      limit: 10,
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const row of result.results) {
      expect(row.agency_1).toBeTruthy();
      expect(Number(row.total)).toBeGreaterThan(0);
    }
  }, 15_000);

  // Q34: Use correlation key tool to plan a cross-dataset query, then execute both sides
  it("Q34: tool-driven correlation — fire counties → voter data", async () => {
    // Step 1: Ask the tool what fire data correlates with by county
    const correlatable = parse(handleFindCorrelationKeys({
      datasetId: "fbwv-q84y", key: "county",
    }));
    // Verify voter registration is in the list
    const voterEntry = correlatable.keys[0].datasets.find(
      (d: { id: string }) => d.id === "8h6y-5uec"
    );
    expect(voterEntry).toBeDefined();
    expect(voterEntry.column).toBe("county");

    // Step 2: Query top fire counties
    const topFireCounties = await query("data.oregon.gov", "fbwv-q84y", {
      select: "county, count(*) as fire_count",
      group: "county",
      order: "fire_count DESC",
      limit: 3,
    });
    const countyNames = topFireCounties.results.map((r: { county: string }) => r.county);

    // Step 3: Query voter data for those same counties
    // Fire data is mixed case, voter data is uppercase — normalize with upper()
    const upperCounties = countyNames.map((c: string) => c.toUpperCase());
    const voterData = await query("data.oregon.gov", "8h6y-5uec", {
      select: "county, sum(sum_partycount) as total_voters",
      where: `county IN ('${upperCounties.join("','")}')`,
      group: "county",
      order: "total_voters DESC",
    });
    expect(voterData.results.length).toBeGreaterThan(0);
  }, 25_000);

  // Q35: city + date — complaints over time in Portland
  it("Q35: Portland complaints by month (city + date)", async () => {
    const result = await query("data.oregon.gov", "2ix7-8hwk", {
      select: "date_trunc_ym(date_open) as month, count(*) as count",
      where: "upper(city)='PORTLAND' AND date_open IS NOT NULL",
      group: "date_trunc_ym(date_open)",
      order: "month DESC",
      limit: 12,
    });
    expect(result.results.length).toBeGreaterThan(0);
  }, 15_000);

  // Q36: cross-state county + complaint_category matrix
  it("Q36: complaint categories by county — OR vs TX", async () => {
    const orComplaints = await query("data.oregon.gov", "2ix7-8hwk", {
      select: "business_type, count(*) as count",
      where: "business_type IS NOT NULL",
      group: "business_type",
      order: "count DESC",
      limit: 5,
    });
    const txComplaints = await query("data.texas.gov", "cxnx-7tf4", {
      select: "category, count(*) as count",
      where: "category IS NOT NULL",
      group: "category",
      order: "count DESC",
      limit: 5,
    });
    expect(orComplaints.results.length).toBeGreaterThan(0);
    expect(txComplaints.results.length).toBeGreaterThan(0);
  }, 20_000);

  // Q37: Full workflow — discover keys, pick datasets, query both, compare
  it("Q37: full workflow — discover + query cross-state by zip", async () => {
    // Step 1: What keys support cross-state joins?
    const crossState = parse(handleFindCorrelationKeys({ crossStateOnly: true }));
    const zipKey = crossState.keys.find((k: { key: string }) => k.key === "zip");
    expect(zipKey).toBeDefined();

    // Step 2: Pick OR businesses and CT businesses
    const orEntry = zipKey.datasets.find((d: { domain: string }) => d.domain === "data.oregon.gov");
    const ctEntry = zipKey.datasets.find((d: { domain: string }) => d.domain === "data.ct.gov");
    expect(orEntry).toBeDefined();
    expect(ctEntry).toBeDefined();

    // Step 3: Query top zips from each
    const orZips = await query(orEntry.domain, orEntry.id, {
      select: `${orEntry.column}, count(*) as count`,
      where: `${orEntry.column} IS NOT NULL`,
      group: orEntry.column,
      order: "count DESC",
      limit: 5,
    });
    const ctZips = await query(ctEntry.domain, ctEntry.id, {
      select: `${ctEntry.column}, count(*) as count`,
      where: `${ctEntry.column} IS NOT NULL`,
      group: ctEntry.column,
      order: "count DESC",
      limit: 5,
    });
    expect(orZips.results).toHaveLength(5);
    expect(ctZips.results).toHaveLength(5);
  }, 25_000);

  // Q38: naics + county — industry distribution by county in OR
  it("Q38: NAICS description by county (naics + county)", async () => {
    const result = await query("data.oregon.gov", "q9zj-c8r2", {
      select: "county_code, naics_description, count(*) as count",
      where: "naics_description IS NOT NULL AND county_code IS NOT NULL",
      group: "county_code, naics_description",
      order: "count DESC",
      limit: 10,
    });
    expect(result.results.length).toBeGreaterThan(0);
    for (const row of result.results) {
      expect(row.county_code).toBeTruthy();
      expect(row.naics_description).toBeTruthy();
    }
  }, 15_000);

  // Q39: Three-way Oregon correlation — fires → libraries → voters by county
  // Fire data uses mixed case ("Lane"), voter data uses uppercase ("LANE"), library uses mixed
  it("Q39: three-way county correlation — fires, libraries, voters", async () => {
    const fires = await query("data.oregon.gov", "fbwv-q84y", {
      select: "upper(county) as county, count(*) as fire_count",
      where: "upper(county)='LANE'",
      group: "upper(county)",
    });
    const libraries = await query("data.oregon.gov", "6x9d-idz4", {
      select: "upper(county) as county, count(*) as library_count",
      where: "upper(county)='LANE'",
      group: "upper(county)",
    });
    const voters = await query("data.oregon.gov", "8h6y-5uec", {
      select: "county, sum(sum_partycount) as total_voters",
      where: "county='LANE'",
      group: "county",
      limit: 1,
    });
    expect(fires.results).toHaveLength(1);
    expect(libraries.results).toHaveLength(1);
    expect(voters.results.length).toBeGreaterThanOrEqual(1);
    expect(Number(fires.results[0].fire_count)).toBeGreaterThan(0);
    expect(Number(libraries.results[0].library_count)).toBeGreaterThan(0);
  }, 25_000);

  // Q40: Four-state correlation — complaints by city across OR, WA, TX, NJ
  it("Q40: four-state complaint/business count by city", async () => {
    // Use the tool to get city key metadata
    const cityKey = parse(handleFindCorrelationKeys({ key: "city" }));
    expect(cityKey.keys[0].datasets.length).toBeGreaterThanOrEqual(9);

    // Query one dataset from each of 4 states using their actual column names
    const orResult = await query("data.oregon.gov", "2ix7-8hwk", {
      select: "city, count(*) as count",
      where: "city IS NOT NULL",
      group: "city",
      order: "count DESC",
      limit: 1,
    });
    const waResult = await query("data.wa.gov", "gpri-47xz", {
      select: "businesscity, count(*) as count",
      where: "businesscity IS NOT NULL",
      group: "businesscity",
      order: "count DESC",
      limit: 1,
    });
    const txResult = await query("data.texas.gov", "cxnx-7tf4", {
      select: "custcity, count(*) as count",
      where: "custcity IS NOT NULL",
      group: "custcity",
      order: "count DESC",
      limit: 1,
    });
    const njResult = await query("data.nj.gov", "tfhb-8beb", {
      select: "business_city, count(*) as count",
      where: "business_city IS NOT NULL",
      group: "business_city",
      order: "count DESC",
      limit: 1,
    });

    // Each state returns its top city
    expect(orResult.results).toHaveLength(1);
    expect(waResult.results).toHaveLength(1);
    expect(txResult.results).toHaveLength(1);
    expect(njResult.results).toHaveLength(1);

    // All should have positive counts
    expect(Number(orResult.results[0].count)).toBeGreaterThan(0);
    expect(Number(waResult.results[0].count)).toBeGreaterThan(0);
    expect(Number(txResult.results[0].count)).toBeGreaterThan(0);
    expect(Number(njResult.results[0].count)).toBeGreaterThan(0);
  }, 30_000);
});
