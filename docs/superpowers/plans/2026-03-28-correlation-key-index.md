# Correlation Key Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a correlation key registry (seed JSON + types + lookup module + MCP tool) that lets AI agents discover which datasets can be joined across portals before writing queries.

**Architecture:** A static JSON seed file defines 14 verified correlation keys across 6 Socrata portals. A TypeScript module loads and indexes the seed file, exposing lookup functions by key name, dataset ID, or domain. A new `find_correlation_keys` MCP tool surfaces this to agents.

**Tech Stack:** TypeScript, Zod (validation), Vitest (testing), MCP SDK (tool registration)

---

### File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/data/correlation-keys.json` | Seed file — all 14 keys, 6 domains, verified dataset entries |
| Create | `src/lib/correlation-keys.ts` | Load seed, expose typed lookup functions |
| Create | `src/tools/find-correlation-keys.ts` | MCP tool handler — wraps lookup module |
| Create | `tests/lib/correlation-keys.test.ts` | Unit tests for lookup module |
| Create | `tests/tools/find-correlation-keys.test.ts` | Unit tests for tool handler |
| Modify | `src/lib/types.ts` | Add correlation key TypeScript interfaces |
| Modify | `src/index.ts` | Register `find_correlation_keys` tool |

---

### Task 1: Add TypeScript Interfaces

**Files:**
- Modify: `src/lib/types.ts`
- Test: `tests/lib/types.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/types.test.ts`:

```typescript
import { CorrelationKeySeedSchema } from "../../src/lib/types.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/types.test.ts`
Expected: FAIL — `CorrelationKeySeedSchema` is not exported from types.ts

- [ ] **Step 3: Add types and Zod schemas to types.ts**

Append to the end of `src/lib/types.ts`:

```typescript
// --- Correlation Key Index Types ---

export const KeyTypeEnum = z.enum([
  "geographic",
  "temporal",
  "entity",
  "fiscal",
  "enforcement",
]);
export type KeyType = z.infer<typeof KeyTypeEnum>;

export const CorrelationDatasetEntrySchema = z.object({
  domain: z.string(),
  id: z.string().regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/),
  name: z.string(),
  column: z.string(),
  columnType: z.string(),
  columnNote: z.string().optional(),
});
export type CorrelationDatasetEntry = z.infer<typeof CorrelationDatasetEntrySchema>;

export const CorrelationKeySchema = z.object({
  key: z.string(),
  type: KeyTypeEnum,
  description: z.string(),
  crossStateJoin: z.boolean(),
  normalizations: z.array(z.string()),
  datasets: z.array(CorrelationDatasetEntrySchema),
});
export type CorrelationKey = z.infer<typeof CorrelationKeySchema>;

export const DomainEntrySchema = z.object({
  state: z.string().length(2),
  name: z.string(),
});
export type DomainEntry = z.infer<typeof DomainEntrySchema>;

export const CorrelationKeySeedSchema = z.object({
  version: z.string(),
  domains: z.record(z.string(), DomainEntrySchema),
  keys: z.array(CorrelationKeySchema),
});
export type CorrelationKeySeed = z.infer<typeof CorrelationKeySeedSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/types.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts tests/lib/types.test.ts
git commit -m "feat: add correlation key index Zod schemas and types"
```

---

### Task 2: Create the Seed JSON File

**Files:**
- Create: `src/data/correlation-keys.json`

- [ ] **Step 1: Create the seed file**

Create `src/data/correlation-keys.json` with the full verified dataset from the design spec. The file is large — here is the complete structure:

