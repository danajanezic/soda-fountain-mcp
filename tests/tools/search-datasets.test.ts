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
    const result = await handleSearchDatasets(client, { domain: "data.oregon.gov", query: "business" });

    expect(result.content[0].text).toContain("Active Businesses");
    expect(client.searchCatalog).toHaveBeenCalledWith({ domain: "data.oregon.gov", query: "business", category: undefined });
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

    const result = await handleSearchDatasets(client, { domain: "data.oregon.gov", query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("RATE_LIMITED");
  });

  it("returns NETWORK_ERROR for non-Socrata errors", async () => {
    const client = makeMockClient({
      searchCatalog: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    });

    const result = await handleSearchDatasets(client, { domain: "data.oregon.gov", query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NETWORK_ERROR");
    expect(result.content[0].text).toContain("recoverable");
  });

  it("passes category-only searches to client", async () => {
    const client = makeMockClient();
    await handleSearchDatasets(client, { domain: "data.oregon.gov", category: "Business" });

    expect(client.searchCatalog).toHaveBeenCalledWith({ domain: "data.oregon.gov", query: undefined, category: "Business" });
  });
});
