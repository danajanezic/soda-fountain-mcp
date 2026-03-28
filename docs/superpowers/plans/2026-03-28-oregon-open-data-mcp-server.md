# Oregon Open Data MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that gives AI agents access to Oregon's 494+ open datasets via three layered tools: search, schema inspection, and querying.

**Architecture:** Single TypeScript MCP server using stdio transport. Three tools backed by one Socrata HTTP client. No intent detection in the server — the AI client handles reasoning about which datasets to query.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Zod, Vitest, Node built-in `fetch`

**Spec:** `docs/superpowers/specs/2026-03-28-oregon-open-data-mcp-server-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies, scripts (`build`, `start`, `test`) |
| `tsconfig.json` | TypeScript config targeting Node with ESM |
| `src/index.ts` | MCP server entry point — creates server, registers 3 tools, connects stdio transport |
| `src/lib/types.ts` | Shared TypeScript types and Zod schemas (error shape, tool inputs/outputs, dataset ID regex) |
| `src/lib/socrata-client.ts` | HTTP client: `searchCatalog`, `getMetadata`, `queryDataset` methods |
| `src/tools/search-datasets.ts` | Tool handler for `search_datasets` — validates input, calls client, formats output |
| `src/tools/get-dataset-schema.ts` | Tool handler for `get_dataset_schema` — validates input, calls client, formats output |
| `src/tools/query-dataset.ts` | Tool handler for `query_dataset` — validates input, calls client, formats output with notice on empty |
| `tests/lib/socrata-client.test.ts` | Unit tests for HTTP client (mocked fetch) |
| `tests/tools/search-datasets.test.ts` | Unit tests for search tool handler |
| `tests/tools/get-dataset-schema.test.ts` | Unit tests for schema tool handler |
| `tests/tools/query-dataset.test.ts` | Unit tests for query tool handler |
| `tests/integration.test.ts` | Live smoke tests against real data.oregon.gov |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "or-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run tests/integration.test.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.24.4"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.1.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 4: Verify TypeScript compiles**

Run: `mkdir -p src && echo 'console.log("ok");' > src/index.ts && npx tsc && node dist/index.js`
Expected: prints `ok`

- [ ] **Step 5: Clean up and commit**

Note: `.gitignore` already exists in the repo (with `node_modules/`, `dist/`, `.env`).

```bash
rm src/index.ts dist/index.js dist/index.d.ts 2>/dev/null
git add package.json package-lock.json tsconfig.json
git commit -m "chore: scaffold project with typescript, mcp sdk, vitest"
```

---

### Task 2: Shared Types and Zod Schemas

**Files:**
- Create: `src/lib/types.ts`
- Create: `tests/lib/types.test.ts`

- [ ] **Step 1: Write types.ts**

```typescript
import { z } from "zod";

// Dataset ID validation: 4x4 lowercase alphanumeric with dash
export const DatasetIdSchema = z
  .string()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, "datasetId must be a 4x4 identifier (e.g., tckn-sxa6)");

// Tool result shape returned by all handlers
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// Structured error response
export interface SocrataError {
  error: true;
  code: string;
  message: string;
  recoverable: boolean;
  suggestion: string;
}

// Column definition from metadata API
export interface ColumnDef {
  fieldName: string;
  type: string;
  name: string;
}

// Dataset summary from catalog search
export interface DatasetSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  updatedAt: string;
}

// Schema response
export interface DatasetSchema {
  name: string;
  description: string;
  category: string;
  columns: ColumnDef[];
  sampleRows: Record<string, unknown>[];
}

// Query response
export interface QueryResponse {
  results: Record<string, unknown>[];
  metadata: {
    rowsReturned: number;
    query: string;
  };
  notice?: string;
}

// Search response
export interface SearchResponse {
  results: DatasetSummary[];
  metadata: {
    totalResults: number;
    returned: number;
  };
}

