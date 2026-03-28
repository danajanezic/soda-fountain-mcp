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
