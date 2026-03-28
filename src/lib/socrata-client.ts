import type {
  SocrataError,
  DatasetSummary,
  SearchResponse,
  DatasetSchema,
  ColumnDef,
  SoqlParams,
  QueryResponse,
  DomainInfo,
  DomainCategoriesResponse,
} from "./types.js";

const CATALOG_BASE = "https://api.us.socrata.com/api/catalog/v1";
const TIMEOUT_MS = 30_000;

/** Known Socrata domains with their dataset counts (periodically verified). */
const KNOWN_DOMAINS: DomainInfo[] = [
  { domain: "opendata.utah.gov", datasetCount: 6737 },
  { domain: "data.cityofnewyork.us", datasetCount: 2391 },
  { domain: "data.cdc.gov", datasetCount: 1106 },
  { domain: "data.wa.gov", datasetCount: 1066 },
  { domain: "data.ny.gov", datasetCount: 993 },
  { domain: "data.cityofchicago.org", datasetCount: 906 },
  { domain: "data.texas.gov", datasetCount: 795 },
  { domain: "data.colorado.gov", datasetCount: 633 },
  { domain: "data.ct.gov", datasetCount: 591 },
  { domain: "data.oregon.gov", datasetCount: 494 },
  { domain: "data.montgomerycountymd.gov", datasetCount: 457 },
  { domain: "mydata.iowa.gov", datasetCount: 432 },
  { domain: "data.pa.gov", datasetCount: 377 },
  { domain: "data.lacity.org", datasetCount: 358 },
  { domain: "data.kingcounty.gov", datasetCount: 265 },
  { domain: "data.michigan.gov", datasetCount: 261 },
  { domain: "data.mo.gov", datasetCount: 243 },
  { domain: "data.kcmo.org", datasetCount: 201 },
  { domain: "data.nola.gov", datasetCount: 199 },
  { domain: "data.vermont.gov", datasetCount: 170 },
  { domain: "data.delaware.gov", datasetCount: 168 },
  { domain: "data.nj.gov", datasetCount: 113 },
];

export class SocrataClient {
  private appToken?: string;
  private schemaCache = new Map<string, { schema: DatasetSchema; fetchedAt: number }>();
  private static SCHEMA_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(appToken?: string) {
    this.appToken = appToken;
  }

