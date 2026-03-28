# Naive Agent Stress Test Analysis

## Methodology

40 complex questions tested through a programmatic "naive agent" that:
- Extracts keywords from the question (no domain knowledge)
- Searches for datasets using those keywords
- Picks the first matching dataset
- Reads the schema to understand columns
- Builds a query using simple heuristics
- Executes the query and grades the result

This simulates what an LLM would do with only our MCP tool descriptions — no prior knowledge of Oregon data, Socrata, or SoQL.

## Results Summary

| Metric | Value |
|--------|-------|
| **Questions tested** | 40 |
| **Pass rate (A+B)** | 38/40 (95%) |
| **Correct dataset found** | 24/35 gradeable (69%) |
| **Wrong dataset picked** | 11/35 (31%) |
| **Total tool calls** | 173 |
| **Avg calls per question** | 4.3 |
| **Preflight validation catches** | 0 |

## The Headline Problem

**95% pass rate is a lie.** The agent gets data back 95% of the time, but 31% of the time it's the **wrong dataset**. The MCP tools successfully return results — but they don't help the agent find the *right* results.

### Wrong Dataset Examples

| Question | Expected Dataset | Got Instead |
|----------|-----------------|-------------|
| "Oregon wildfire % by cause/county" | Fire Occurrence Data | Medicaid Fee-for-Service Rates |
| "Which counties have wildfires AND businesses" | Fire + Businesses | Oregon InC |
| "Average Portland business age" | Active Businesses | Workers' Comp Indemnity Data |
| "Seasonal wildfire patterns" | Fire Occurrence Data | ODF Contingency Support Positions |
| "Largest wildfire per county" | Fire Occurrence Data | Budgeted Revenue |
| "UCC filing growth rate" | UCC Filings | Salaries Report |
| "Most common business names" | Active Businesses | Library Statistics |

### Root Cause

The **search_datasets** tool returns results ranked by Socrata's relevance algorithm, which often prioritizes recently updated or popular datasets over the best semantic match. The naive agent picks the first result — and the first result is frequently wrong.

An LLM would do better than the naive agent's keyword extraction (it would understand "wildfire" means fire data, not "fire season staffing"). But the search results themselves are the bottleneck — even perfect keywords often return irrelevant datasets in the top position.

## LLM-First Design Principle Assessment

### What Worked Well

| Feature | Assessment |
|---------|-----------|
| **Column types in responses** | Delivered 100% of the time (38/38). Eliminates need for separate schema call on query results. |
| **Truncation warnings** | Delivered 92% (35/38). Agents know when to paginate. |
| **Numeric summaries** | Delivered 55% (21/38). Helps agents contextualize values without computing stats. |
| **Notices** | Delivered 97% (37/38). Clear signals on empty/truncated results. |
| **Schema-aware validation** | No bad queries reached the API (0 preflight catches needed — the naive agent's heuristics happened to build valid SoQL). |
| **Tool workflow** | The discover→schema→query pattern worked every time. No agent got stuck on "what do I do next?" |

### What Needs Improvement

| Issue | Impact | Potential Fix |
|-------|--------|---------------|
| **Search relevance** | 31% wrong dataset — biggest problem | Add dataset descriptions to search results; improve keyword matching; rank by column name relevance |
| **No cross-dataset support** | Questions needing 2+ datasets (Q1, Q7, Q9, Q16, Q39, Q40) can only query one at a time | Add a "related datasets" hint in search results; or a `find_related_datasets` tool |
| **Single search keyword** | Agent extracts keywords poorly; searching "wildfire" misses "fire occurrence" | MCP could expand search terms or return more results with diversity |
| **No feedback loop** | When wrong dataset is picked, agent has no signal it's wrong until results don't make sense | Include dataset description snippet in query response metadata |

### The Core Tension

The MCP's **output enrichments** (column types, numeric summaries, truncation warnings) are excellent — they serve the LLM exactly what it needs to present data to humans. But the MCP's **discovery layer** (search_datasets) is the weak link. The tools help the LLM *use* data well, but don't help it *find the right data* reliably.

## Recommendations for LLM-First Improvement

1. **Boost search with column-name matching** — if the question mentions "salary" and a dataset has a `salary` column, rank it higher than one that just mentions "salary" in its description.

2. **Return more search context** — include column names in search results so the agent can evaluate relevance without a separate schema call.

3. **Add dataset relevance hints** — after a query, include "this dataset is about: [description]" in the response so the agent can sanity-check whether it queried the right data.

4. **Multi-dataset query planning** — for questions that inherently need multiple datasets (comparisons, ratios, cross-references), provide a tool or hint that identifies dataset pairs that share join keys.
