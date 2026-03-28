import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SocrataClient } from "./lib/socrata-client.js";
import { handleListDomains } from "./tools/list-domains.js";
import { handleGetDomainCategories } from "./tools/get-domain-categories.js";
import { handleSearchDatasets } from "./tools/search-datasets.js";
import { handleGetDatasetSchema } from "./tools/get-dataset-schema.js";
import { handleQueryDataset } from "./tools/query-dataset.js";
import { handleValidateSoql } from "./tools/validate-soql.js";
import { registerPrompts } from "./prompts.js";

const appToken = process.env.SOCRATA_API_KEY;
const client = new SocrataClient(appToken);

const server = new McpServer({
  name: "socrata-open-data",
  version: "2.0.0",
});

registerPrompts(server);

const domainSchema = z
  .string()
  .describe("Socrata domain (e.g., 'data.oregon.gov', 'data.wa.gov', 'data.ny.gov'). Use list_domains to discover available portals.");

const datasetIdSchema = z
  .string()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, "Must be a 4x4 dataset ID (e.g., tckn-sxa6)")
  .describe("Dataset identifier from search results (e.g., 'tckn-sxa6')");

// ── Domain discovery ──

server.registerTool(
  "list_domains",
  {
    title: "List Socrata Data Portals",
    description:
      "List available Socrata open data portals — states, cities, counties, and federal agencies. " +
      "Use this first to discover which portals are available before searching for datasets. " +
      "Returns domain names and approximate dataset counts.",
    inputSchema: {},
  },
  async () => {
    return handleListDomains(client);
  }
);

server.registerTool(
  "get_domain_categories",
  {
    title: "Get Domain Categories & Tags",
    description:
      "Get the categories and popular tags for a specific Socrata portal. " +
      "Use this after list_domains to understand what data a portal contains " +
      "before searching. Categories are used to filter search_datasets results.",
    inputSchema: {
      domain: domainSchema,
    },
  },
  async ({ domain }) => {
    return handleGetDomainCategories(client, { domain });
  }
);

// ── Dataset discovery & querying ──

server.registerTool(
  "search_datasets",
  {
    title: "Search Datasets",
    description:
      "Search a Socrata portal's dataset catalog by keyword and/or category. " +
      "Returns dataset names, IDs, descriptions, and categories. " +
      "Use list_domains first to find portals, then search within a specific portal.",
    inputSchema: {
      domain: domainSchema,
      query: z.string().optional().describe("Keyword search term (e.g., 'fire', 'business', 'salary')"),
      category: z.string().optional().describe("Category filter — case-sensitive, from get_domain_categories (e.g., 'Business', 'Public Safety')"),
    },
  },
  async ({ domain, query, category }) => {
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
    return handleSearchDatasets(client, { domain, query, category });
  }
);

server.registerTool(
  "get_dataset_schema",
  {
    title: "Get Dataset Schema",
    description:
      "Get column definitions and sample rows for a dataset on a Socrata portal. " +
      "Use this after search_datasets to understand a dataset's structure before querying. " +
      "Returns column names, types, and 3 sample rows.",
    inputSchema: {
      domain: domainSchema,
      datasetId: datasetIdSchema,
    },
  },
  async ({ domain, datasetId }) => {
    return handleGetDatasetSchema(client, { domain, datasetId });
  }
);

server.registerTool(
  "query_dataset",
  {
    title: "Query Dataset",
    description:
      "Execute a SoQL query against a dataset on a Socrata portal. " +
      "Use get_dataset_schema first to understand available columns. " +
      "Supports filtering ($where), aggregation ($group), sorting ($order), " +
      "full-text search ($q), and pagination ($limit/$offset). " +
      "Output formats: json (default, structured), csv (compact tabular), " +
      "geojson (for geographic data with point/polygon columns), markdown (readable table).",
    inputSchema: {
      domain: domainSchema,
      datasetId: datasetIdSchema,
      select: z.string().optional().describe("Columns/expressions to return (e.g., 'city, count(*)')"),
      where: z.string().optional().describe("Filter expression (e.g., \"city='PORTLAND'\")"),
      group: z.string().optional().describe("Group by columns for aggregation"),
      having: z.string().optional().describe("Filter on aggregated values (e.g., 'count(*) > 100')"),
      order: z.string().optional().describe("Sort order (e.g., 'count(*) DESC')"),
      limit: z.number().int().min(1).max(1000).default(100).describe("Max rows to return (default 100, max 1000)"),
      offset: z.number().int().min(0).default(0).describe("Pagination offset"),
      search: z.string().optional().describe("Full-text search across all text columns"),
      format: z.enum(["json", "csv", "geojson", "markdown"]).default("json").describe("Output format: json (structured), csv (tabular), geojson (geographic), markdown (readable table)"),
    },
  },
  async ({ domain, datasetId, select, where, group, having, order, limit, offset, search, format }) => {
    return handleQueryDataset(client, {
      domain,
      datasetId,
      select,
      where,
      group,
      having,
      order,
      limit,
      offset,
      search,
      format,
    });
  }
);

// ── SoQL validation (from LSP session) ──

server.registerTool(
  "validate_soql",
  {
    title: "Validate SoQL Query",
    description:
      "Validate SoQL query parameters before executing. Returns diagnostics for syntax errors " +
      "with suggestions for fixes. Use this to check your query before calling query_dataset.",
    inputSchema: {
      select: z.string().optional().describe("SoQL $select clause"),
      where: z.string().optional().describe("SoQL $where clause"),
      order: z.string().optional().describe("SoQL $order clause"),
      group: z.string().optional().describe("SoQL $group clause"),
      having: z.string().optional().describe("SoQL $having clause"),
      limit: z.string().optional().describe("SoQL $limit value"),
      offset: z.string().optional().describe("SoQL $offset value"),
      q: z.string().optional().describe("Full-text search query"),
    },
  },
  async (params) => {
    const result = handleValidateSoql(params);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
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