```json
{
  "version": "1.0",
  "domains": {
    "data.oregon.gov": { "state": "OR", "name": "Oregon Open Data" },
    "data.wa.gov": { "state": "WA", "name": "Washington Open Data" },
    "data.ny.gov": { "state": "NY", "name": "New York Open Data" },
    "data.ct.gov": { "state": "CT", "name": "Connecticut Open Data" },
    "data.texas.gov": { "state": "TX", "name": "Texas Open Data" },
    "data.nj.gov": { "state": "NJ", "name": "New Jersey Open Data" }
  },
  "keys": [
    {
      "key": "county",
      "type": "geographic",
      "description": "County name within a US state",
      "crossStateJoin": false,
      "normalizations": ["upper()", "trim whitespace", "strip ' County' suffix"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "fbwv-q84y", "name": "Fire Occurrence", "column": "county", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "6x9d-idz4", "name": "Library Directory", "column": "county", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "8h6y-5uec", "name": "Voter Registration", "column": "county", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "q9zj-c8r2", "name": "Workers' Comp Employers", "column": "county_code", "columnType": "text", "columnNote": "Code not name" },
        { "domain": "data.oregon.gov", "id": "g77e-6bhs", "name": "CCB Licenses", "column": "county_name", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "cu5x-ppiq", "name": "Long-Term Care Complaints", "column": "facility_county", "columnType": "text" },
        { "domain": "data.ct.gov", "id": "kf75-36tt", "name": "Public Libraries", "column": "county", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "2zpi-yjjs", "name": "Expenditures by County", "column": "county", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "cxnx-7tf4", "name": "PUC Complaints", "column": "county", "columnType": "text" },
        { "domain": "data.ny.gov", "id": "jshw-gkgu", "name": "Workers' Comp Claims", "column": "injured_in_county_name", "columnType": "text" }
      ]
    },
    {
      "key": "city",
      "type": "geographic",
      "description": "City name",
      "crossStateJoin": false,
      "normalizations": ["upper()", "trim whitespace"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "tckn-sxa6", "name": "Active Businesses", "column": "city", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "2ix7-8hwk", "name": "Consumer Complaints", "column": "city", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "6x9d-idz4", "name": "Library Directory", "column": "physical_city", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "cu5x-ppiq", "name": "Long-Term Care Complaints", "column": "facility_city", "columnType": "text" },
        { "domain": "data.wa.gov", "id": "gpri-47xz", "name": "Consumer Complaints", "column": "businesscity", "columnType": "text" },
        { "domain": "data.ct.gov", "id": "n7gp-d28j", "name": "Business Registry", "column": "billingcity", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "c4xz-httr", "name": "Workers' Comp Subscribers", "column": "insured_employer_city", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "cxnx-7tf4", "name": "PUC Complaints", "column": "custcity", "columnType": "text" },
        { "domain": "data.nj.gov", "id": "tfhb-8beb", "name": "SAVI Certified Businesses", "column": "business_city", "columnType": "text" }
      ]
    },
    {
      "key": "zip",
      "type": "geographic",
      "description": "US ZIP code (5-digit)",
      "crossStateJoin": true,
      "normalizations": ["truncate to 5 digits", "trim whitespace"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "tckn-sxa6", "name": "Active Businesses", "column": "zip", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "2ix7-8hwk", "name": "Consumer Complaints", "column": "zip", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "6x9d-idz4", "name": "Library Directory", "column": "physical_zip", "columnType": "text" },
        { "domain": "data.wa.gov", "id": "gpri-47xz", "name": "Consumer Complaints", "column": "businesszip", "columnType": "text" },
        { "domain": "data.ct.gov", "id": "n7gp-d28j", "name": "Business Registry", "column": "billingpostalcode", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "c4xz-httr", "name": "Workers' Comp Subscribers", "column": "insured_employer_zip", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "cxnx-7tf4", "name": "PUC Complaints", "column": "custzip", "columnType": "text" },
        { "domain": "data.nj.gov", "id": "tfhb-8beb", "name": "SAVI Certified Businesses", "column": "business_zip", "columnType": "text" }
      ]
    },
    {
      "key": "lat_long",
      "type": "geographic",
      "description": "Geographic coordinates (latitude/longitude or GeoJSON point)",
      "crossStateJoin": true,
      "normalizations": ["normalize to GeoJSON point format", "legacy location type uses {latitude, longitude}, modern point type uses GeoJSON"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "fbwv-q84y", "name": "Fire Occurrence", "column": "latlongdd", "columnType": "point" },
        { "domain": "data.oregon.gov", "id": "6x9d-idz4", "name": "Library Directory", "column": "geocodedaddress", "columnType": "point" },
        { "domain": "data.wa.gov", "id": "gpri-47xz", "name": "Consumer Complaints", "column": "geocode", "columnType": "location", "columnNote": "Legacy location type, not GeoJSON point" }
      ]
    },
    {
      "key": "fiscal_year",
      "type": "temporal",
      "description": "Fiscal year (boundaries differ by state: OR Jul-Jun, TX Sep-Aug, NY Apr-Mar, NJ Jul-Jun)",
      "crossStateJoin": true,
      "normalizations": ["cast to integer for comparison", "NJ and WA pivot years into column names — requires client-side unpivoting"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "4cmg-5yp4", "name": "Agency Salaries", "column": "fiscal_year", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "y9g9-xsxs", "name": "Agency Expenditures", "column": "fiscal_year", "columnType": "number" },
        { "domain": "data.nj.gov", "id": "apet-rp2i", "name": "Agency Expenditures", "column": "budget_fiscal_year", "columnType": "number" },
        { "domain": "data.nj.gov", "id": "whpi-savb", "name": "Multi-Year Expenditures", "column": "fy_2003", "columnType": "number", "columnNote": "Pivoted: years are column names (fy_2003 through fy_2024), not row values" },
        { "domain": "data.wa.gov", "id": "y3ds-rkew", "name": "Salaries 2010-2013", "column": "salary2010", "columnType": "number", "columnNote": "Pivoted: years are column names (salary2010 through salary2013), not row values" }
      ]
    },
    {
      "key": "calendar_year",
      "type": "temporal",
      "description": "Calendar year (cleanest cross-state temporal join)",
      "crossStateJoin": true,
      "normalizations": ["extract from calendar_date via date_extract_y()", "cast text year columns to integer", "calendar_date year columns stored as full timestamp e.g. 2020-01-01T00:00:00.000"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "p8ud-dzhp", "name": "Workers' Comp Claims", "column": "year", "columnType": "calendar_date", "columnNote": "Needs date_extract_y() — stored as full timestamp" },
        { "domain": "data.oregon.gov", "id": "fbwv-q84y", "name": "Fire Occurrence", "column": "fireyear", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "xc4e-hg3n", "name": "OSHA", "column": "year", "columnType": "number" },
        { "domain": "data.ct.gov", "id": "kf75-36tt", "name": "Public Libraries", "column": "fiscal_year", "columnType": "number", "columnNote": "CT library fiscal year aligns with calendar year" },
        { "domain": "data.ny.gov", "id": "jshw-gkgu", "name": "Workers' Comp Claims", "column": "accident_date", "columnType": "calendar_date", "columnNote": "Extract year via date_extract_y(accident_date)" }
      ]
    },
    {
      "key": "date",
      "type": "temporal",
      "description": "Full date (ISO 8601 calendar_date)",
      "crossStateJoin": true,
      "normalizations": ["use date_trunc_y() or date_trunc_ym() for aggregation", "use date_extract_y() for year grouping"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "fbwv-q84y", "name": "Fire Occurrence", "column": "ign_datetime", "columnType": "calendar_date" },
        { "domain": "data.oregon.gov", "id": "2ix7-8hwk", "name": "Consumer Complaints", "column": "date_open", "columnType": "calendar_date" },
        { "domain": "data.oregon.gov", "id": "cu5x-ppiq", "name": "Long-Term Care Complaints", "column": "date_opened", "columnType": "calendar_date" },
        { "domain": "data.ny.gov", "id": "jshw-gkgu", "name": "Workers' Comp Claims", "column": "accident_date", "columnType": "calendar_date" },
        { "domain": "data.texas.gov", "id": "cxnx-7tf4", "name": "PUC Complaints", "column": "datereceived", "columnType": "calendar_date" },
        { "domain": "data.texas.gov", "id": "c4xz-httr", "name": "Workers' Comp Subscribers", "column": "policy_effective_date", "columnType": "calendar_date" },
        { "domain": "data.nj.gov", "id": "apet-rp2i", "name": "Agency Expenditures", "column": "fy_through_date", "columnType": "calendar_date" }
      ]
    },
    {
      "key": "business_name",
      "type": "entity",
      "description": "Business or organization name (column name varies per dataset)",
      "crossStateJoin": false,
      "normalizations": ["upper()", "trim whitespace", "strip suffixes: LLC, INC, CORP, L.L.C.", "fuzzy match for DBA vs legal name"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "tckn-sxa6", "name": "Active Businesses", "column": "business_name", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "q9zj-c8r2", "name": "Workers' Comp Employers", "column": "legal_business_name", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "2ix7-8hwk", "name": "Consumer Complaints", "column": "respondent", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "g77e-6bhs", "name": "CCB Licenses", "column": "full_name", "columnType": "text" },
        { "domain": "data.ct.gov", "id": "n7gp-d28j", "name": "Business Registry", "column": "name", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "c4xz-httr", "name": "Workers' Comp Subscribers", "column": "insured_employer_name", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "cxnx-7tf4", "name": "PUC Complaints", "column": "company", "columnType": "text" },
        { "domain": "data.ny.gov", "id": "jshw-gkgu", "name": "Workers' Comp Claims", "column": "carrier_name", "columnType": "text", "columnNote": "This is the insurer, not the employer" },
        { "domain": "data.nj.gov", "id": "tfhb-8beb", "name": "SAVI Certified Businesses", "column": "business_name", "columnType": "text" }
      ]
    },
    {
      "key": "entity_type",
      "type": "entity",
      "description": "Business entity type (Corporation, LLC, Nonprofit, etc.)",
      "crossStateJoin": true,
      "normalizations": ["map state-specific values to canonical set", "NJ certification_type is SBE/MBE/WBE designations, not corporate form"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "tckn-sxa6", "name": "Active Businesses", "column": "entity_type", "columnType": "text" },
        { "domain": "data.ct.gov", "id": "n7gp-d28j", "name": "Business Registry", "column": "business_type", "columnType": "text" },
        { "domain": "data.nj.gov", "id": "tfhb-8beb", "name": "SAVI Certified Businesses", "column": "certification_type", "columnType": "text", "columnNote": "Certification class (SBE/MBE/WBE), not corporate form" }
      ]
    },
    {
      "key": "naics",
      "type": "entity",
      "description": "NAICS industry code (federal standard, cleanest cross-state industry key)",
      "crossStateJoin": true,
      "normalizations": ["extract numeric code only", "TX combines SIC and NAICS in one field", "CT has code + sub-code split", "hierarchical: 2-digit=sector, 4-digit=industry group, 6-digit=specific"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "q9zj-c8r2", "name": "Workers' Comp Employers", "column": "naics", "columnType": "text" },
        { "domain": "data.ct.gov", "id": "n7gp-d28j", "name": "Business Registry", "column": "naics_code", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "c4xz-httr", "name": "Workers' Comp Subscribers", "column": "sic_code_naics_code", "columnType": "text", "columnNote": "Combined SIC/NAICS field" },
        { "domain": "data.ny.gov", "id": "jshw-gkgu", "name": "Workers' Comp Claims", "column": "industry_code", "columnType": "text", "columnNote": "May be NAICS or OIICS — verify before joining" }
      ]
    },
    {
      "key": "agency",
      "type": "fiscal",
      "description": "State government agency name",
      "crossStateJoin": false,
      "normalizations": ["use text name columns, not numeric codes", "naming inconsistent even within a single state"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "4cmg-5yp4", "name": "Agency Salaries", "column": "agency_title", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "y9g9-xsxs", "name": "Agency Expenditures", "column": "agency_1", "columnType": "text" },
        { "domain": "data.nj.gov", "id": "apet-rp2i", "name": "Agency Expenditures", "column": "ibno_agency", "columnType": "text" },
        { "domain": "data.nj.gov", "id": "whpi-savb", "name": "Multi-Year Expenditures", "column": "ibno_agency", "columnType": "text" },
        { "domain": "data.wa.gov", "id": "y3ds-rkew", "name": "Salaries", "column": "agencytitle", "columnType": "text" }
      ]
    },
    {
      "key": "expenditure_category",
      "type": "fiscal",
      "description": "Budget/expenditure classification",
      "crossStateJoin": false,
      "normalizations": ["map to high-level canonical categories (personnel, contracts, capital)", "OR uses numeric codes with _1 suffix for labels"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "y9g9-xsxs", "name": "Agency Expenditures", "column": "expend_class_1", "columnType": "text" },
        { "domain": "data.nj.gov", "id": "apet-rp2i", "name": "Agency Expenditures", "column": "expenditure_category", "columnType": "text" },
        { "domain": "data.nj.gov", "id": "whpi-savb", "name": "Multi-Year Expenditures", "column": "expenditure_category", "columnType": "text" }
      ]
    },
    {
      "key": "complaint_status",
      "type": "enforcement",
      "description": "Status or disposition of a complaint/claim",
      "crossStateJoin": false,
      "normalizations": ["map to canonical set: open, closed, resolved, denied", "OR uses status, OR long-term care uses disposition, TX uses staffdetermination, NY uses current_claim_status"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "2ix7-8hwk", "name": "Consumer Complaints", "column": "status", "columnType": "text" },
        { "domain": "data.oregon.gov", "id": "cu5x-ppiq", "name": "Long-Term Care Complaints", "column": "disposition", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "cxnx-7tf4", "name": "PUC Complaints", "column": "staffdetermination", "columnType": "text" },
        { "domain": "data.ny.gov", "id": "jshw-gkgu", "name": "Workers' Comp Claims", "column": "current_claim_status", "columnType": "text" }
      ]
    },
    {
      "key": "complaint_category",
      "type": "enforcement",
      "description": "Type or category of complaint",
      "crossStateJoin": false,
      "normalizations": ["no standard taxonomy — useful for intra-state grouping only"],
      "datasets": [
        { "domain": "data.oregon.gov", "id": "2ix7-8hwk", "name": "Consumer Complaints", "column": "business_type", "columnType": "text" },
        { "domain": "data.texas.gov", "id": "cxnx-7tf4", "name": "PUC Complaints", "column": "category", "columnType": "text" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Verify seed file is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/data/correlation-keys.json', 'utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add src/data/correlation-keys.json
git commit -m "feat: add correlation key seed file with 14 keys across 6 portals"
```

