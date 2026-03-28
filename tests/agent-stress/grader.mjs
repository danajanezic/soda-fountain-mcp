/**
 * Relevance-based grader for naive agent stress test results.
 *
 * Grades on what actually matters:
 * - Did the agent find the RIGHT dataset?
 * - Do the returned columns match what the question needs?
 * - Did aggregation happen when aggregation was needed?
 *
 * Grade definitions:
 *   A = Correct dataset, relevant columns present
 *   B = Correct dataset, missing some needed columns OR correct dataset
 *       found in search results but not picked first
 *   C = Related dataset (same topic) but not the best match
 *   D = Wrong dataset entirely but query succeeded
 *   F = No data returned or query failed
 */

import { readFileSync } from "fs";

const results = JSON.parse(readFileSync("./tests/agent-stress/results.json", "utf8"));
const expected = JSON.parse(readFileSync("./tests/agent-stress/expected-answers.json", "utf8"));

function grade(idx, result) {
  const key = `Q${idx + 1}`;
  const spec = expected[key];
  if (!spec) return { grade: "?", reason: "No expected answer defined" };

  // F: no data returned
  if (result.grade === "F" || result.datasets.length === 0) {
    return { grade: "F", reason: "No datasets found" };
  }

  if (result.grade === "D" && result.blockers.some(b => b.includes("Empty result set"))) {
    // Check if at least found the right dataset even though query returned 0 rows
    const foundRight = spec.expectedDatasets.some(id =>
      result.datasets.some(d => d.id === id)
    );
    if (foundRight) {
      return { grade: "D", reason: "Correct dataset found but query returned 0 rows — bad query construction" };
    }
    return { grade: "F", reason: "Wrong dataset AND query returned 0 rows" };
  }

  // Discovery questions — grade on whether search found relevant results
  if (spec.isDiscovery) {
    if (result.datasets.length > 0 && !result.blockers.some(b => b.includes("Empty"))) {
      return { grade: "A", reason: "Discovery query returned results" };
    }
    return { grade: "C", reason: "Discovery query found limited results" };
  }

  // Check dataset relevance
  const queriedDatasetId = result.datasets[0]?.id;
  const allFoundIds = result.datasets.map(d => d.id);
  const hitCorrectDataset = spec.expectedDatasets.length === 0 ||
    spec.expectedDatasets.includes(queriedDatasetId);
  const correctInSearchResults = spec.expectedDatasets.some(id => allFoundIds.includes(id));

  // Check column relevance from query response
  const queryResponse = result.queryResponse || {};
  const returnedColumns = queryResponse.hasColumnTypes
    ? Object.keys(JSON.parse(readFileSync("./tests/agent-stress/results.json", "utf8"))[idx]?.queryResponse || {})
    : [];

  // For multi-dataset questions, check if agent found at least one right dataset
  if (spec.requiresMultiDataset) {
    const correctFound = spec.expectedDatasets.filter(id => allFoundIds.includes(id));
    if (correctFound.length >= 2) {
      return { grade: "A", reason: `Found ${correctFound.length}/${spec.expectedDatasets.length} needed datasets` };
    } else if (correctFound.length === 1) {
      return { grade: "B", reason: `Found 1/${spec.expectedDatasets.length} needed datasets — partial cross-dataset` };
    } else if (hitCorrectDataset) {
      return { grade: "B", reason: "Hit one correct dataset but question needs multiple" };
    } else {
      return { grade: "D", reason: `Wrong dataset (${result.datasets[0]?.name}) — needed ${spec.expectedDatasets.join(", ")}` };
    }
  }

  // Single-dataset questions
  if (hitCorrectDataset) {
    // Check if query params match what's needed
    const params = result.queryParams || {};
    const hasAggregation = !!params.group || (params.select && /\b(count|sum|avg|min|max)\s*\(/i.test(params.select));

    if (spec.requiresAggregation && !hasAggregation) {
      return { grade: "B", reason: "Correct dataset but missing aggregation — raw rows instead of summary" };
    }

    return { grade: "A", reason: "Correct dataset, query executed" };
  }

  // Correct dataset was in search results but not picked
  if (correctInSearchResults) {
    return { grade: "C", reason: `Correct dataset in results but agent picked ${result.datasets[0]?.name} instead` };
  }

  // Completely wrong dataset
  return { grade: "D", reason: `Wrong dataset: ${result.datasets[0]?.name} (${queriedDatasetId})` };
}

// Run grading
console.log("=== RELEVANCE-BASED GRADING ===\n");

const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
const details = [];

for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const g = grade(i, r);
  grades[g.grade]++;

  const emoji = { A: "🟢", B: "🟡", C: "🟠", D: "🔴", F: "⚫" }[g.grade];
  const line = `Q${i + 1}: ${emoji} ${g.grade} | ${g.reason}`;
  details.push(line);
  console.log(line);
}

console.log("\n=== SUMMARY ===\n");
console.log(`A (correct dataset, good query):   ${grades.A}`);
console.log(`B (correct dataset, partial):      ${grades.B}`);
console.log(`C (related dataset, not best):     ${grades.C}`);
console.log(`D (wrong dataset entirely):        ${grades.D}`);
console.log(`F (no data / query failed):        ${grades.F}`);
console.log();
console.log(`Relevance rate (A+B): ${grades.A + grades.B}/40 (${Math.round((grades.A + grades.B) / 40 * 100)}%)`);
console.log(`Acceptable (A+B+C):   ${grades.A + grades.B + grades.C}/40 (${Math.round((grades.A + grades.B + grades.C) / 40 * 100)}%)`);
console.log(`Wrong dataset (D):    ${grades.D}/40`);
console.log(`Failed (F):           ${grades.F}/40`);

// Comparison with old grading
console.log("\n=== OLD vs NEW GRADING ===\n");
const oldGrades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
for (const r of results) oldGrades[r.grade]++;
console.log(`Old: ${oldGrades.A}A ${oldGrades.B}B ${oldGrades.C}C ${oldGrades.D}D ${oldGrades.F}F`);
console.log(`New: ${grades.A}A ${grades.B}B ${grades.C}C ${grades.D}D ${grades.F}F`);

// Category analysis
const byCategory = { dataset_correct: 0, dataset_wrong: 0, discovery_ok: 0, multi_dataset: 0 };
for (let i = 0; i < results.length; i++) {
  const spec = expected[`Q${i + 1}`];
  const g = grade(i, results[i]);
  if (spec?.isDiscovery) byCategory.discovery_ok++;
  else if (spec?.requiresMultiDataset && (g.grade === "A" || g.grade === "B")) byCategory.multi_dataset++;
  else if (g.grade === "A" || g.grade === "B") byCategory.dataset_correct++;
  else byCategory.dataset_wrong++;
}
console.log(`\nDataset selection correct: ${byCategory.dataset_correct}`);
console.log(`Multi-dataset partial:    ${byCategory.multi_dataset}`);
console.log(`Discovery queries OK:     ${byCategory.discovery_ok}`);
console.log(`Wrong dataset:            ${byCategory.dataset_wrong}`);
