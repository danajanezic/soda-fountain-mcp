import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const domainArg = z
  .string()
  .describe("Socrata domain (e.g., 'data.oregon.gov'). Use list_domains to discover portals.");

interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

function msg(role: "user" | "assistant", text: string): PromptMessage {
  return { role, content: { type: "text", text } };
}

export function registerPrompts(server: McpServer): void {
  // ── 1. Explore a Portal ──

  server.registerPrompt(
    "explore_portal",
    {
      description:
        "Explore what data is available on a Socrata open data portal. " +
        "Walks through domain categories, popular tags, and sample datasets.",
      argsSchema: {
        domain: domainArg,
      },
    },
    ({ domain }) => ({
      messages: [
        msg(
          "user",
          `Explore the open data portal at ${domain}. Walk me through what data is available.

Follow this workflow:

1. Call get_domain_categories for "${domain}" to see all categories and top tags.

2. Pick the 3 largest categories and call search_datasets for each to show representative datasets.

3. Summarize what this portal covers — what kinds of questions could someone answer with this data? What's the most interesting or unique data here?

Be specific about dataset names and IDs so I can explore further.`
        ),
      ],
    })
  );

  // ── 2. Explore a Dataset ──

  server.registerPrompt(
    "explore_dataset",
    {
      description:
        "Deep-dive into a specific dataset: schema, sample data, key statistics, " +
        "and suggested queries for exploration.",
      argsSchema: {
        domain: domainArg,
        dataset_id: z
          .string()
          .describe("Dataset identifier (e.g., 'tckn-sxa6')"),
      },
    },
    ({ domain, dataset_id }) => ({
      messages: [
        msg(
          "user",
          `Do a thorough exploration of dataset ${dataset_id} on ${domain}.

Follow this workflow:

1. Call get_dataset_schema to see the full column list, types, and sample rows.

2. Run 3-4 queries to understand the data:
   - A count of total rows
   - The top values in a key categorical column (GROUP BY + COUNT)
   - The range of a key numeric column (MIN, MAX, AVG)
   - The time span if there's a date column (MIN and MAX dates)

3. Summarize:
   - What this dataset contains and how it's structured
   - How many rows and what time period it covers
   - The most interesting columns and what they tell us
   - 5 example questions this dataset could answer, with the SoQL queries to answer them`
        ),
      ],
    })
  );

  // ── 3. Compare Across Portals ──

  server.registerPrompt(
    "compare_across_portals",
    {
      description:
        "Find and compare similar datasets across different Socrata portals " +
        "(e.g., compare Oregon and Washington fire data, or state salary data).",
      argsSchema: {
        topic: z
          .string()
          .describe("What to compare (e.g., 'wildfire data', 'state employee salaries', 'business licenses')"),
        domains: z
          .string()
          .describe("Comma-separated domains to compare (e.g., 'data.oregon.gov,data.wa.gov')"),
      },
    },
    ({ topic, domains }) => {
      const domainList = domains.split(",").map((d: string) => d.trim());
      return {
        messages: [
          msg(
            "user",
            `Compare ${topic} across these portals: ${domainList.join(", ")}.

Follow this workflow:

1. For each portal, call search_datasets with a keyword related to "${topic}".

2. For each matching dataset, call get_dataset_schema to understand the columns.

3. Identify which columns are comparable across the datasets. Look for common fields like county, year, amount, category, etc.

4. Run parallel queries on each dataset to get comparable aggregated data (e.g., counts by county, totals by year, averages by category).

5. Present a side-by-side comparison:
   - What each portal has available on this topic
   - How the data structures differ
   - Key metrics compared across portals
   - What's unique to each portal
   - Gaps — what one portal has that another doesn't`
          ),
        ],
      };
    }
  );

  // ── 4. Investigate a Question ──

  server.registerPrompt(
    "investigate_question",
    {
      description:
        "Research a specific question using open data. Guides the agent through " +
        "finding relevant datasets, building queries, and synthesizing findings.",
      argsSchema: {
        question: z
          .string()
          .describe("The question to investigate (e.g., 'Which Oregon counties had the most wildfires in 2020?')"),
        domain: domainArg,
      },
    },
    ({ question, domain }) => ({
      messages: [
        msg(
          "user",
          `Investigate this question using open data from ${domain}: "${question}"

Follow this workflow:

1. Break the question down — what data do you need? What columns, filters, and aggregations?

2. Search for relevant datasets on ${domain}. You may need multiple datasets.

3. For each relevant dataset, check the schema to confirm it has the columns you need.

4. Build and run queries to answer the question. Start simple, then refine:
   - First query: verify the data exists and looks right
   - Second query: get the core answer with appropriate filters and aggregations
   - Third query: get supporting context (trends, comparisons, breakdowns)

5. Present your findings:
   - Direct answer to the question with specific numbers
   - Supporting evidence and context
   - Caveats — what the data doesn't tell us
   - Follow-up questions this raises

Show your work — include the dataset IDs and queries you used so findings are reproducible.`
        ),
      ],
    })
  );

  // ── 5. Analyze Trends ──

  server.registerPrompt(
    "analyze_trends",
    {
      description:
        "Analyze how a metric has changed over time in a dataset. " +
        "Identifies trends, patterns, and notable changes.",
      argsSchema: {
        domain: domainArg,
        dataset_id: z
          .string()
          .describe("Dataset identifier (e.g., 'fbwv-q84y')"),
        metric: z
          .string()
          .describe("What to measure (e.g., 'fire count', 'total acres burned', 'average salary')"),
        time_column: z
          .string()
          .describe("Column name containing dates or years (e.g., 'fireyear', 'fiscal_year', 'registry_date')"),
      },
    },
    ({ domain, dataset_id, metric, time_column }) => ({
      messages: [
        msg(
          "user",
          `Analyze the trend of "${metric}" over time in dataset ${dataset_id} on ${domain}, using the ${time_column} column.

Follow this workflow:

1. Call get_dataset_schema to confirm the time column and identify the right numeric/categorical columns for measuring "${metric}".

2. Run a yearly aggregation query — GROUP BY the time column, with appropriate aggregations (COUNT, SUM, AVG) for "${metric}". Order by time ascending.

3. If the data supports it, break it down further:
   - By a second dimension (e.g., by county, by category, by type)
   - Top values for the most recent period vs. earliest period

4. Present the analysis:
   - The overall trend — is "${metric}" going up, down, or stable?
   - The magnitude of change (percent change from start to end)
   - Any notable spikes, dips, or turning points — what years stand out?
   - Breakdown by subcategory if available — which segments drive the trend?
   - The most recent data point and how it compares to the historical average`
        ),
      ],
    })
  );
}
