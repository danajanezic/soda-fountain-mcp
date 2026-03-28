# Oregon Open Data MCP Server — Design Spec

## Overview

An MCP server that provides AI agents with access to Oregon's open data portal (`data.oregon.gov`), which hosts 494+ datasets powered by the Socrata SODA API. The server exposes a small set of layered tools that guide agents through a discover-then-query workflow: find relevant datasets, inspect their schemas, and execute queries.

Any MCP-compatible client (Claude Code, Claude Desktop, other agents) can use this server.

## Architecture

Single MCP server process using stdio transport. Three tools, one HTTP client, no external dependencies beyond the MCP SDK.

The agent (not the server) handles intent detection. The server is a clean, well-documented bridge to the SODA API.

```
User Question
    ↓
AI Agent (Claude, etc.)
    ↓ calls MCP tools
┌─────────────────────────────────┐
│  Oregon Open Data MCP Server    │
│                                 │
│  Tools:                         │
│    search_datasets              │
│    get_dataset_schema           │
│    query_dataset                │
│                                 │
│  Lib:                           │
│    socrata-client (HTTP)        │
└─────────┬───────────────────────┘
          ↓ HTTPS
    data.oregon.gov (SODA API)
    api.us.socrata.com (Catalog API)
```

## Agent Workflow

1. User asks a question (e.g., "What are the biggest wildfires in Oregon?")
2. Agent calls `search_datasets` with `query: "fire"` — gets back matching datasets including ODF Fire Occurrence Data (`fbwv-q84y`)
3. Agent calls `get_dataset_schema` for `fbwv-q84y` — sees columns like `esttotalacres`, `firename`, `county`, `fireyear`, plus sample rows
4. Agent calls `query_dataset` with `datasetId: "fbwv-q84y"`, `select: "firename, esttotalacres, county, fireyear"`, `order: "esttotalacres DESC"`, `limit: 10`
5. Agent presents the results to the user

## Tools

### `search_datasets`

Searches the Oregon data catalog by keyword and/or category.

**Input:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | no | Keyword search term |
| `category` | string | no | Category filter (e.g., "Business", "Public Safety") |

At least one of `query` or `category` must be provided.

**Output:**
```json
{
  "results": [
    {
      "id": "fbwv-q84y",
      "name": "ODF Fire Occurrence Data 2000-2022",
      "description": "Oregon Dept of Forestry statistical wildfires...",
      "category": "Natural Resources",
      "updatedAt": "2023-11-15T00:00:00.000Z"
    }
  ],
  "metadata": { "totalResults": 3, "returned": 3 }
}
```

Capped at 20 results.

**Calls:** `https://api.us.socrata.com/api/catalog/v1?domains=data.oregon.gov&only=datasets&q={query}&categories={category}&limit=20`

### `get_dataset_schema`

Returns metadata, column definitions, and sample rows for a specific dataset.

**Input:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `datasetId` | string | yes | 4x4 dataset identifier (e.g., `tckn-sxa6`) |

**Output:**
```json
{
  "name": "Active Businesses - ALL",
  "description": "All Active businesses...",
  "category": "business",
  "columns": [
    { "fieldName": "business_name", "type": "text", "name": "Business Name" },
    { "fieldName": "registry_date", "type": "calendar_date", "name": "Registry Date" }
  ],
  "sampleRows": [
    { "business_name": "ACME CORP", "registry_date": "2024-01-15T00:00:00.000" }
  ]
}
```

**Calls:**
1. `https://data.oregon.gov/api/views/{datasetId}.json` — metadata + columns
2. `https://data.oregon.gov/resource/{datasetId}.json?$limit=3` — sample rows

### `query_dataset`

Executes a SoQL query against a specific dataset.

**Input:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `datasetId` | string | yes | 4x4 dataset identifier |
| `select` | string | no | Columns/expressions to return |
| `where` | string | no | Filter expression |
| `group` | string | no | Group by columns |
| `having` | string | no | Filter on aggregated values |
| `order` | string | no | Sort order |
| `limit` | number | no | Max rows (default 100, max 1000) |
| `offset` | number | no | Pagination offset |
| `search` | string | no | Full-text search (maps to `$q`) |

**Output (success):**
```json
{
  "results": [ { ... }, { ... } ],
  "metadata": { "rowsReturned": 10, "query": "$select=...&$where=...&$limit=10" }
}
```

**Output (empty results):**
```json
{
  "results": [],
  "metadata": { "rowsReturned": 0, "query": "..." },
  "notice": "No rows matched this query. The data may not contain what you're looking for — inform the user rather than guessing."
}
```

