import { describe, it, expect, vi } from "vitest";
import { handleQueryDataset } from "../../src/tools/query-dataset.js";
import type { SocrataClient } from "../../src/lib/socrata-client.js";
import { validate } from "../../src/lib/validator.js";

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

describe("query_dataset diagnostics", () => {
  it("validator produces warnings for large limits", () => {
    const result = validate({ limit: "50000" });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LARGE_LIMIT", severity: "warning" }),
    ]);
  });

  it("validator produces diagnostics for bad where clause", () => {
    const result = validate({ where: "name LIEK '%test%'" });
    expect(result.diagnostics.some((d) => d.code === "UNKNOWN_OPERATOR")).toBe(true);
  });
});