---

### Task 3: Build the Lookup Module

**Files:**
- Create: `src/lib/correlation-keys.ts`
- Test: `tests/lib/correlation-keys.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/correlation-keys.test.ts`:

```typescript
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
      expect(ids).not.toContain("fbwv-q84y"); // excludes the source dataset
      expect(ids).toContain("6x9d-idz4"); // library directory
      expect(ids).toContain("8h6y-5uec"); // voter registration
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/correlation-keys.test.ts`
Expected: FAIL — `CorrelationKeyIndex` does not exist

- [ ] **Step 3: Implement the lookup module**

Create `src/lib/correlation-keys.ts`:

```typescript
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CorrelationKeySeedSchema,
  type CorrelationKeySeed,
  type CorrelationKey,
  type CorrelationDatasetEntry,
  type DomainEntry,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, "../data/correlation-keys.json");

export class CorrelationKeyIndex {
  private seed: CorrelationKeySeed;
  private keyMap: Map<string, CorrelationKey>;
  private datasetIndex: Map<string, CorrelationKey[]>;
  private domainIndex: Map<string, CorrelationKey[]>;

  constructor() {
    const raw = readFileSync(SEED_PATH, "utf8");
    this.seed = CorrelationKeySeedSchema.parse(JSON.parse(raw));
    this.keyMap = new Map();
    this.datasetIndex = new Map();
    this.domainIndex = new Map();

    for (const key of this.seed.keys) {
      this.keyMap.set(key.key, key);
      for (const ds of key.datasets) {
        // Index by dataset ID
        if (!this.datasetIndex.has(ds.id)) {
          this.datasetIndex.set(ds.id, []);
        }
        this.datasetIndex.get(ds.id)!.push(key);

        // Index by domain
        if (!this.domainIndex.has(ds.domain)) {
          this.domainIndex.set(ds.domain, []);
        }
        const domainKeys = this.domainIndex.get(ds.domain)!;
        if (!domainKeys.includes(key)) {
          domainKeys.push(key);
        }
      }
    }
  }

  /** Return all correlation keys. */
  listKeys(): CorrelationKey[] {
    return this.seed.keys;
  }

  /** Look up a single key by name. */
  getKey(keyName: string): CorrelationKey | undefined {
    return this.keyMap.get(keyName);
  }

  /** Return all correlation keys that include a given dataset ID. */
  getKeysForDataset(datasetId: string): CorrelationKey[] {
    return this.datasetIndex.get(datasetId) ?? [];
  }

  /** Return all correlation keys that include datasets from a given domain. */
  getKeysForDomain(domain: string): CorrelationKey[] {
    return this.domainIndex.get(domain) ?? [];
  }

  /** Return only keys viable for cross-state joins. */
  getCrossStateKeys(): CorrelationKey[] {
    return this.seed.keys.filter((k) => k.crossStateJoin);
  }

  /**
   * Given a source dataset ID and a key name, find all other dataset entries
   * that share that key (excluding the source dataset).
   */
  findCorrelatable(
    datasetId: string,
    keyName: string
  ): CorrelationDatasetEntry[] {
    const key = this.keyMap.get(keyName);
    if (!key) return [];
    const hasDataset = key.datasets.some((ds) => ds.id === datasetId);
    if (!hasDataset) return [];
    return key.datasets.filter((ds) => ds.id !== datasetId);
  }

  /** Return the domain registry. */
  getDomains(): Record<string, DomainEntry> {
    return this.seed.domains;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/correlation-keys.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/correlation-keys.ts tests/lib/correlation-keys.test.ts
git commit -m "feat: add correlation key lookup module with indexed queries"
```

