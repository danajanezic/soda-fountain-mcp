# Oregon Open Data - SODA API Research

## Overview

Oregon's open data portal at `data.oregon.gov` runs on the Socrata platform and exposes **1,463 total assets** (494 of which are actual datasets, the rest are filters, maps, calendars, stories, and external links). All datasets are queryable via the SODA (Socrata Open Data API).

---

## SODA API Technical Reference

### API Versions

| Version | Endpoint Pattern | Status |
|---------|-----------------|--------|
| **3.0** | `/api/v3/views/{ID}/query.json` | Latest (2025) |
| **2.1** | `/resource/{ID}.json` | Legacy, widely used |
| **2.0** | `/resource/{ID}.json` | Legacy |

**For Oregon's portal**, the v2.1 endpoints work and are the simplest:
```
https://data.oregon.gov/resource/{DATASET_ID}.json
```

### Authentication & App Tokens

| Method | Header/Param | Version |
|--------|-------------|---------|
| HTTP Header (preferred) | `X-App-Token: YOUR_TOKEN` | 3.0, 2.x |
| Query parameter | `$$app_token=YOUR_TOKEN` | 2.1, 2.0 |

**Rate limits:**
- Without token: throttled by IP, shared pool
- With token: each app gets its own pool, no throttling unless abusive
- Throttled responses return HTTP `429`
- Register tokens at your Socrata profile page

**No token is required for basic read access** - it just has lower rate limits.

### Response Formats

Append the format extension to the resource URL:
- `.json` - JSON (default)
- `.csv` - CSV
- `.geojson` - GeoJSON
- `.xml` - RDF-XML

Example: `https://data.oregon.gov/resource/tckn-sxa6.csv`

### HTTP Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 202 | Processing (retry for 200) |
| 400 | Bad request (malformed query) |
| 401 | Authentication failed |
| 403 | Forbidden (private dataset) |
| 404 | Dataset not found |
| 429 | Rate limited |
| 500 | Server error (include `X-Socrata-RequestId` in support requests) |

Error responses return JSON with `code`, `error`, `message`, `status`, `data`, and `source` fields.

---

## SoQL (Socrata Query Language) Reference

SoQL is SQL-like and passed as query parameters on GET requests.

### Query Parameters

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `$select` | Choose columns, aliases, expressions | `$select=city, count(*) AS total` |
| `$where` | Filter rows with boolean expressions | `$where=city='PORTLAND' AND amount > 1000` |
| `$order` | Sort results (ASC default, DESC) | `$order=amount DESC` |
| `$group` | Group for aggregation | `$group=city` |
| `$having` | Filter aggregated results | `$having=count(*) > 100` |
| `$limit` | Max rows returned (default: 1000) | `$limit=5000` |
| `$offset` | Skip N rows for pagination | `$offset=1000` |
| `$q` | Full-text search across all text fields | `$q=coffee` |

### $where Operators

| Operator | Example |
|----------|---------|
| `=`, `!=`, `>`, `<`, `>=`, `<=` | `amount > 50000` |
| `AND`, `OR`, `NOT` | `city='SALEM' AND state='OR'` |
| `IS NULL`, `IS NOT NULL` | `phone IS NOT NULL` |
| `LIKE` | `business_name LIKE '%COFFEE%'` |
| `NOT LIKE` | `business_name NOT LIKE '%LLC%'` |
| `IN(...)` | `city IN('PORTLAND','SALEM','EUGENE')` |
| `NOT IN(...)` | `entity_type NOT IN('ASSUMED BUSINESS NAME')` |
| `BETWEEN ... AND ...` | `amount BETWEEN 1000 AND 5000` |
| `NOT BETWEEN ... AND ...` | inverse of above |
| `starts_with(field, 'prefix')` | `starts_with(business_name, 'OREGON')` |
| `( ... )` | grouping for order of operations |

### Aggregation Functions