// SoQL parameters for queryDataset
export interface SoqlParams {
  select?: string;
  where?: string;
  group?: string;
  having?: string;
  order?: string;
  limit: number;
  offset: number;
  search?: string;
}
```

- [ ] **Step 2: Write Zod schema tests**

```typescript
import { describe, it, expect } from "vitest";
import { DatasetIdSchema } from "../../src/lib/types.js";

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
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run tests/lib/types.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts tests/lib/types.test.ts
git commit -m "feat: add shared types, zod schemas, and schema tests"
```

---

### Task 3: Socrata Client — searchCatalog

**Files:**
- Create: `src/lib/socrata-client.ts`
- Create: `tests/lib/socrata-client.test.ts`

- [ ] **Step 1: Write the failing test for searchCatalog**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SocrataClient } from "../../src/lib/socrata-client.js";

describe("SocrataClient", () => {
  describe("searchCatalog", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("builds correct URL with query param", async () => {
      const mockResponse = {
        results: [
          {
            resource: {
              id: "fbwv-q84y",
              name: "ODF Fire Data",
              description: "Fire data",
              updatedAt: "2023-01-01T00:00:00.000Z",
            },
            classification: { domain_category: "Natural Resources" },
          },
        ],
        resultSetSize: 1,
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const client = new SocrataClient();
      const result = await client.searchCatalog({ query: "fire" });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("q=fire"),
        expect.any(Object)
      );
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        id: "fbwv-q84y",
        name: "ODF Fire Data",
        description: "Fire data",
        category: "Natural Resources",
        updatedAt: "2023-01-01T00:00:00.000Z",
      });
      expect(result.metadata.totalResults).toBe(1);
    });

    it("builds correct URL with category param", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [], resultSetSize: 0 }),
        })
      );

      const client = new SocrataClient();
      await client.searchCatalog({ category: "Business" });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("categories=Business"),
        expect.any(Object)
      );
    });

    it("sends X-App-Token header when API key is set", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [], resultSetSize: 0 }),
        })
      );

      const client = new SocrataClient("test-token-123");
      await client.searchCatalog({ query: "test" });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-App-Token": "test-token-123",
          }),
        })
      );
    });

    it("omits X-App-Token header when no API key", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [], resultSetSize: 0 }),
        })
      );

      const client = new SocrataClient();
      await client.searchCatalog({ query: "test" });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const options = callArgs[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers["X-App-Token"]).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/socrata-client.test.ts`
Expected: FAIL — `SocrataClient` not found

- [ ] **Step 3: Write socrata-client.ts with searchCatalog**

```typescript
import type {
  SocrataError,
  DatasetSummary,
  SearchResponse,
} from "./types.js";

const CATALOG_BASE = "https://api.us.socrata.com/api/catalog/v1";
const DATA_BASE = "https://data.oregon.gov";
const TIMEOUT_MS = 30_000;

export class SocrataClient {
  private appToken?: string;

  constructor(appToken?: string) {
    this.appToken = appToken;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.appToken) {
      headers["X-App-Token"] = this.appToken;
    }
    return headers;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: this.buildHeaders(),
        signal: controller.signal,
      });
      // HTTP 202 is technically 2xx (response.ok = true) but means
      // "still processing" in Socrata — treat it as an error
      if (response.status === 202) {
        const body = await response.text();
        throw this.handleHttpError(202, body);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  handleHttpError(status: number, body: string): SocrataError {
    let apiMessage = "";
    try {
      const parsed = JSON.parse(body);
      apiMessage = parsed.message || parsed.error || "";
    } catch {
      apiMessage = body;
    }

    switch (status) {
      case 202:
        return {
          error: true,
          code: "PROCESSING",
          message: "Query is still processing — try again in a few seconds",
          recoverable: true,
          suggestion: "Wait a few seconds and retry the same request",
        };
      case 400:
        return {
          error: true,
          code: "BAD_QUERY",
          message: `Check your SoQL syntax. Details: ${apiMessage}`,
          recoverable: true,
          suggestion: "Review the query parameters and try again",
        };
      case 403:
        return {
          error: true,
          code: "ACCESS_DENIED",
          message: "This dataset may be private or restricted",
          recoverable: false,
          suggestion: "Try a different dataset",
        };
      case 404:
        return {
          error: true,
          code: "DATASET_NOT_FOUND",
          message: `Dataset not found — verify the dataset ID`,
          recoverable: false,
          suggestion: "Try search_datasets to find the correct dataset ID",
        };
      case 429:
        return {
          error: true,
          code: "RATE_LIMITED",
          message: "Rate limited — consider adding a SOCRATA_API_KEY for higher limits",
          recoverable: true,
          suggestion: "Wait and retry, or add a SOCRATA_API_KEY environment variable",
        };
      default:
        return {
          error: true,
          code: "SERVER_ERROR",
          message: `Socrata server error (HTTP ${status}). Details: ${apiMessage}`,
          recoverable: true,
          suggestion: "Try again shortly",
        };
    }
  }

  async searchCatalog(params: {
    query?: string;
    category?: string;
  }): Promise<SearchResponse> {
    const url = new URL(CATALOG_BASE);
    url.searchParams.set("domains", "data.oregon.gov");
    url.searchParams.set("only", "datasets");
    url.searchParams.set("limit", "20");

    if (params.query) {
      url.searchParams.set("q", params.query);
    }
    if (params.category) {
      url.searchParams.set("categories", params.category);
    }

    const response = await this.fetchWithTimeout(url.toString());

    if (!response.ok) {
      const body = await response.text();
      throw this.handleHttpError(response.status, body);
    }

    const data = await response.json();

    const results: DatasetSummary[] = (data.results || []).map(
      (r: Record<string, Record<string, unknown>>) => ({
        id: r.resource?.id ?? "",
        name: r.resource?.name ?? "",
        description: r.resource?.description ?? "",
        category: r.classification?.domain_category ?? "",
        updatedAt: r.resource?.updatedAt ?? "",
      })
    );

    return {
      results,
      metadata: {
        totalResults: data.resultSetSize ?? 0,
        returned: results.length,
      },
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/socrata-client.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/socrata-client.ts tests/lib/socrata-client.test.ts
git commit -m "feat: add SocrataClient with searchCatalog method"
```