---

### Task 4: Create the MCP Tool Handler

**Files:**
- Create: `src/tools/find-correlation-keys.ts`
- Test: `tests/tools/find-correlation-keys.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/find-correlation-keys.test.ts`:

```typescript
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
    // Should exclude the source dataset from the list
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/find-correlation-keys.test.ts`
Expected: FAIL — `handleFindCorrelationKeys` does not exist

- [ ] **Step 3: Implement the tool handler**

Create `src/tools/find-correlation-keys.ts`:

```typescript
import type { ToolResult, CorrelationKey } from "../lib/types.js";
import { CorrelationKeyIndex } from "../lib/correlation-keys.js";

const index = new CorrelationKeyIndex();

export function handleFindCorrelationKeys(params: {
  key?: string;
  datasetId?: string;
  domain?: string;
  crossStateOnly?: boolean;
}): ToolResult {
  // If a specific key is requested, look it up
  if (params.key) {
    const keyDef = index.getKey(params.key);
    if (!keyDef) {
      const available = index.listKeys().map((k) => k.key);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: true,
                code: "KEY_NOT_FOUND",
                message: `Unknown correlation key: "${params.key}"`,
                recoverable: true,
                suggestion: `Available keys: ${available.join(", ")}`,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    // If both key and datasetId, return correlatable datasets (excluding source)
    if (params.datasetId) {
      const correlatable = index.findCorrelatable(params.datasetId, params.key);
      const filtered = { ...keyDef, datasets: correlatable };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { keys: [filtered], domains: index.getDomains() },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { keys: [keyDef], domains: index.getDomains() },
            null,
            2
          ),
        },
      ],
    };
  }

  // Build the key list based on filters
  let keys: CorrelationKey[];

  if (params.datasetId) {
    keys = index.getKeysForDataset(params.datasetId);
  } else if (params.domain) {
    keys = index.getKeysForDomain(params.domain);
  } else if (params.crossStateOnly) {
    keys = index.getCrossStateKeys();
  } else {
    keys = index.listKeys();
  }

  // Apply crossStateOnly as a secondary filter
  if (params.crossStateOnly && !params.key) {
    keys = keys.filter((k) => k.crossStateJoin);
  }

  // If filtering by domain, only include dataset entries from that domain
  if (params.domain) {
    keys = keys.map((k) => ({
      ...k,
      datasets: k.datasets.filter((d) => d.domain === params.domain),
    }));
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ keys, domains: index.getDomains() }, null, 2),
      },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/find-correlation-keys.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/find-correlation-keys.ts tests/tools/find-correlation-keys.test.ts
git commit -m "feat: add find_correlation_keys tool handler"
```