| Function | Description | Version |
|----------|-------------|---------|
| `count(*)` | Count records | 2.0+ |
| `sum(col)` | Sum numeric values | 2.1+ |
| `avg(col)` | Average | 2.1+ |
| `min(col)` | Minimum | 2.1+ |
| `max(col)` | Maximum | 2.1+ |
| `stddev_pop(col)` | Population standard deviation | 2.1+ |
| `stddev_samp(col)` | Sample standard deviation | 2.1+ |
| `regr_slope(y, x)` | Linear regression slope | 2.1+ |
| `regr_intercept(y, x)` | Linear regression intercept | 2.1+ |
| `regr_r2(y, x)` | R-squared | 2.1+ |

### String Functions

| Function | Description |
|----------|-------------|
| `upper(col)` | Uppercase |
| `lower(col)` | Lowercase |
| `unaccent(col)` | Remove diacritical marks |
| `starts_with(col, 'prefix')` | Prefix match |
| `LIKE '...'` | Substring search (use `%` wildcard) |
| `NOT LIKE '...'` | Negative substring search |

### Date/Time Functions

| Function | Returns |
|----------|---------|
| `date_extract_y(col)` | Year as integer |
| `date_extract_m(col)` | Month (1-12) |
| `date_extract_d(col)` | Day of month |
| `date_extract_dow(col)` | Day of week (0-6) |
| `date_extract_woy(col)` | Week of year (0-51) |
| `date_extract_hh(col)` | Hour (0-23) |
| `date_extract_mm(col)` | Minute |
| `date_extract_ss(col)` | Second |
| `date_trunc_y(col)` | Truncate to year |
| `date_trunc_ym(col)` | Truncate to year/month |
| `date_trunc_ymd(col)` | Truncate to year/month/day |

### Geospatial Functions

| Function | Description |
|----------|-------------|
| `within_box(col, nwLat, nwLon, seLat, seLon)` | Rows within bounding box |
| `within_circle(col, lat, lon, radiusMeters)` | Rows within circle |
| `within_polygon(col, 'MULTIPOLYGON(...)')` | Rows within polygon |
| `distance_in_meters(point1, point2)` | Distance between two points |
| `intersects(geo1, geo2)` | Geometry intersection test |
| `convex_hull(col)` | Minimum convex geometry enclosing all |
| `extent(col)` | Bounding box of geometry set |
| `num_points(col)` | Vertex count |
| `simplify(col, tolerance)` | Reduce vertices |
| `simplify_preserve_topology(col, tolerance)` | Reduce vertices preserving topology |

### Other Functions/Keywords

| Function | Description |
|----------|-------------|
| `greatest(a, b, ...)` | Largest value (ignores NULLs) |
| `least(a, b, ...)` | Smallest value (ignores NULLs) |
| `ln(col)` | Natural logarithm |
| `DISTINCT` | Deduplicate results |
| `CASE ... WHEN ... THEN ... END` | Conditional expressions |

### Pagination

- Default `$limit`: **1,000** rows
- Max `$limit` (v2.0): **50,000** rows
- Max `$limit` (v2.1/3.0): **no hard max** (but HTTP timeouts apply)
- **Always use `$order=:id`** (or another column) when paging to ensure stable ordering
- Pattern: `$limit=1000&$offset=0`, then `$offset=1000`, `$offset=2000`, etc.

### Data Types

| Type | JSON representation | Notes |
|------|-------------------|-------|
| `text` | `"string"` | |
| `number` | `"123.45"` (string in JSON) | |
| `calendar_date` | `"2024-01-15T00:00:00.000"` | ISO 8601 |
| `checkbox` | `true`/`false` | Boolean |
| `url` | `{"url": "http://..."}` | Object with url field |
| `location` | `{"latitude": "45.5", "longitude": "-122.6"}` | Legacy location type |
| `point` | `{"type": "Point", "coordinates": [-122.6, 45.5]}` | GeoJSON |
| `line` | GeoJSON LineString | |
| `multiline` | GeoJSON MultiLineString | |
| `polygon` | GeoJSON Polygon | |
| `multipolygon` | GeoJSON MultiPolygon | |
| `multipoint` | GeoJSON MultiPoint | |