---

### Task 4: Socrata Client — getMetadata

**Files:**
- Modify: `src/lib/socrata-client.ts`
- Modify: `tests/lib/socrata-client.test.ts`

- [ ] **Step 1: Write failing tests for getMetadata**

Append to `tests/lib/socrata-client.test.ts` inside the top-level `describe`:

```typescript
  describe("getMetadata", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("fetches metadata and sample rows, filters system columns", async () => {
      const metadataResponse = {
        name: "Active Businesses",
        description: "All active businesses",
        category: "business",
        columns: [
          { fieldName: "business_name", dataTypeName: "text", name: "Business Name" },
          { fieldName: "city", dataTypeName: "text", name: "City" },
          { fieldName: ":id", dataTypeName: "meta_data", name: "ID" },
          { fieldName: ":@computed_region_abc", dataTypeName: "number", name: "Region" },
        ],
      };

      const sampleResponse = [
        { business_name: "ACME", city: "PORTLAND" },
        { business_name: "BETA", city: "SALEM" },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(metadataResponse),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(sampleResponse),
          })
      );

      const client = new SocrataClient();
      const result = await client.getMetadata("tckn-sxa6");

      expect(result.name).toBe("Active Businesses");
      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]).toEqual({
        fieldName: "business_name",
        type: "text",
        name: "Business Name",
      });
      expect(result.sampleRows).toHaveLength(2);
    });

    it("returns 404 error for invalid dataset", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          text: () => Promise.resolve('{"message": "Not found"}'),
        })
      );

      const client = new SocrataClient();
      await expect(client.getMetadata("xxxx-xxxx")).rejects.toMatchObject({
        error: true,
        code: "DATASET_NOT_FOUND",
      });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/socrata-client.test.ts`
Expected: FAIL — `getMetadata` not a function

- [ ] **Step 3: Add getMetadata to socrata-client.ts**

Add this method to the `SocrataClient` class:

