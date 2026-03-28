/**
 * Programmatic "naive agent" that simulates how an LLM would use the MCP tools.
 *
 * For each question it:
 * 1. Extracts keywords from the question
 * 2. Decides which domain(s) to search
 * 3. Searches for datasets
 * 4. Picks the best match
 * 5. Gets the schema
 * 6. Builds a query based on the schema and question
 * 7. Executes the query
 * 8. Reports results
 *
 * The "naive" part: it uses simple keyword extraction and heuristics,
 * not domain knowledge. It only knows what the tools return.
 */

import {
  listDomains, getDomainCategories, searchDatasets,
  getDatasetSchema, queryDataset
} from "./tool-harness.mjs";

const questions = JSON.parse(
  (await import("fs")).readFileSync("./tests/agent-stress/questions.json", "utf8")
);

// Simple keyword extractor — mimics what an LLM would pick from a question
function extractKeywords(question) {
  const stopWords = new Set([
    "which", "what", "how", "find", "the", "are", "is", "has", "have", "does",
    "did", "do", "and", "or", "for", "in", "on", "of", "to", "a", "an", "by",
    "that", "this", "with", "from", "most", "all", "each", "every", "many",
    "between", "across", "about", "been", "there", "their", "them", "they",
    "than", "both", "its", "not", "but", "can", "could", "would", "should",
    "using", "used", "use", "build", "compare", "calculate", "identify",
    "show", "list", "get", "see", "tell", "give", "also", "been", "being",
  ]);

  const words = question.toLowerCase()
    .replace(/[?.,!—–\-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)].slice(0, 4);
}

// Detect if question mentions specific domains
function detectDomains(question) {
  const q = question.toLowerCase();
  const domains = [];
  if (q.includes("oregon")) domains.push("data.oregon.gov");
  if (q.includes("washington")) domains.push("data.wa.gov");
  if (q.includes("colorado")) domains.push("data.colorado.gov");
  if (q.includes("new york") || q.includes("nyc")) domains.push("data.cityofnewyork.us");
  if (q.includes("all") && (q.includes("portal") || q.includes("socrata"))) return "all";
  if (domains.length === 0) domains.push("data.oregon.gov"); // default
  return domains;
}