---

## Discovery APIs

### Catalog Search API

**Base URL:** `https://api.us.socrata.com/api/catalog/v1`

| Parameter | Description | Example |
|-----------|-------------|---------|
| `domains` | Filter by portal domain | `domains=data.oregon.gov` |
| `limit` | Results per page (max 100) | `limit=100` |
| `offset` | Pagination offset | `offset=100` |
| `only` | Filter by asset type | `only=datasets` |
| `categories` | Filter by category | `categories=Business` |
| `q` | Full-text search | `q=fire` |

**Category endpoint:** `https://api.us.socrata.com/api/catalog/v1/domain_categories?domains=data.oregon.gov`

### Dataset Metadata API

Get full metadata including column schemas:
```
https://data.oregon.gov/api/views/{DATASET_ID}.json
```

Returns: name, description, category, tags, columns (with fieldName, dataTypeName, name), and more.

---

## Oregon Data Catalog - Categories

| Category | Dataset Count |
|----------|:------------:|
| Revenue & Expense | 126 |
| Health & Human Services | 114 |
| Administrative | 110 |
| Natural Resources | 67 |
| Public Safety | 64 |
| Business / business | 62 + 57 |
| education / Education | 24 + 5 |
| Transportation | 14 |
| Recreation | 5 |
| **Total** | **648** |

Note: Some categories have inconsistent capitalization (e.g., "Business" vs "business").

---

## Key Oregon Datasets (with schemas)

### Business

#### Active Businesses - ALL (`tckn-sxa6`)
All active businesses registered with Oregon Secretary of State. Updated weekly.
| Column | Type |
|--------|------|
| registry_number | text |
| business_name | text |
| entity_type | text |
| registry_date | calendar_date |
| associated_name_type | text |
| first_name | text |
| middle_name | text |
| last_name | text |
| suffix | text |
| not_of_record_entity | text |
| entity_of_record_reg_number | number |
| entity_of_record_name | text |
| address | text |
| address_continued | text |
| city | text |
| state | text |
| zip | text |
| jurisdiction | text |
| business_details | url |

#### Active Trademark Registrations (`ny3n-dx3v`)
Active trademarks on SOS Corporation Division records. Monthly.
| Column | Type |
|--------|------|
| registration_number | text |
| trademark_description | text |
| registration_date | calendar_date |
| correspondent_name | text |
| address1, address2 | text |
| city, state, zip | text |
| image_link | url |

#### New Businesses Registered Last Month (`esjy-u4fc`)
Monthly new business registrations.
| Column | Type |
|--------|------|
| business_name | text |
| entity_type | text |
| registry_date | calendar_date |
| address, city, state, zip | text |
| registry_number | text |
| associated_name_type | text |
| first_name, middle_name, last_name, suffix | text |

#### Active Nonprofit Corporations (`8kyv-b2kw`)
Nonprofits active as of first working day of month. Monthly.
| Column | Type |
|--------|------|
| business_name | text |
| nonprofit_type | text |
| entity_type | text |
| registry_date | calendar_date |
| address, city, state, zip | text |
| registry_number | text |

#### Active Benefit Companies (`baig-8b9x`)
Corporations/LLCs designated as benefit companies. Weekly.

#### Active Notaries (`j2pk-zk6z`)
Current active notaries. Daily.
| Column | Type |
|--------|------|
| first_name, last_name, middle_name | text |
| city, state, zip | text |
| commission_number | text |
| effective_date, expiration_date | calendar_date |

