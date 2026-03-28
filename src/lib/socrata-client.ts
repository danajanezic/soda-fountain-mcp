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