// Simple query builder based on schema and question keywords
function buildQuery(question, schema) {
  const q = question.toLowerCase();
  const columns = schema.columns || [];
  const colNames = columns.map(c => c.fieldName);
  const numericCols = columns.filter(c => c.type === "number").map(c => c.fieldName);
  const textCols = columns.filter(c => c.type === "text").map(c => c.fieldName);
  const dateCols = columns.filter(c => c.type === "calendar_date").map(c => c.fieldName);

  const params = { limit: 20 };

  // Detect aggregation patterns
  const wantsCount = q.includes("count") || q.includes("how many") || q.includes("number of") || q.includes("frequency");
  const wantsAvg = q.includes("average") || q.includes("avg") || q.includes("mean");
  const wantsMax = q.includes("highest") || q.includes("largest") || q.includes("most") || q.includes("top") || q.includes("biggest");
  const wantsMin = q.includes("lowest") || q.includes("smallest") || q.includes("least") || q.includes("fewest");
  const wantsTrend = q.includes("trend") || q.includes("over time") || q.includes("year") || q.includes("change") || q.includes("growth");
  const wantsGroupBy = q.includes("by county") || q.includes("by city") || q.includes("by agency") || q.includes("per county") || q.includes("per city") || q.includes("by type") || q.includes("broken down");

  // Find a grouping column
  let groupCol = null;
  if (q.includes("county") && colNames.some(c => c.includes("county"))) {
    groupCol = colNames.find(c => c.includes("county"));
  } else if (q.includes("city") && colNames.some(c => c.includes("city"))) {
    groupCol = colNames.find(c => c.includes("city"));
  } else if (q.includes("agency") && colNames.some(c => c.includes("agency"))) {
    groupCol = colNames.find(c => c.includes("agency"));
  } else if (q.includes("type") && colNames.some(c => c.includes("type"))) {
    groupCol = colNames.find(c => c.includes("type"));
  } else if (q.includes("year") && colNames.some(c => c.includes("year"))) {
    groupCol = colNames.find(c => c.includes("year"));
  } else if (q.includes("cause") && colNames.some(c => c.includes("cause"))) {
    groupCol = colNames.find(c => c.includes("cause"));
  } else if (q.includes("vendor") && colNames.some(c => c.includes("vendor"))) {
    groupCol = colNames.find(c => c.includes("vendor"));
  }

  // Build query based on detected patterns
  if (groupCol && (wantsCount || wantsAvg || wantsMax)) {
    params.group = groupCol;
    const aggParts = [groupCol];
    if (wantsCount) aggParts.push("count(*) as cnt");
    if (wantsAvg && numericCols.length > 0) aggParts.push(`avg(${numericCols[0]}) as avg_val`);
    if (wantsMax && numericCols.length > 0) aggParts.push(`max(${numericCols[0]}) as max_val`);
    if (wantsMin && numericCols.length > 0) aggParts.push(`min(${numericCols[0]}) as min_val`);
    if (!wantsCount && !wantsAvg && !wantsMax && !wantsMin) aggParts.push("count(*) as cnt");
    params.select = aggParts.join(", ");
    params.order = aggParts[aggParts.length - 1].split(" as ")[1] + " DESC";
  } else if (wantsMax && numericCols.length > 0) {
    // Top N by a numeric column
    const selCols = colNames.slice(0, 5).join(", ");
    params.select = selCols;
    params.order = numericCols[0] + " DESC";
    params.where = numericCols[0] + " IS NOT NULL";
    params.limit = 10;
  } else if (wantsTrend && dateCols.length > 0) {
    // Time-based aggregation
    const yearCol = colNames.find(c => c.includes("year")) || dateCols[0];
    params.select = `${yearCol}, count(*) as cnt`;
    params.group = yearCol;
    params.order = yearCol + " ASC";
  } else {
    // Default: select a few columns
    params.select = colNames.slice(0, 5).join(", ");
    params.limit = 10;
  }

  // Add where filters for specific keywords in question
  const filters = [];
  if (q.includes("portland") && colNames.some(c => c.includes("city"))) {
    filters.push(`${colNames.find(c => c.includes("city"))}='PORTLAND'`);
  }
  if (q.includes("klamath") && colNames.some(c => c.includes("county"))) {
    filters.push(`${colNames.find(c => c.includes("county"))}='Klamath'`);
  }
  if (q.includes("multnomah") && colNames.some(c => c.includes("county"))) {
    filters.push(`${colNames.find(c => c.includes("county"))}='Multnomah'`);
  }
  if (q.includes("2024") && colNames.some(c => c.includes("date"))) {
    filters.push(`${colNames.find(c => c.includes("date"))} > '2024-01-01'`);
  }
  if (q.includes("2023") && colNames.some(c => c.includes("year"))) {
    filters.push(`${colNames.find(c => c.includes("year"))}='2023'`);
  }
  if (q.includes("before 1950") && colNames.some(c => c.includes("date"))) {
    filters.push(`${colNames.find(c => c.includes("date"))} < '1950-01-01'`);
  }
  if (q.includes("100 acres") && colNames.some(c => c.includes("acres"))) {
    filters.push(`${colNames.find(c => c.includes("acres"))} > 100`);
  }
  if (q.includes("full-time") && colNames.some(c => c.includes("full") || c.includes("time"))) {
    const col = colNames.find(c => c.includes("full") && c.includes("part") || c.includes("full_part"));
    if (col) filters.push(`${col}='FULL TIME'`);
  }
  if (q.includes("cannabis") || q.includes("marijuana")) {
    params.search = "cannabis marijuana";
  }
  if (q.includes("nonprofit") && colNames.some(c => c.includes("type"))) {
    const typeCol = colNames.find(c => c.includes("type") && c.includes("entity") || c === "entity_type");
    if (typeCol) filters.push(`${typeCol} LIKE '%NONPROFIT%'`);
  }

  if (filters.length > 0) {
    params.where = params.where ? params.where + " AND " + filters.join(" AND ") : filters.join(" AND ");
  }

  return params;
}