#### CCB Active Licenses (`g77e-6bhs`)
Contractors legally licensed to work in Oregon.
| Column | Type |
|--------|------|
| license_number | text |
| license_type | text |
| county_code, county_name | text |
| lic_exp_date | text |
| orig_regis_date | text |
| bond_company, bond_amount, bond_exp_date | text |
| ins_company, ins_amount, ins_exp_date | text |
| full_name | text |
| address, city, state, zip_code | text |
| phone_number, fax_number | text |
| rmi_name, exempt_text, endorsement_text | text |

#### Oregon Active Workers' Comp Employer Database (`q9zj-c8r2`)
Active employers with workers' comp insurance. Monthly.
| Column | Type |
|--------|------|
| legal_business_name, dba_name | text |
| employer_number | text |
| naics, naics_description | text |
| insurer_name, insurer_num | text |
| insured_status, insured_status_date | text |
| employees_range | text |
| ppb_address_1, ppb_city, ppb_state, ppb_zip | text |
| county_code | text |
| liability_begin_date, liability_end_date | text |

#### Workers' Compensation Claims Data (`p8ud-dzhp`)
Annual aggregate claims statistics since 1968.
| Column | Type |
|--------|------|
| year | calendar_date |
| subject_employers, subject_employees | number |
| accepted_disabling_claims | number |
| est_total_accepted_claims | number |
| denied_claims | number |
| fatality_claims | number |
| rate_accepted_disabling_claims (per 100 employees) | number |

#### Active Businesses - County Data (`6g49-bcrm`)
Active businesses organized by county.

#### UCC List of Filings Entered Last Month (`snfi-f79b`)
New UCC filings. Monthly.

#### UCC Secured Parties List (`2kf7-zaud`)
All current secured parties.

### Revenue & Expense

#### Salaries of State Agencies - Multi-Year Report (`4cmg-5yp4`)
Multi-year state agency salary data. Annual.
| Column | Type |
|--------|------|
| fiscal_year | text |
| agency_title | text |
| classification | text |
| annual_salary | number |
| full_part_time | text |
| service_type | text |
| agency | text |

#### Agency Expenditures - Multi-Year Report (`y9g9-xsxs`)
State agency expenditure data across fiscal years.
| Column | Type |
|--------|------|
| fiscal_year | number |
| agency, agency_1 | number, text |
| budget_class, budget_class_1 | number, text |
| expend_class, expend_class_1 | number, text |
| vendor | text |
| expense | number |
| vendor_st | text |

#### Lottery Contracts - Multi-Year Report (`rkhh-35im`)
Lottery purchase orders and contracts.

#### Lottery Expenditures - Multi-Year Report (`anxj-teqh`)
Lottery expenditure data.

#### Salaries of Lottery Employees (`a4i6-ntr6`)
Lottery employee salary data.

#### Special Public Works Fund (`a9gn-zyub`)
Loans/grants FY 2019-2025 for economic development.

#### Solar Plus Storage Rebate (`fbqx-su36`)
ODOE solar rebate program data.

#### Budgeted Revenue (`mwsa-rpk9`)
State budgeted revenue data.

#### ODOT Highway Contracts (`fdus-r2ei`)
Highway contract data across years.

#### Education Service District Revenue (`acp7-jb3d`)
Audited ESD revenues by school year.

### Public Safety

#### Oregon Consumer Complaints (`2ix7-8hwk`)
Consumer complaints registered with DOJ (2017-2019).
| Column | Type |
|--------|------|
| reference_no_ | text |
| status | text |
| date_open, date_closed | calendar_date |
| respondent | text |
| address_1, address_2, city, state, zip | text/number |
| business_type | text |
| complaint_description | text |
| closing_description | text |
| location_by_zip | location |

#### Foreclosure Avoidance Affidavits (multiple years)
- 2013: `buaq-t3q5`, `v9r8-z5zh`
- 2014: `tzsg-pkib`
- 2015: `rjb8-qkpa`
- 2016: `ach8-dmse`
- 2017: `mjgc-qsfr`
- 2018: `vjb2-zaud`
- 2019: `d5tf-g3yw`
- 2020: `sxkc-xrsn`
- 2021: `c43c-26hr`
- 2022: `mcfd-xxua`
- 2023: `4yri-t4vu`