**Calls:** `https://data.oregon.gov/resource/{datasetId}.json?$select={select}&$where={where}&...`

## Socrata Client

`socrata-client.ts` — single module handling all HTTP communication.

### Methods

- **`searchCatalog(query?, category?)`** — calls Catalog API, extracts and returns dataset summaries
- **`getMetadata(datasetId)`** — calls Metadata API + sample data query, combines into one response
- **`queryDataset(datasetId, soqlParams)`** — builds SoQL query URL, executes, returns results

### Authentication

- App token is **optional** — all Oregon datasets are public
- If `SOCRATA_API_KEY` is set in environment, sent as `X-App-Token` header on every request
- Without a token: lower rate limits (shared IP pool), but functional
- `SOCRATA_API_KEY_SECRET` is not used (only needed for OAuth write operations)

### Request Behavior

- All requests use Node's built-in `fetch`
- HTTPS only
- App token injected via `X-App-Token` header when available

## Error Handling

All errors returned as structured MCP tool responses (never thrown exceptions that crash the server).

### Error Response Shape

```json
{
  "error": true,
  "code": "DATASET_NOT_FOUND",
  "message": "Dataset xyz1-abc2 not found — verify the dataset ID",
  "recoverable": false,
  "suggestion": "Try search_datasets to find the correct dataset ID"
}
```

### Error Mapping

| Condition | Code | Recoverable | Suggestion |
|-----------|------|-------------|------------|
| Zod validation failure | `INVALID_INPUT` | true | Describes what's wrong with the input |
| HTTP 400 | `BAD_QUERY` | true | "Check your SoQL syntax. Details: {API message}" |
| HTTP 404 | `DATASET_NOT_FOUND` | false | "Try search_datasets to find the correct dataset ID" |
| HTTP 429 | `RATE_LIMITED` | true | "Rate limited — consider adding a SOCRATA_API_KEY for higher limits" |
| HTTP 500 | `SERVER_ERROR` | true | "Socrata server error — try again shortly" |
| Network failure | `NETWORK_ERROR` | true | "Could not reach data.oregon.gov — check your network connection" |
| Valid query, zero rows | (not an error) | n/a | `notice` field on the response tells agent not to guess |

### Design Intent

The `error`, `recoverable`, and `suggestion` fields give agents strong, unambiguous signals:
- `error: true` — this is not data, do not present it as results
- `recoverable: false` — do not retry, tell the user
- `recoverable: true` — agent can fix input or retry
- `notice` on empty results — prevents hallucination when the query succeeded but found nothing

## Project Structure

```
or-mcp/
├── src/
│   ├── index.ts              # MCP server entry point, tool registration
│   ├── tools/
│   │   ├── search-datasets.ts
│   │   ├── get-dataset-schema.ts
│   │   └── query-dataset.ts
│   └── lib/
│       ├── socrata-client.ts  # HTTP client for SODA + Catalog APIs
│       └── types.ts           # Shared TypeScript types
├── tests/
│   ├── socrata-client.test.ts
│   ├── search-datasets.test.ts
│   ├── get-dataset-schema.test.ts
│   ├── query-dataset.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
├── .env                       # Optional: SOCRATA_API_KEY
├── .gitignore
└── RESEARCH.md
```

### Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `zod` — input validation (required by MCP SDK for tool schemas)

### Dev Dependencies

- `typescript`
- `vitest` — test runner

### Build & Run

- TypeScript compiled to JS (`dist/`)
- Stdio transport (standard for Claude Code / Claude Desktop)
- Entry: `node dist/index.js`

## Testing

### Unit Tests

**Socrata client:**
- Mock `fetch` responses
- Verify correct URL construction (query params, encoding)
- Verify app token header sent when present, omitted when absent
- Verify error parsing for each HTTP status code

**Tool handlers:**
- Zod schema rejects bad input (missing datasetId, limit over 1000, malformed 4x4 IDs)
- Structured error responses have correct `error`/`recoverable`/`suggestion` fields
- Empty results include the `notice` field

### Integration Smoke Tests

One live call per tool against real `data.oregon.gov`:
- `search_datasets` with `query: "business"`
- `get_dataset_schema` for `tckn-sxa6`
- `query_dataset` for `tckn-sxa6` with `$limit=1`

### Not Tested

- MCP SDK transport layer (their responsibility)
- Socrata API behavior (we test our parsing, not their server)

### Test Runner

Vitest — TypeScript-native, fast, zero config.