// Run one question
async function runQuestion(idx, question) {
  const result = {
    question,
    toolsCalled: [],
    toolCalls: 0,
    answer: null,
    blockers: [],
    grade: "F",
    datasets: [],
    queryParams: null,
    queryResponse: null,
    preflightCaught: false,
  };

  try {
    const domains = detectDomains(question);
    const keywords = extractKeywords(question);

    // Step 1: Search for datasets
    const domainsToSearch = domains === "all"
      ? (await listDomains()).domains.map(d => d.domain)
      : domains;

    if (domains === "all") {
      result.toolsCalled.push("listDomains");
      result.toolCalls++;
    }

    let allDatasets = [];
    for (const domain of domainsToSearch.slice(0, 3)) { // cap at 3 domains
      for (const kw of keywords.slice(0, 2)) { // try top 2 keywords
        try {
          const searchResult = await searchDatasets(domain, kw);
          result.toolsCalled.push("searchDatasets");
          result.toolCalls++;
          if (searchResult.results?.length > 0) {
            allDatasets.push(...searchResult.results.map(d => ({...d, domain})));
          }
        } catch(e) {
          // search failed, continue
        }
      }
    }

    // Deduplicate by id
    const seen = new Set();
    allDatasets = allDatasets.filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    result.datasets = allDatasets.map(d => ({ id: d.id, name: d.name, domain: d.domain }));

    if (allDatasets.length === 0) {
      result.blockers.push("No datasets found for keywords: " + keywords.join(", "));
      result.grade = "F";
      return result;
    }

    // Step 2: Get schema for best match
    const bestDataset = allDatasets[0];
    let schema;
    try {
      schema = await getDatasetSchema(bestDataset.domain, bestDataset.id);
      result.toolsCalled.push("getDatasetSchema");
      result.toolCalls++;
    } catch(e) {
      result.blockers.push("Schema fetch failed: " + String(e));
      result.grade = "D";
      return result;
    }

    // Step 3: Build and execute query
    const queryParams = buildQuery(question, schema);
    result.queryParams = queryParams;

    try {
      const qr = await queryDataset(bestDataset.domain, bestDataset.id, queryParams);
      result.toolsCalled.push("queryDataset");
      result.toolCalls++;

      if (qr.isError) {
        result.blockers.push("Query error: " + (qr.code || qr.message || JSON.stringify(qr).slice(0, 200)));
        result.preflightCaught = qr.code === "QUERY_VALIDATION_FAILED";
        result.grade = "D";

        // If it's a validation error, try a simpler query
        if (qr.code === "QUERY_VALIDATION_FAILED" || qr.code === "BAD_QUERY") {
          const simpleParams = { select: schema.columns.slice(0, 3).map(c => c.fieldName).join(", "), limit: 5 };
          const retry = await queryDataset(bestDataset.domain, bestDataset.id, simpleParams);
          result.toolsCalled.push("queryDataset");
          result.toolCalls++;
          if (!retry.isError && retry.results?.length > 0) {
            result.answer = `Partial: got ${retry.results.length} rows with fallback query`;
            result.grade = "C";
          }
        }
        return result;
      }

      const rows = qr.results?.length ?? 0;
      const truncated = qr.metadata?.truncated ?? false;
      const hasNumericSummary = !!qr.metadata?.numericSummary;
      const hasColumnTypes = !!qr.metadata?.columnTypes;

      result.queryResponse = {
        rowsReturned: rows,
        truncated,
        hasNumericSummary,
        hasColumnTypes,
        hasNullCounts: !!qr.metadata?.nullCounts,
        notice: qr.notice || null,
      };

      if (rows > 0) {
        result.answer = `Got ${rows} rows from ${bestDataset.name}` +
          (truncated ? " (truncated)" : "") +
          (hasNumericSummary ? " with numeric summaries" : "") +
          (hasColumnTypes ? " with type hints" : "");

        // Grade based on how well the data answers the question
        const q = question.toLowerCase();
        const needsMultiDataset = q.includes("compare") || q.includes("ratio") || q.includes("cross-reference") || q.includes("correlation") || q.includes("vs ");
        const needsMultiDomain = domainsToSearch.length > 1;

        if (needsMultiDataset && allDatasets.length < 2) {
          result.grade = "C"; // needed multiple datasets, only used one
          result.blockers.push("Question requires cross-dataset analysis but only queried one dataset");
        } else if (needsMultiDomain && domainsToSearch.length > 1) {
          result.grade = rows > 0 ? "B" : "C"; // cross-domain worked but may be incomplete
        } else {
          result.grade = truncated ? "B" : "A";
        }
      } else {
        result.answer = "Query returned 0 rows";
        result.grade = "D";
        result.blockers.push("Empty result set");
      }

    } catch(e) {
      result.blockers.push("Query execution failed: " + String(e));
      result.grade = "D";
    }

  } catch(e) {
    result.blockers.push("Unexpected error: " + String(e));
    result.grade = "F";
  }

  return result;
}