```typescript
  async getMetadata(datasetId: string): Promise<DatasetSchema> {
    // Fetch metadata
    const metaUrl = `${DATA_BASE}/api/views/${datasetId}.json`;
    const metaResponse = await this.fetchWithTimeout(metaUrl);

    if (!metaResponse.ok) {
      const body = await metaResponse.text();
      throw this.handleHttpError(metaResponse.status, body);
    }

    const meta = await metaResponse.json();

    // Filter out system/computed columns (prefixed with : or :@)
    const columns: ColumnDef[] = (meta.columns || [])
      .filter((c: Record<string, string>) => !c.fieldName.startsWith(":"))
      .map((c: Record<string, string>) => ({
        fieldName: c.fieldName,
        type: c.dataTypeName,
        name: c.name,
      }));

    // Fetch sample rows
    const sampleUrl = `${DATA_BASE}/resource/${datasetId}.json?$limit=3`;
    const sampleResponse = await this.fetchWithTimeout(sampleUrl);

    let sampleRows: Record<string, unknown>[] = [];
    if (sampleResponse.ok) {
      sampleRows = await sampleResponse.json();
    }

    return {
      name: meta.name ?? "",
      description: meta.description ?? "",
      category: meta.category ?? "",
      columns,
      sampleRows,
    };
  }
```

Also add `DatasetSchema` and `ColumnDef` to the import from `./types.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/socrata-client.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/socrata-client.ts tests/lib/socrata-client.test.ts
git commit -m "feat: add getMetadata to SocrataClient"
```

---

### Task 5: Socrata Client — queryDataset

**Files:**
- Modify: `src/lib/socrata-client.ts`
- Modify: `tests/lib/socrata-client.test.ts`

- [ ] **Step 1: Write failing tests for queryDataset**

Append to `tests/lib/socrata-client.test.ts` inside the top-level `describe`:

```typescript
  describe("queryDataset", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("builds SoQL URL with all params", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ city: "PORTLAND" }]),
        })
      );

      const client = new SocrataClient();
      const result = await client.queryDataset("tckn-sxa6", {
        select: "city, count(*)",
        where: "state='OR'",
        group: "city",
        having: "count(*) > 5",
        order: "count(*) DESC",
        limit: 10,
        offset: 0,
      });

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(calledUrl).toContain("$select=");
      expect(calledUrl).toContain("$where=");
      expect(calledUrl).toContain("$group=");
      expect(calledUrl).toContain("$having=");
      expect(calledUrl).toContain("$order=");
      expect(calledUrl).toContain("$limit=10");
      expect(result.results).toHaveLength(1);
      expect(result.metadata.rowsReturned).toBe(1);
    });

    it("maps search param to $q", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        })
      );

      const client = new SocrataClient();
      await client.queryDataset("tckn-sxa6", {
        search: "coffee",
        limit: 100,
        offset: 0,
      });

      const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(calledUrl).toContain("$q=coffee");
    });

    it("includes notice on empty results", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        })
      );

      const client = new SocrataClient();
      const result = await client.queryDataset("tckn-sxa6", {
        limit: 100,
        offset: 0,
      });

      expect(result.results).toHaveLength(0);
      expect(result.notice).toContain("No rows matched");
    });

    it("returns error for bad query (400)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: () => Promise.resolve('{"message": "Invalid SoQL"}'),
        })
      );

      const client = new SocrataClient();
      await expect(
        client.queryDataset("tckn-sxa6", { limit: 100, offset: 0 })
      ).rejects.toMatchObject({
        error: true,
        code: "BAD_QUERY",
      });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/socrata-client.test.ts`
Expected: FAIL — `queryDataset` not a function

- [ ] **Step 3: Add queryDataset to socrata-client.ts**

Add this method to the `SocrataClient` class:

```typescript
  async queryDataset(
    datasetId: string,
    params: SoqlParams
  ): Promise<QueryResponse> {
    const url = new URL(`${DATA_BASE}/resource/${datasetId}.json`);

    if (params.select) url.searchParams.set("$select", params.select);
    if (params.where) url.searchParams.set("$where", params.where);
    if (params.group) url.searchParams.set("$group", params.group);
    if (params.having) url.searchParams.set("$having", params.having);
    if (params.order) url.searchParams.set("$order", params.order);
    if (params.search) url.searchParams.set("$q", params.search);
    url.searchParams.set("$limit", String(params.limit));
    if (params.offset > 0) url.searchParams.set("$offset", String(params.offset));

    const response = await this.fetchWithTimeout(url.toString());

    if (!response.ok) {
      const body = await response.text();
      throw this.handleHttpError(response.status, body);
    }

    const results: Record<string, unknown>[] = await response.json();

    const queryString = url.searchParams.toString();

    const queryResponse: QueryResponse = {
      results,
      metadata: {
        rowsReturned: results.length,
        query: queryString,
      },
    };

    if (results.length === 0) {
      queryResponse.notice =
        "No rows matched this query. The data may not contain what you're looking for — inform the user rather than guessing.";
    }

    return queryResponse;
  }
```