### Natural Resources

#### ODF Fire Occurrence Data 2000-2022 (`fbwv-q84y`)
Wildfire statistical data with locations and causes.
| Column | Type |
|--------|------|
| serial | text |
| firecategory | text |
| fireyear | text |
| districtname, unitname | text |
| firename | text |
| size_class | text |
| esttotalacres | number |
| protected_acres | number |
| humanorlightning | text |
| generalcause, specificcause | text |
| lat_dd, long_dd | number |
| latlongdd | point |
| county | text |
| ign_datetime | calendar_date |
| control_datetime | calendar_date |

#### Cannabis Pesticide Guide (`8xsj-gz6v`, `crm6-xdta`, `b8ki-p9ef`)
Pesticide products for cannabis growers.

#### Yearly Pond Values (`qvyp-cz82`)
Log price information (delivered to mill).

#### Oregon Listed and Candidate Plants (`8s3k-ygh2`)
Complete list of listed/candidate plant species.

#### DEQ Public Records Requests (`r59j-htxm`)
DEQ public records request data.

### Administrative

#### Voter Registration Data (`8h6y-5uec`)
Post-redistricting voter registration snapshot. Monthly.
| Column | Type |
|--------|------|
| county | text |
| party | text |
| sum_partycount | number |
| date | calendar_date |
| cong_code, cong_desc | text |
| sr_code, sr_desc (Senate) | text |
| ss_code, ss_desc (House) | text |

#### Voter Registration (Pre-Redistricting) (`6a4f-ecbi`)
Pre-October 2021 voter registration data.

#### Voting Districts by Precinct (`r7vb-b9k4`)
Oregon voting districts mapped to precincts.

#### Oregon Elections Calendar (`i8qc-cakg`)
Important election dates and deadlines.

#### Bills Signed by Governor (multiple datasets)
- Kitzhaber 2011: `4aug-3v37`
- Kitzhaber 2012: `bmea-5dun`
- Kitzhaber 2013: `xbn8-g7iv`
- Kitzhaber 2014: `murb-ru5f`
- Brown 2015: `kiyy-dbi3`
- Brown 2016: `3ndr-ntjb`
- Brown 2017: `55zx-nnaz`
- Brown 2018: `gqej-3969`
- Brown 2019: `aj6g-6752`
- Brown 2020: `acyn-d7fp`

#### Oregon Public Meetings (`gs36-7t8m`)
Public meeting notices across state agencies.

#### Oregon Newsroom (`j8eb-8um2`)
Oregon.gov news releases.

#### State Data Inventory (`yp9j-pm7w`)
Inventory of state agency datasets.

#### Oregon Agencies, Boards and Commissions (`wu8n-jqum`)
Listing of all state entities.

### Health & Human Services

#### Oregon Medicaid datasets (multiple)
- Fee-for-Service Pass-Through Rates: `trd9-u2yn`
- Diagnosis Codes Exempt from Readmission: `4dsx-fepw`
- Fee-for-Service Percentage Rates: `ae2j-x3ks`
- Dental Services: `495m-gmu2`
- Ambulatory Payment Classification: `r928-qxss`
- Other Provider Preventable Conditions: `6v33-ti93`
- Diagnostic Procedure Codes (Group 1119): `74vi-r5ii`
- Excluded Procedure Codes (Group 1118): `ahjx-qbmb`
- CWM Emergency Diagnosis Codes (Group 6014): `4ppf-rfju`
- Ancillary Services (Group 6060): `fq2m-i6ix`
- Diagnostic Workup File (Group 6032): `9pw8-pm6p`

#### COVID-19 Assistance (`8umw-9ajq`)
COVID assistance data.

### Education / Libraries