// Run all questions
console.log("Running 40 questions through naive agent...\n");

const results = [];
for (let i = 0; i < questions.length; i++) {
  const r = await runQuestion(i + 1, questions[i]);
  results.push(r);
  const gradeEmoji = { A: "🟢", B: "🟡", C: "🟠", D: "🔴", F: "⚫" }[r.grade];
  console.log(`Q${i+1}: ${gradeEmoji} ${r.grade} | ${r.toolCalls} calls | ${r.answer || r.blockers[0] || "no answer"}`);
}

// Summary
console.log("\n=== SUMMARY ===\n");

const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
let totalCalls = 0;
let preflightCatches = 0;
let enrichmentHits = 0;

for (const r of results) {
  grades[r.grade]++;
  totalCalls += r.toolCalls;
  if (r.preflightCaught) preflightCatches++;
  if (r.queryResponse?.hasNumericSummary) enrichmentHits++;
  if (r.queryResponse?.hasColumnTypes) enrichmentHits++;
}

console.log("GRADES:");
console.log(`  A (fully answered):     ${grades.A}`);
console.log(`  B (mostly answered):    ${grades.B}`);
console.log(`  C (partial answer):     ${grades.C}`);
console.log(`  D (found data, stuck):  ${grades.D}`);
console.log(`  F (no data found):      ${grades.F}`);
console.log(`  Pass rate (A+B):        ${grades.A + grades.B}/40 (${Math.round((grades.A + grades.B) / 40 * 100)}%)`);
console.log(`  Partial+ rate (A+B+C):  ${grades.A + grades.B + grades.C}/40 (${Math.round((grades.A + grades.B + grades.C) / 40 * 100)}%)`);
console.log();
console.log("EFFICIENCY:");
console.log(`  Total tool calls:       ${totalCalls}`);
console.log(`  Avg calls per question: ${(totalCalls / 40).toFixed(1)}`);
console.log(`  Preflight catches:      ${preflightCatches} (bad queries caught before API)`);
console.log(`  Enrichment hits:        ${enrichmentHits} (responses with type hints/numeric summaries)`);
console.log();

// Blockers analysis
const blockerTypes = {};
for (const r of results) {
  for (const b of r.blockers) {
    const type = b.split(":")[0];
    blockerTypes[type] = (blockerTypes[type] || 0) + 1;
  }
}
console.log("BLOCKERS:");
for (const [type, count] of Object.entries(blockerTypes).sort((a,b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}

// Output full results as JSON
const fs = await import("fs");
fs.writeFileSync("./tests/agent-stress/results.json", JSON.stringify(results, null, 2));
console.log("\nFull results written to tests/agent-stress/results.json");