Also add `SoqlParams` and `QueryResponse` to the import from `./types.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/socrata-client.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/socrata-client.ts tests/lib/socrata-client.test.ts
git commit -m "feat: add queryDataset to SocrataClient"
```

---

### Task 6: Socrata Client — Error and Edge Case Tests

**Files:**
- Modify: `tests/lib/socrata-client.test.ts`

- [ ] **Step 1: Write error handling tests**

Append to `tests/lib/socrata-client.test.ts` inside the top-level `describe`:

```typescript
  describe("error handling", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("handles network timeout", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))
      );

      const client = new SocrataClient();
      await expect(client.searchCatalog({ query: "test" })).rejects.toThrow();
    });

    it("handles 429 rate limit", () => {
      const client = new SocrataClient();
      const err = client.handleHttpError(429, "{}");
      expect(err.code).toBe("RATE_LIMITED");
      expect(err.recoverable).toBe(true);
    });

    it("handles 202 processing", () => {
      const client = new SocrataClient();
      const err = client.handleHttpError(202, "{}");
      expect(err.code).toBe("PROCESSING");
      expect(err.recoverable).toBe(true);
    });

    it("handles 403 access denied", () => {
      const client = new SocrataClient();
      const err = client.handleHttpError(403, "{}");
      expect(err.code).toBe("ACCESS_DENIED");
      expect(err.recoverable).toBe(false);
    });
  });
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run tests/lib/socrata-client.test.ts`
Expected: All 14 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/lib/socrata-client.test.ts
git commit -m "test: add error handling tests for SocrataClient"
```

---

### Task 7: search_datasets Tool Handler

**Files:**
- Create: `src/tools/search-datasets.ts`
- Create: `tests/tools/search-datasets.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearchDatasets } from "../../src/tools/search-datasets.js";
import type { SocrataClient } from "../../src/lib/socrata-client.js";