---

### Task 5: Register the MCP Tool

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add the import and tool registration**

Add the import at the top of `src/index.ts` (after the existing tool imports):

```typescript
import { handleFindCorrelationKeys } from "./tools/find-correlation-keys.js";
```

Add the tool registration after the `validate_soql` registration block (before `async function main()`):

```typescript
// ── Correlation key discovery ──

server.registerTool(
  "find_correlation_keys",
  {
    title: "Find Correlation Keys",
    description:
      "Discover which datasets can be joined or compared across Socrata portals. " +
      "Returns correlation keys (county, zip, year, NAICS, etc.) with the exact column names " +
      "and types in each dataset, plus normalization hints for cross-dataset queries. " +
      "Use this before building multi-dataset analyses to find joinable columns.",
    inputSchema: {
      key: z.string().optional().describe(
        "Specific correlation key to look up (e.g., 'county', 'zip', 'naics', 'calendar_year')"
      ),
      datasetId: datasetIdSchema.optional().describe(
        "Find correlation keys for a specific dataset — what can it be joined with?"
      ),
      domain: domainSchema.optional().describe(
        "Filter to keys available on a specific portal"
      ),
      crossStateOnly: z.boolean().optional().describe(
        "If true, only return keys viable for cross-state comparisons (zip, NAICS, calendar_year, etc.)"
      ),
    },
  },
  async ({ key, datasetId, domain, crossStateOnly }) => {
    return handleFindCorrelationKeys({ key, datasetId, domain, crossStateOnly });
  }
);
```