  /** Get cached schema for a dataset. */
  private async getCachedSchema(domain: string, datasetId: string): Promise<DatasetSchema> {
    const key = `${domain}/${datasetId}`;
    const cached = this.schemaCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < SocrataClient.SCHEMA_TTL_MS) {
      return cached.schema;
    }
    const schema = await this.getMetadata(domain, datasetId);
    this.schemaCache.set(key, { schema, fetchedAt: Date.now() });
    return schema;
  }

  /** Get column definitions for a dataset, with caching. */
  async getColumns(domain: string, datasetId: string): Promise<ColumnDef[]> {
    return (await this.getCachedSchema(domain, datasetId)).columns;
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
          message: `Dataset not found — verify the dataset ID and domain`,
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

  /** List known Socrata domains. */
  listDomains(): DomainInfo[] {
    return KNOWN_DOMAINS;
  }

  /** Get categories and tags for a specific domain. */
  async getDomainCategories(domain: string): Promise<DomainCategoriesResponse> {
    const catUrl = new URL(`${CATALOG_BASE}/domain_categories`);
    catUrl.searchParams.set("domains", domain);
    catUrl.searchParams.set("search_context", domain);

    const tagUrl = new URL(`${CATALOG_BASE}/domain_tags`);
    tagUrl.searchParams.set("domains", domain);
    tagUrl.searchParams.set("search_context", domain);

    const [catResponse, tagResponse] = await Promise.all([
      this.fetchWithTimeout(catUrl.toString()),
      this.fetchWithTimeout(tagUrl.toString()),
    ]);

    let categories: Array<{ name: string; count: number }> = [];
    if (catResponse.ok) {
      const catData = await catResponse.json();
      categories = (catData.results || []).map(
        (r: { domain_category: string; count: number }) => ({
          name: r.domain_category,
          count: r.count,
        })
      );
    }

    let tags: Array<{ name: string; count: number }> = [];
    if (tagResponse.ok) {
      const tagData = await tagResponse.json();
      const allTags: Array<{ name: string; count: number }> = (tagData.results || []).map(
        (r: { domain_tag: string; count: number }) => ({
          name: r.domain_tag,
          count: r.count,
        })
      );
      // Only return top 25 tags to keep response manageable
      tags = allTags.slice(0, 25);
    }

    return { domain, categories, tags };
  }

  async searchCatalog(params: {
    domain: string;
    query?: string;
    category?: string;
  }): Promise<SearchResponse> {
    const url = new URL(CATALOG_BASE);
    url.searchParams.set("domains", params.domain);
    url.searchParams.set("search_context", params.domain);
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
      (r: Record<string, Record<string, unknown>>) => {
        const fieldNames: string[] =
          (r.resource?.columns_field_name as string[] | undefined) ?? [];
        return {
          id: (r.resource?.id as string) ?? "",
          name: (r.resource?.name as string) ?? "",
          description: (r.resource?.description as string) ?? "",
          category: (r.classification?.domain_category as string) ?? "",
          domain: params.domain,
          updatedAt: (r.resource?.updatedAt as string) ?? "",
          columns: fieldNames,
        };
      }
    );

    // Re-rank by column relevance: if the search query words appear in
    // column names, boost that dataset to the top. This helps LLMs find
    // the right dataset when Socrata's text-relevance ranking misses.
    if (params.query) {
      const queryWords = params.query
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((w) => w.length > 2);

      const scored = results.map((ds) => {
        const colNamesLower = ds.columns.map((c) => c.toLowerCase());
        let boost = 0;
        for (const word of queryWords) {
          // Exact column match (e.g., query "salary" matches column "salary")
          if (colNamesLower.some((c) => c === word)) boost += 3;
          // Partial column match (e.g., query "fire" matches "firename")
          else if (colNamesLower.some((c) => c.includes(word))) boost += 2;
          // Name match (e.g., query "fire" in dataset name "Fire Occurrence")
          if (ds.name.toLowerCase().includes(word)) boost += 1;
        }
        return { ds, boost };
      });

      scored.sort((a, b) => b.boost - a.boost);
      const reranked = scored.map((s) => s.ds);

      return {
        results: reranked,
        metadata: {
          totalResults: data.resultSetSize ?? 0,
          returned: reranked.length,
        },
      };
    }

    return {
      results,
      metadata: {
        totalResults: data.resultSetSize ?? 0,
        returned: results.length,
      },
    };
  }

  private buildQueryString(params: SoqlParams): string {
    const queryParts: string[] = [];

    if (params.select) queryParts.push(`$select=${encodeURIComponent(params.select)}`);
    if (params.where) queryParts.push(`$where=${encodeURIComponent(params.where)}`);
    if (params.group) queryParts.push(`$group=${encodeURIComponent(params.group)}`);
    if (params.having) queryParts.push(`$having=${encodeURIComponent(params.having)}`);
    if (params.order) queryParts.push(`$order=${encodeURIComponent(params.order)}`);
    if (params.search) queryParts.push(`$q=${encodeURIComponent(params.search)}`);
    queryParts.push(`$limit=${params.limit}`);
    if (params.offset > 0) queryParts.push(`$offset=${params.offset}`);

    return queryParts.join("&");
  }

  async queryDataset(
    domain: string,
    datasetId: string,
    params: SoqlParams,
    format: "json" | "markdown" = "json"
  ): Promise<QueryResponse | string> {
    const queryString = this.buildQueryString(params);
    const urlStr = `https://${domain}/resource/${datasetId}.json?${queryString}`;

    const response = await this.fetchWithTimeout(urlStr);

    if (!response.ok) {
      const body = await response.text();
      throw this.handleHttpError(response.status, body);
    }

    const results: Record<string, unknown>[] = await response.json();

    // For markdown, convert JSON results to a markdown table
    if (format === "markdown") {
      return this.toMarkdownTable(results, queryString);
    }

    // ── LLM-first enrichments ──

    // Column types + dataset description: so the LLM knows what it's looking at
    // without a separate get_dataset_schema call
    let columnTypes: Record<string, string> | undefined;
    let datasetDescription: string | undefined;
    try {
      const schema = await this.getCachedSchema(domain, datasetId);
      datasetDescription = schema.description || schema.name;
      const colMap = new Map(schema.columns.map((c) => [c.fieldName, c.type]));
      const resultKeys = results.length > 0 ? Object.keys(results[0]).filter((k) => !k.startsWith(":")) : [];
      if (resultKeys.length > 0) {
        columnTypes = {};
        for (const key of resultKeys) {
          columnTypes[key] = colMap.get(key) ?? "unknown";
        }
      }
    } catch {
      // Schema not available — skip enrichments
    }

    // Truncation warning: if results hit the limit, there's likely more data
    const truncated = results.length >= params.limit;

    // Null counts: which columns have missing data
    let nullCounts: Record<string, number> | undefined;
    if (results.length > 0) {
      const counts: Record<string, number> = {};
      const keys = Object.keys(results[0]).filter((k) => !k.startsWith(":"));
      for (const key of keys) {
        const nullCount = results.filter((r) => r[key] === undefined || r[key] === null).length;
        if (nullCount > 0) {
          counts[key] = nullCount;
        }
      }
      if (Object.keys(counts).length > 0) {
        nullCounts = counts;
      }
    }

    // Numeric summary: min/max/avg for numeric columns (helps LLM contextualize values)
    let numericSummary: Record<string, { min: number; max: number; avg: number }> | undefined;
    if (results.length > 0 && columnTypes) {
      const numericCols = Object.entries(columnTypes)
        .filter(([, type]) => type === "number")
        .map(([name]) => name);

      if (numericCols.length > 0) {
        numericSummary = {};
        for (const col of numericCols) {
          const values = results
            .map((r) => Number(r[col]))
            .filter((v) => !isNaN(v));
          if (values.length > 0) {
            numericSummary[col] = {
              min: Math.min(...values),
              max: Math.max(...values),
              avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
            };
          }
        }
        if (Object.keys(numericSummary).length === 0) {
          numericSummary = undefined;
        }
      }
    }

    const queryResponse: QueryResponse = {
      results,
      metadata: {
        rowsReturned: results.length,
        query: queryString,
        datasetDescription,
        columnTypes,
        truncated: truncated || undefined,
        nullCounts,
        numericSummary,
      },
    };

    if (results.length === 0) {
      queryResponse.notice =
        "No rows matched this query. The data may not contain what you're looking for — inform the user rather than guessing.";
    }

    if (truncated) {
      queryResponse.notice =
        (queryResponse.notice ? queryResponse.notice + " " : "") +
        `Results hit the limit (${params.limit}). There may be more data — add filters to narrow results, or increase the limit and use $offset to paginate.`;
    }

    return queryResponse;
  }

  private toMarkdownTable(
    rows: Record<string, unknown>[],
    queryString: string
  ): string {
    if (rows.length === 0) {
      return "_No rows matched this query. The data may not contain what you're looking for — inform the user rather than guessing._";
    }

    // Collect all unique keys across all rows (some rows may have missing fields)
    const keys = Array.from(
      new Set(rows.flatMap((r) => Object.keys(r)))
    ).filter((k) => !k.startsWith(":"));

    // Header
    const header = `| ${keys.join(" | ")} |`;
    const separator = `| ${keys.map(() => "---").join(" | ")} |`;

    // Rows — truncate long values
    const dataRows = rows.map((row) => {
      const cells = keys.map((k) => {
        const val = row[k];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val);
        const str = String(val);
        return str.length > 60 ? str.slice(0, 57) + "..." : str;
      });
      return `| ${cells.join(" | ")} |`;
    });

    return [
      header,
      separator,
      ...dataRows,
      "",
      `_${rows.length} rows — query: \`${queryString}\`_`,
    ].join("\n");
  }

  async getMetadata(domain: string, datasetId: string): Promise<DatasetSchema> {
    const metaUrl = `https://${domain}/api/views/${datasetId}.json`;
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
    const sampleUrl = `https://${domain}/resource/${datasetId}.json?$limit=3`;
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
}