function makeMockClient(overrides: Partial<SocrataClient> = {}): SocrataClient {
  return {
    searchCatalog: vi.fn().mockResolvedValue({
      results: [
        {
          id: "tckn-sxa6",
          name: "Active Businesses",
          description: "All active businesses",
          category: "Business",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      metadata: { totalResults: 1, returned: 1 },
    }),
    getMetadata: vi.fn(),
    queryDataset: vi.fn(),
    handleHttpError: vi.fn(),
    ...overrides,
  } as unknown as SocrataClient;
}

describe("search_datasets handler", () => {
  it("returns formatted results on success", async () => {
    const client = makeMockClient();
    const result = await handleSearchDatasets(client, { query: "business" });

    expect(result.content[0].text).toContain("Active Businesses");
    expect(client.searchCatalog).toHaveBeenCalledWith({ query: "business", category: undefined });
  });

  it("returns structured error when client throws SocrataError", async () => {
    const client = makeMockClient({
      searchCatalog: vi.fn().mockRejectedValue({
        error: true,
        code: "RATE_LIMITED",
        message: "Rate limited",
        recoverable: true,
        suggestion: "Wait and retry",
      }),
    });

    const result = await handleSearchDatasets(client, { query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("RATE_LIMITED");
  });

  it("returns NETWORK_ERROR for non-Socrata errors", async () => {
    const client = makeMockClient({
      searchCatalog: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    });

    const result = await handleSearchDatasets(client, { query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NETWORK_ERROR");
    expect(result.content[0].text).toContain("recoverable");
  });

  it("passes category-only searches to client", async () => {
    const client = makeMockClient();
    await handleSearchDatasets(client, { category: "Business" });

    expect(client.searchCatalog).toHaveBeenCalledWith({ query: undefined, category: "Business" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/search-datasets.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write search-datasets.ts**

```typescript
import type { SocrataClient } from "../lib/socrata-client.js";
import type { SocrataError, ToolResult } from "../lib/types.js";

export async function handleSearchDatasets(
  client: SocrataClient,
  params: { query?: string; category?: string }
): Promise<ToolResult> {
  try {
    const response = await client.searchCatalog({
      query: params.query,
      category: params.category,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  } catch (err) {
    const socrataErr = err as SocrataError;
    if (socrataErr.error) {
      return {
        content: [{ type: "text", text: JSON.stringify(socrataErr, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "NETWORK_ERROR",
            message: `Could not reach data.oregon.gov — ${String(err)}`,
            recoverable: true,
            suggestion: "Check your network connection",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/search-datasets.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/search-datasets.ts tests/tools/search-datasets.test.ts
git commit -m "feat: add search_datasets tool handler"
```

---

### Task 8: get_dataset_schema Tool Handler

**Files:**
- Create: `src/tools/get-dataset-schema.ts`
- Create: `tests/tools/get-dataset-schema.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { handleGetDatasetSchema } from "../../src/tools/get-dataset-schema.js";
import type { SocrataClient } from "../../src/lib/socrata-client.js";

function makeMockClient(overrides: Partial<SocrataClient> = {}): SocrataClient {
  return {
    searchCatalog: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({
      name: "Active Businesses",
      description: "All active businesses",
      category: "business",
      columns: [
        { fieldName: "business_name", type: "text", name: "Business Name" },
      ],
      sampleRows: [{ business_name: "ACME" }],
    }),
    queryDataset: vi.fn(),
    handleHttpError: vi.fn(),
    ...overrides,
  } as unknown as SocrataClient;
}

describe("get_dataset_schema handler", () => {
  it("returns formatted schema on success", async () => {
    const client = makeMockClient();
    const result = await handleGetDatasetSchema(client, { datasetId: "tckn-sxa6" });

    expect(result.content[0].text).toContain("Active Businesses");
    expect(result.content[0].text).toContain("business_name");
    expect(client.getMetadata).toHaveBeenCalledWith("tckn-sxa6");
  });

  it("returns structured error for 404", async () => {
    const client = makeMockClient({
      getMetadata: vi.fn().mockRejectedValue({
        error: true,
        code: "DATASET_NOT_FOUND",
        message: "Dataset not found",
        recoverable: false,
        suggestion: "Try search_datasets",
      }),
    });

    const result = await handleGetDatasetSchema(client, { datasetId: "xxxx-xxxx" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("DATASET_NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/get-dataset-schema.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write get-dataset-schema.ts**

```typescript
import type { SocrataClient } from "../lib/socrata-client.js";
import type { SocrataError, ToolResult } from "../lib/types.js";

export async function handleGetDatasetSchema(
  client: SocrataClient,
  params: { datasetId: string }
): Promise<ToolResult> {
  try {
    const schema = await client.getMetadata(params.datasetId);
    return {
      content: [{ type: "text", text: JSON.stringify(schema, null, 2) }],
    };
  } catch (err) {
    const socrataErr = err as SocrataError;
    if (socrataErr.error) {
      return {
        content: [{ type: "text", text: JSON.stringify(socrataErr, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "NETWORK_ERROR",
            message: `Could not reach data.oregon.gov — ${String(err)}`,
            recoverable: true,
            suggestion: "Check your network connection",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/get-dataset-schema.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-dataset-schema.ts tests/tools/get-dataset-schema.test.ts
git commit -m "feat: add get_dataset_schema tool handler"
```

---

### Task 9: query_dataset Tool Handler

**Files:**
- Create: `src/tools/query-dataset.ts`
- Create: `tests/tools/query-dataset.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { handleQueryDataset } from "../../src/tools/query-dataset.js";
import type { SocrataClient } from "../../src/lib/socrata-client.js";

function makeMockClient(overrides: Partial<SocrataClient> = {}): SocrataClient {
  return {
    searchCatalog: vi.fn(),
    getMetadata: vi.fn(),
    queryDataset: vi.fn().mockResolvedValue({
      results: [{ city: "PORTLAND", count: "364295" }],
      metadata: { rowsReturned: 1, query: "$select=city&$limit=100" },
    }),
    handleHttpError: vi.fn(),
    ...overrides,
  } as unknown as SocrataClient;
}

describe("query_dataset handler", () => {
  it("returns formatted results on success", async () => {
    const client = makeMockClient();
    const result = await handleQueryDataset(client, {
      datasetId: "tckn-sxa6",
      select: "city",
      limit: 100,
      offset: 0,
    });

    expect(result.content[0].text).toContain("PORTLAND");
    expect(client.queryDataset).toHaveBeenCalledWith("tckn-sxa6", {
      select: "city",
      limit: 100,
      offset: 0,
    });
  });

  it("passes through notice on empty results", async () => {
    const client = makeMockClient({
      queryDataset: vi.fn().mockResolvedValue({
        results: [],
        metadata: { rowsReturned: 0, query: "$limit=100" },
        notice: "No rows matched this query. The data may not contain what you're looking for — inform the user rather than guessing.",
      }),
    });

    const result = await handleQueryDataset(client, {
      datasetId: "tckn-sxa6",
      limit: 100,
      offset: 0,
    });

    expect(result.content[0].text).toContain("No rows matched");
    expect(result.isError).toBeUndefined();
  });

  it("returns structured error on bad query", async () => {
    const client = makeMockClient({
      queryDataset: vi.fn().mockRejectedValue({
        error: true,
        code: "BAD_QUERY",
        message: "Invalid SoQL",
        recoverable: true,
        suggestion: "Check syntax",
      }),
    });

    const result = await handleQueryDataset(client, {
      datasetId: "tckn-sxa6",
      where: "bad syntax!!!",
      limit: 100,
      offset: 0,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("BAD_QUERY");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/query-dataset.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write query-dataset.ts**

```typescript
import type { SocrataClient } from "../lib/socrata-client.js";
import type { SocrataError, SoqlParams, ToolResult } from "../lib/types.js";

export async function handleQueryDataset(
  client: SocrataClient,
  params: {
    datasetId: string;
    select?: string;
    where?: string;
    group?: string;
    having?: string;
    order?: string;
    limit: number;
    offset: number;
    search?: string;
  }
): Promise<ToolResult> {
  try {
    const soqlParams: SoqlParams = {
      select: params.select,
      where: params.where,
      group: params.group,
      having: params.having,
      order: params.order,
      limit: params.limit,
      offset: params.offset,
      search: params.search,
    };

    const response = await client.queryDataset(params.datasetId, soqlParams);
    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  } catch (err) {
    const socrataErr = err as SocrataError;
    if (socrataErr.error) {
      return {
        content: [{ type: "text", text: JSON.stringify(socrataErr, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "NETWORK_ERROR",
            message: `Could not reach data.oregon.gov — ${String(err)}`,
            recoverable: true,
            suggestion: "Check your network connection",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/query-dataset.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/query-dataset.ts tests/tools/query-dataset.test.ts
git commit -m "feat: add query_dataset tool handler"
```

---

### Task 10: MCP Server Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SocrataClient } from "./lib/socrata-client.js";
import { handleSearchDatasets } from "./tools/search-datasets.js";
import { handleGetDatasetSchema } from "./tools/get-dataset-schema.js";
import { handleQueryDataset } from "./tools/query-dataset.js";

const appToken = process.env.SOCRATA_API_KEY;
const client = new SocrataClient(appToken);

const server = new McpServer({
  name: "oregon-open-data",
  version: "1.0.0",
});

server.registerTool(
  "search_datasets",
  {
    title: "Search Oregon Datasets",
    description:
      "Search Oregon's open data catalog (data.oregon.gov) by keyword and/or category. " +
      "Returns dataset names, IDs, and descriptions. Use this first to discover which datasets " +
      "are available before querying. Categories include: Business, Revenue & Expense, " +
      "Health & Human Services, Administrative, Natural Resources, Public Safety, Education, " +
      "Transportation, Recreation.",
    inputSchema: {
      query: z.string().optional().describe("Keyword search term (e.g., 'fire', 'business', 'salary')"),
      category: z.string().optional().describe("Category filter — case-sensitive (e.g., 'Business', 'Public Safety')"),
    },
  },
  async ({ query, category }) => {
    if (!query && !category) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: true,
              code: "INVALID_INPUT",
              message: "At least one of query or category must be provided",
              recoverable: true,
              suggestion: "Provide a query keyword or a category name",
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
    return handleSearchDatasets(client, { query, category });
  }
);

server.registerTool(
  "get_dataset_schema",
  {
    title: "Get Dataset Schema",
    description:
      "Get column definitions and sample rows for an Oregon open dataset. " +
      "Use this after search_datasets to understand a dataset's structure before querying. " +
      "Returns column names, types, and 3 sample rows.",
    inputSchema: {
      datasetId: z
        .string()
        .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, "Must be a 4x4 dataset ID (e.g., tckn-sxa6)")
        .describe("Dataset identifier from search results (e.g., 'tckn-sxa6')"),
    },
  },
  async ({ datasetId }) => {
    return handleGetDatasetSchema(client, { datasetId });
  }
);

server.registerTool(
  "query_dataset",
  {
    title: "Query Oregon Dataset",
    description:
      "Execute a SoQL query against an Oregon open dataset. " +
      "Use get_dataset_schema first to understand available columns. " +
      "Supports filtering ($where), aggregation ($group), sorting ($order), " +
      "full-text search ($q), and pagination ($limit/$offset).",
    inputSchema: {
      datasetId: z
        .string()
        .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, "Must be a 4x4 dataset ID")
        .describe("Dataset identifier (e.g., 'tckn-sxa6')"),
      select: z.string().optional().describe("Columns/expressions to return (e.g., 'city, count(*)')"),
      where: z.string().optional().describe("Filter expression (e.g., \"city='PORTLAND'\")"),
      group: z.string().optional().describe("Group by columns for aggregation"),
      having: z.string().optional().describe("Filter on aggregated values (e.g., 'count(*) > 100')"),
      order: z.string().optional().describe("Sort order (e.g., 'count(*) DESC')"),
      limit: z.number().int().min(1).max(1000).default(100).describe("Max rows to return (default 100, max 1000)"),
      offset: z.number().int().min(0).default(0).describe("Pagination offset"),
      search: z.string().optional().describe("Full-text search across all text columns"),
    },
  },
  async ({ datasetId, select, where, group, having, order, limit, offset, search }) => {
    return handleQueryDataset(client, {
      datasetId,
      select,
      where,
      group,
      having,
      order,
      limit,
      offset,
      search,
    });
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc`
Expected: No errors, `dist/` populated

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point with all three tools"
```

---

### Task 11: Integration Smoke Tests

**Files:**
- Create: `tests/integration.test.ts`

These hit the real Socrata API. Run separately from unit tests.

- [ ] **Step 1: Write integration tests**

```typescript
import { describe, it, expect } from "vitest";
import { SocrataClient } from "../src/lib/socrata-client.js";

const client = new SocrataClient(process.env.SOCRATA_API_KEY);

describe("integration: live Socrata API", () => {
  it("searchCatalog returns results for 'business'", async () => {
    const result = await client.searchCatalog({ query: "business" });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].id).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    expect(result.results[0].name).toBeTruthy();
  }, 15_000);

  it("getMetadata returns schema for tckn-sxa6", async () => {
    const result = await client.getMetadata("tckn-sxa6");
    expect(result.name).toBe("Active Businesses - ALL");
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.columns[0].fieldName).toBeTruthy();
    expect(result.columns[0].type).toBeTruthy();
    expect(result.sampleRows.length).toBeGreaterThan(0);
  }, 15_000);

  it("queryDataset returns data for tckn-sxa6", async () => {
    const result = await client.queryDataset("tckn-sxa6", {
      select: "business_name, city",
      limit: 1,
      offset: 0,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toHaveProperty("business_name");
    expect(result.metadata.rowsReturned).toBe(1);
  }, 15_000);

  it("queryDataset with aggregation works", async () => {
    const result = await client.queryDataset("tckn-sxa6", {
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
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration.test.ts`
Expected: All 4 tests PASS (requires network access)

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test: add integration smoke tests against live Socrata API"
```

---

### Task 12: End-to-End Verification

**Files:** None — verification only

- [ ] **Step 1: Run full unit test suite**

Run: `npx vitest run --exclude tests/integration.test.ts`
Expected: All unit tests PASS

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: `dist/` contains compiled JS, no errors

- [ ] **Step 3: Test MCP server starts**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node dist/index.js`
Expected: JSON response with server capabilities including the three tools

- [ ] **Step 4: Run integration tests**

Run: `npm run test:integration`
Expected: All 4 integration tests PASS

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify all tests pass and server starts"
```
