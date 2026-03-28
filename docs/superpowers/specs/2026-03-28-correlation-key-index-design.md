# Correlation Key Index Design

## Overview

A structured registry of correlation keys that enables cross-dataset and cross-state data aggregation across Socrata open data portals. The index maps semantic join keys (like "county" or "business_name") to the actual column names, types, and normalization requirements in each dataset across six state portals.

## Goals

1. Enable AI agents to discover which datasets can be correlated before writing queries
2. Provide normalization hints so agents produce correct SoQL across heterogeneous schemas
3. Support both intra-state (e.g., OR fire data + OR business data by county) and cross-state (e.g., OR vs NY workers' comp claims by year) aggregation
4. Start with a curated seed file, allow runtime enrichment via Socrata catalog API

## Architecture

### Static Seed + Dynamic Enrichment

- **Seed file** (`src/data/correlation-keys.json`): Manually curated, checked into the repo. Contains verified correlation keys with exact column names, types, and normalization notes for known datasets across 6 portals.
- **Dynamic enrichment** (future): At startup or on demand, the server can probe the Socrata catalog API (`/api/views/{ID}.json`) to validate seed entries still exist and discover new datasets that match known key patterns.

The seed file is the source of truth. Dynamic discovery extends it but never overwrites curated entries.

### Seed File Schema

```json
{
  "version": "1.0",
  "domains": {
    "<domain>": {
      "state": "<2-letter code>",
      "name": "<human-readable portal name>"
    }
  },
  "keys": [
    {
      "key": "<semantic key name>",
      "type": "<geographic | temporal | entity | fiscal | enforcement>",
      "description": "<what this key represents>",
      "crossStateJoin": <boolean>,
      "normalizations": ["<hint for agents>"],
      "datasets": [
        {
          "domain": "<socrata domain>",
          "id": "<4x4 dataset ID>",
          "name": "<human-readable dataset name>",
          "column": "<exact fieldName in this dataset>",
          "columnType": "<socrata dataTypeName>",
          "columnNote": "<optional: why this column needs special handling>"
        }
      ]
    }
  ]
}
```

### Field Definitions

**Domain object:**
- `state`: US state 2-letter abbreviation
- `name`: Human-readable portal name

**Key object:**
- `key`: Canonical semantic name for the correlation key (e.g., `county`, `fiscal_year`, `business_name`)
- `type`: One of `geographic`, `temporal`, `entity`, `fiscal`, `enforcement`
- `description`: What this key represents, for agent context
- `crossStateJoin`: Whether this key produces meaningful results across state boundaries. `true` for nationally unique keys (zip, NAICS, calendar_year). `false` for state-scoped keys (county, agency)
- `normalizations`: Array of hints for agents on how to reconcile mismatched values across datasets

**Dataset entry:**
- `domain`: Socrata portal domain (e.g., `data.oregon.gov`)
- `id`: 4x4 dataset identifier
- `name`: Human-readable dataset name
- `column`: Exact `fieldName` as returned by the Socrata metadata API
- `columnType`: Exact `dataTypeName` (e.g., `text`, `number`, `calendar_date`, `point`, `location`)
- `columnNote`: Optional free-text explaining why this column needs special handling (e.g., "city not county — needs zip-to-county mapping")

## Portals In Scope

| Domain | State | Key Dataset Areas |
|--------|-------|-------------------|
| `data.oregon.gov` | OR | Businesses, salaries, expenditures, workers' comp, consumer complaints, fire, libraries, voter registration |
| `data.wa.gov` | WA | Salaries, consumer complaints |
| `data.ny.gov` | NY | Business filings, salaries, workers' comp claims |
| `data.ct.gov` | CT | Business registry, libraries |
| `data.texas.gov` | TX | Workers' comp subscribers, expenditures by county, PUC complaints, salaries |
| `data.nj.gov` | NJ | Payroll, expenditures, pensions, certified businesses (SAVI) |

## Verified Correlation Keys

All column names and types below were verified against the Socrata metadata API (`/api/views/{ID}.json`).

### Geographic Keys

#### `county`
- **Type:** geographic
- **Cross-state:** No (county names are not unique nationally)
- **Normalizations:** `upper()`, trim whitespace, strip " County" suffix
- **Datasets:**
  - OR `fbwv-q84y` (Fire Occurrence): `county` (text)
  - OR `6x9d-idz4` (Library Directory): `county` (text)
  - OR `8h6y-5uec` (Voter Registration): `county` (text)
  - OR `q9zj-c8r2` (Workers' Comp Employers): `county_code` (text) — note: code not name
  - OR `g77e-6bhs` (CCB Licenses): `county_name` (text), `county_code` (text)
  - OR `cu5x-ppiq` (Long-Term Care Complaints): `facility_county` (text)
  - CT `kf75-36tt` (Public Libraries): `county` (text)
  - TX `2zpi-yjjs` (Expenditures by County): `county` (text)
  - TX `cxnx-7tf4` (PUC Complaints): `county` (text)
  - NY `jshw-gkgu` (Workers' Comp Claims): `injured_in_county_name` (text)
  - **Absent in:** OR businesses (has city/zip but no county), NJ, WA complaints

#### `city`
- **Type:** geographic
- **Cross-state:** No
- **Normalizations:** `upper()`, trim whitespace — column names vary widely across portals
- **Datasets:**
  - OR `tckn-sxa6` (Active Businesses): `city` (text)
  - OR `2ix7-8hwk` (Consumer Complaints): `city` (text)
  - OR `6x9d-idz4` (Library Directory): `physical_city` (text)
  - OR `cu5x-ppiq` (Long-Term Care Complaints): `facility_city` (text)
  - WA `gpri-47xz` (Consumer Complaints): `businesscity` (text)
  - CT `n7gp-d28j` (Business Registry): `billingcity` (text)
  - TX `c4xz-httr` (Workers' Comp Subscribers): `insured_employer_city` (text)
  - TX `cxnx-7tf4` (PUC Complaints): `custcity` (text)
  - NJ `tfhb-8beb` (SAVI Certified Businesses): `business_city` (text)

#### `zip`
- **Type:** geographic
- **Cross-state:** Yes (5-digit ZIP codes are nationally unique)
- **Normalizations:** Truncate to 5 digits (some datasets include ZIP+4), trim whitespace
- **Datasets:**
  - OR `tckn-sxa6` (Active Businesses): `zip` (text)
  - OR `2ix7-8hwk` (Consumer Complaints): `zip` (text/number)
  - OR `6x9d-idz4` (Library Directory): `physical_zip` (text)
  - WA `gpri-47xz` (Consumer Complaints): `businesszip` (text)
  - CT `n7gp-d28j` (Business Registry): `billingpostalcode` (text)
  - TX `c4xz-httr` (Workers' Comp Subscribers): `insured_employer_zip` (text)
  - TX `cxnx-7tf4` (PUC Complaints): `custzip` (text)
  - NJ `tfhb-8beb` (SAVI Certified Businesses): `business_zip` (text)

#### `lat_long`
- **Type:** geographic
- **Cross-state:** Yes (global coordinates)
- **Normalizations:** Normalize to GeoJSON point format; legacy `location` type has `{"latitude": "...", "longitude": "..."}`, modern `point` type uses `{"type": "Point", "coordinates": [lng, lat]}`
- **Datasets:**
  - OR `fbwv-q84y` (Fire Occurrence): `lat_dd` (number), `long_dd` (number), `latlongdd` (point)
  - OR `6x9d-idz4` (Library Directory): `geocodedaddress` (point)
  - WA `gpri-47xz` (Consumer Complaints): `geocode` (location — legacy type)

### Temporal Keys

#### `fiscal_year`
- **Type:** temporal
- **Cross-state:** Yes, but fiscal year boundaries differ by state (OR: Jul–Jun, TX: Sep–Aug, NY: Apr–Mar, NJ: Jul–Jun)
- **Normalizations:** Cast to integer for comparison; note that NJ and WA pivot years into column names (`fy_2003`, `salary2010`) instead of row values — these require unpivoting client-side
- **Datasets:**
  - OR `4cmg-5yp4` (Agency Salaries): `fiscal_year` (text)
  - OR `y9g9-xsxs` (Agency Expenditures): `fiscal_year` (number)
  - NJ `apet-rp2i` (Agency Expenditures): `budget_fiscal_year` (number)
  - NJ `whpi-savb` (Multi-Year Expenditures): pivoted as `fy_2003`–`fy_2024` column names (number) — **not row-based**
  - WA `y3ds-rkew` (Salaries 2010–2013): pivoted as `salary2010`–`salary2013` column names (number) — **not row-based**

#### `calendar_year`
- **Type:** temporal
- **Cross-state:** Yes (cleanest temporal join — no fiscal year boundary differences)
- **Normalizations:** Extract from `calendar_date` columns via `date_extract_y()`. Cast `text` year columns to integer. Handle `calendar_date` type `year` columns (stored as full timestamp, e.g., `2020-01-01T00:00:00.000`)
- **Datasets:**
  - OR `p8ud-dzhp` (Workers' Comp Claims): `year` (calendar_date — needs `date_extract_y()`)
  - OR `fbwv-q84y` (Fire Occurrence): `fireyear` (text)
  - OR `xc4e-hg3n` (OSHA): `year` (number)
  - CT `kf75-36tt` (Public Libraries): `fiscal_year` (number — CT library fiscal year aligns with calendar year)
  - NY `jshw-gkgu` (Workers' Comp Claims): extract from `accident_date` (calendar_date)

#### `date`
- **Type:** temporal
- **Cross-state:** Yes
- **Normalizations:** All stored as ISO 8601 `calendar_date`. Use `date_trunc_y()` or `date_trunc_ym()` for aggregation. Use `date_extract_y()` for year grouping.
- **Datasets:**
  - OR `fbwv-q84y` (Fire Occurrence): `ign_datetime` (calendar_date)
  - OR `2ix7-8hwk` (Consumer Complaints): `date_open`, `date_closed` (calendar_date)
  - OR `cu5x-ppiq` (Long-Term Care Complaints): `date_opened`, `date_closed` (calendar_date)
  - NY `jshw-gkgu` (Workers' Comp Claims): `accident_date`, `assembly_date`, `c2_date`, `c3_date` (calendar_date)
  - TX `cxnx-7tf4` (PUC Complaints): `datereceived`, `dateclosed` (calendar_date)
  - TX `c4xz-httr` (Workers' Comp Subscribers): `policy_effective_date`, `policy_expiration_date` (calendar_date)
  - NJ `apet-rp2i` (Agency Expenditures): `fy_through_date` (calendar_date)

### Entity Keys

#### `business_name`
- **Type:** entity
- **Cross-state:** Fuzzy (same business may be registered differently in each state)
- **Normalizations:** `upper()`, trim whitespace, strip common suffixes ("LLC", "INC", "CORP", "L.L.C."), fuzzy match for DBA vs legal name. Column name varies in every dataset.
- **Datasets:**
  - OR `tckn-sxa6` (Active Businesses): `business_name` (text)
  - OR `q9zj-c8r2` (Workers' Comp Employers): `legal_business_name` (text), also `dba_name` (text)
  - OR `2ix7-8hwk` (Consumer Complaints): `respondent` (text)
  - OR `g77e-6bhs` (CCB Licenses): `full_name` (text)
  - CT `n7gp-d28j` (Business Registry): `name` (text)
  - TX `c4xz-httr` (Workers' Comp Subscribers): `insured_employer_name` (text)
  - TX `cxnx-7tf4` (PUC Complaints): `company` (text)
  - NY `jshw-gkgu` (Workers' Comp Claims): `carrier_name` (text) — this is the insurer, not the employer
  - NJ `tfhb-8beb` (SAVI Certified Businesses): `business_name` (text)

#### `entity_type`
- **Type:** entity
- **Cross-state:** Yes, with value mapping (Corporation, LLC, Nonprofit, etc. — terminology varies)
- **Normalizations:** Map state-specific values to canonical set. OR uses `entity_type`, CT uses `business_type`, NJ uses `certification_type` (different semantics — SBE/MBE/WBE designations, not corporate form)
- **Datasets:**
  - OR `tckn-sxa6` (Active Businesses): `entity_type` (text)
  - CT `n7gp-d28j` (Business Registry): `business_type` (text)
  - NJ `tfhb-8beb` (SAVI Certified Businesses): `certification_type` (text) — note: this is certification class, not corporate form

#### `naics`
- **Type:** entity
- **Cross-state:** Yes (federal NAICS standard — cleanest cross-state industry key)
- **Normalizations:** Extract numeric code only. TX combines SIC and NAICS in one field. CT has code + sub-code split. Codes are hierarchical: 2-digit = sector, 4-digit = industry group, 6-digit = specific industry.
- **Datasets:**
  - OR `q9zj-c8r2` (Workers' Comp Employers): `naics` (text), `naics_description` (text)
  - CT `n7gp-d28j` (Business Registry): `naics_code` (text), `naics_sub_code` (text)
  - TX `c4xz-httr` (Workers' Comp Subscribers): `sic_code_naics_code` (text) — combined field
  - NY `jshw-gkgu` (Workers' Comp Claims): `industry_code` (text), `industry_desc` (text) — verify if NAICS or OIICS

### Fiscal Keys

#### `agency`
- **Type:** fiscal
- **Cross-state:** No (state-specific agency structures)
- **Normalizations:** Use text name columns, not numeric codes. Column naming is inconsistent even within a single state.
- **Datasets:**
  - OR `4cmg-5yp4` (Agency Salaries): `agency` (text — code), `agency_title` (text — name)
  - OR `y9g9-xsxs` (Agency Expenditures): `agency` (number — code), `agency_1` (text — name)
  - NJ `apet-rp2i` (Agency Expenditures): `ibno_agency` (text)
  - NJ `whpi-savb` (Multi-Year Expenditures): `ibno_agency` (text)
  - WA `y3ds-rkew` (Salaries): `agency` (number), `agencytitle` (text)

#### `expenditure_category`
- **Type:** fiscal
- **Cross-state:** Fuzzy (budget classification systems differ, but high-level categories like personnel/contracts/capital are similar)
- **Normalizations:** Map to high-level canonical categories. OR uses numeric codes with `_1` suffix for labels.
- **Datasets:**
  - OR `y9g9-xsxs` (Agency Expenditures): `expend_class` (number), `expend_class_1` (text), also `budget_class` (number), `budget_class_1` (text)
  - NJ `apet-rp2i` (Agency Expenditures): `expenditure_category` (text), `funding_category` (text)
  - NJ `whpi-savb` (Multi-Year Expenditures): `expenditure_category` (text), `funding_category` (text)

### Enforcement Keys

#### `complaint_status`
- **Type:** enforcement
- **Cross-state:** Fuzzy (open/closed/resolved semantics are similar but values differ)
- **Normalizations:** Map to canonical set: `open`, `closed`, `resolved`, `denied`. Terminology varies: OR uses `status`, OR long-term care uses `disposition`, TX uses `staffdetermination`, NY uses `current_claim_status`.
- **Datasets:**
  - OR `2ix7-8hwk` (Consumer Complaints): `status` (text)
  - OR `cu5x-ppiq` (Long-Term Care Complaints): `disposition` (text)
  - TX `cxnx-7tf4` (PUC Complaints): `staffdetermination` (text)
  - NY `jshw-gkgu` (Workers' Comp Claims): `current_claim_status` (text)

#### `complaint_category`
- **Type:** enforcement
- **Cross-state:** Fuzzy (complaint type taxonomies are state-specific)
- **Normalizations:** No standard taxonomy. Useful for intra-state grouping, less useful cross-state.
- **Datasets:**
  - OR `2ix7-8hwk` (Consumer Complaints): `business_type` (text)
  - TX `cxnx-7tf4` (PUC Complaints): `category` (text), `categorydesc` (text), `complainttype` (text)

## Key Design Observations

### Type Inconsistencies Within Oregon
Even within a single state portal, the same semantic concept is stored with different types:
- `fiscal_year`: `text` in salaries, `number` in expenditures
- `year`: `calendar_date` in workers' comp, `number` in OSHA, `text` in fire data
- `agency`: `text` in salaries, `number` in expenditures

The seed file captures `columnType` per dataset entry so agents can generate correct SoQL.

### Column Name Heterogeneity
Business name appears as 7 different column names across the verified datasets: `business_name`, `legal_business_name`, `respondent`, `full_name`, `name`, `insured_employer_name`, `company`. The `column` field in each dataset entry is the exact fieldName — agents must look it up per dataset, not assume a standard name.

### Pivoted vs Row-Based Temporal Data
NJ multi-year expenditures and WA salaries pivot years into column names (`fy_2003`, `salary2010`) instead of storing year as a row value. These cannot be queried with `$where=fiscal_year>2020` — they require selecting specific columns or client-side unpivoting. The `columnNote` field flags these cases.

### Cross-State Join Viability
The most reliable cross-state keys are:
1. **`zip`** — nationally unique, present in most business/complaint datasets
2. **`naics`** — federal standard industry codes, present in workers' comp and business registry datasets
3. **`calendar_year`** — universal temporal key (unlike fiscal_year which has different boundaries per state)

## Dynamic Enrichment (Future)

The seed file covers datasets we've manually verified. For dynamic discovery:

1. **Validation**: On startup, probe `/api/views/{ID}.json` for each seed dataset entry to confirm the column still exists with the expected type. Flag stale entries.
2. **Discovery**: Query the Socrata catalog API across known domains to find new datasets. Match column names against known key patterns (e.g., any dataset with a `county` text column is a candidate for the `county` key).
3. **Candidate promotion**: New discoveries are returned as suggestions, not automatically added to the seed. A human reviews and promotes them.

This is out of scope for the initial implementation.