#### Oregon Public Library Statistics (`8zw7-zgjw`)
Comprehensive annual library statistics (150+ columns): staffing, finances, collections, circulation, programs, technology, facilities.

#### Oregon Library Directory (`6x9d-idz4`)
Contact and location info for all Oregon libraries.
| Column | Type |
|--------|------|
| libid | text |
| libraryname | text |
| type_of_library | text |
| location_type | text |
| county | text |
| address, physical_city, physical_state, physical_zip | text |
| phone_number, email_address | text |
| website | url |
| population_served | number |
| geocodedaddress | point |

### Other Notable Datasets

- **E-Government Service Portfolio** (`9g5a-r9zs`) - State IT services
- **Oregon City-Zipcode Counties** (`g44a-nzix`) - City/Zip/County mapping
- **Eligible Training Provider List** (`dhnh-39zs`) - Workforce training providers
- **Seismic Rehabilitation Grant Program** (`9kga-zsdx`)
- **DEQ Vehicle Inspection Stations** (`9x7t-w4u8`) - Portland metro
- **Farm Products Master List** (`3qaz-7u98`)
- **Oregon Section 18 Exemptions** (`ft7u-sx6y`) - Pesticide exemptions
- **Annual Performance Progress Report** (`kvbx-erfw`)
- **Enterprise IT Project Portfolio** (`hjrz-mzrm`)
- **Building Codes Division Active Licenses** (`vhbr-cuaq`)

---

## Verified API Examples

All tested and working against `data.oregon.gov`:

### Basic query
```
GET https://data.oregon.gov/resource/tckn-sxa6.json?$limit=2
```

### Filtered query
```
GET https://data.oregon.gov/resource/tckn-sxa6.json?$limit=10&$where=city='PORTLAND'
```

### Aggregation
```
GET https://data.oregon.gov/resource/tckn-sxa6.json?$select=city,count(*)&$group=city&$order=count(*)+DESC&$limit=5
```
Returns:
```json
[
  {"city": "PORTLAND", "count": "364295"},
  {"city": "SALEM", "count": "109494"},
  {"city": "BEND", "count": "68598"},
  {"city": "EUGENE", "count": "64326"},
  {"city": "BEAVERTON", "count": "44472"}
]
```

### Full-text search
```
GET https://data.oregon.gov/resource/tckn-sxa6.json?$q=coffee&$limit=3
```

### Get dataset metadata (column schema)
```
GET https://data.oregon.gov/api/views/tckn-sxa6.json
```
Returns name, description, category, tags, and full column definitions.

### Discover datasets via catalog API
```
GET https://api.us.socrata.com/api/catalog/v1?domains=data.oregon.gov&only=datasets&limit=100
```

### Get category counts
```
GET https://api.us.socrata.com/api/catalog/v1/domain_categories?domains=data.oregon.gov
```

---

## Key Implementation Notes for MCP Server

1. **No auth required for reads** - all datasets are public, app tokens only needed for higher rate limits
2. **v2.1 endpoints are simplest** - `https://data.oregon.gov/resource/{ID}.json` with SoQL params
3. **Dataset IDs are 4-by-4 alphanumeric** codes (e.g., `tckn-sxa6`)
4. **Metadata API** at `/api/views/{ID}.json` provides column schemas dynamically
5. **Catalog API** enables dataset discovery by keyword, category, or type
6. **Default limit is 1,000 rows** - must paginate for larger datasets
7. **Numbers come as strings in JSON** - parse accordingly
8. **URL type** returns objects `{"url": "..."}`, not plain strings
9. **Location/Point types** return GeoJSON objects
10. **Calendar dates** are ISO 8601: `"2024-01-15T00:00:00.000"`
11. **$q does full-text search** across all text columns
12. **Always use $order when paging** to ensure stable row ordering
13. **Count of null values**: `count()` excludes nulls
14. **Category inconsistency**: Oregon uses mixed case ("Business" vs "business") - handle both
