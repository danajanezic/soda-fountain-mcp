import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SocrataClient } from "./lib/socrata-client.js";
import { handleSearchDatasets } from "./tools/search-datasets.js";
import { handleGetDatasetSchema } from "./tools/get-dataset-schema.js";
import { handleQueryDataset } from "./tools/query-dataset.js";
import { handleValidateSoql } from "./tools/validate-soql.js";

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
