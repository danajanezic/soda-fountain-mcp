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
});