- [ ] **Step 2: Verify the project builds**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: register find_correlation_keys MCP tool"
```

---

### Task 6: Validate Seed File Against Zod Schema

**Files:**
- Modify: `tests/lib/correlation-keys.test.ts`

- [ ] **Step 1: Add seed validation test**

Add this describe block to the existing `tests/lib/correlation-keys.test.ts`:

```typescript
import { CorrelationKeySeedSchema } from "../../src/lib/types.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("correlation-keys.json seed file", () => {
  const raw = readFileSync(
    resolve(__dirname, "../../src/data/correlation-keys.json"),
    "utf8"
  );
  const seed = JSON.parse(raw);

  it("passes Zod schema validation", () => {
    expect(() => CorrelationKeySeedSchema.parse(seed)).not.toThrow();
  });

  it("has version 1.0", () => {
    expect(seed.version).toBe("1.0");
  });

  it("has 6 domains", () => {
    expect(Object.keys(seed.domains)).toHaveLength(6);
  });

  it("has 14 keys", () => {
    expect(seed.keys).toHaveLength(14);
  });

  it("all dataset IDs are valid 4x4 format", () => {
    const idRegex = /^[a-z0-9]{4}-[a-z0-9]{4}$/;
    for (const key of seed.keys) {
      for (const ds of key.datasets) {
        expect(ds.id).toMatch(idRegex);
      }
    }
  });

  it("all dataset domains reference a known domain", () => {
    const knownDomains = new Set(Object.keys(seed.domains));
    for (const key of seed.keys) {
      for (const ds of key.datasets) {
        expect(knownDomains.has(ds.domain)).toBe(true);
      }
    }
  });

  it("has no duplicate dataset entries within a key", () => {
    for (const key of seed.keys) {
      const seen = new Set<string>();
      for (const ds of key.datasets) {
        const uniqueId = `${ds.domain}/${ds.id}/${ds.column}`;
        expect(seen.has(uniqueId)).toBe(false);
        seen.add(uniqueId);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/lib/correlation-keys.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/lib/correlation-keys.test.ts
git commit -m "test: add seed file integrity validation"
```

---

### Task 7: Full Build and Test Verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS — no regressions

- [ ] **Step 2: Build the project**

Run: `npx tsc`
Expected: Clean build, no errors

- [ ] **Step 3: Verify the tool shows up in MCP**

Run: `node dist/index.js` (will hang waiting for stdio — just verify it starts without errors, then Ctrl+C)
Expected: No startup errors

- [ ] **Step 4: Final commit if any cleanup needed**

Only if previous steps surfaced issues that needed fixing.
