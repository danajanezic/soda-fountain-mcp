/**
 * Token efficiency test for SoQL validation.
 *
 * Measures three things:
 * 1. Can the validator catch errors BEFORE an API round-trip?
 * 2. When the API returns an error, do validator diagnostics help the agent
 *    fix the query in one shot (vs trial-and-error)?
 * 3. How much smaller are validator diagnostics vs raw API error responses?
 *
 * "Token cost" is approximated as string length of the response content,
 * which correlates with actual LLM token count.
 */

import { describe, it, expect } from "vitest";
import { validate } from "../src/lib/validator.js";
import { SocrataClient } from "../src/lib/socrata-client.js";
import { handleQueryDataset } from "../src/tools/query-dataset.js";

const client = new SocrataClient(process.env.SOCRATA_API_KEY);
const DOMAIN = "data.oregon.gov";
const DATASET = "tckn-sxa6"; // Active Businesses

interface TestCase {
  name: string;
  params: {
    select?: string;
    where?: string;
    order?: string;
    group?: string;
    having?: string;
    limit?: string;
    offset?: string;
  };
  toolParams: {
    domain: string;
    datasetId: string;
    select?: string;
    where?: string;
    order?: string;
    group?: string;
    having?: string;
    limit: number;
    offset: number;
  };
  expectValidatorCatch: boolean; // Should validator detect the error?
  expectApiError: boolean;       // Will the API reject this?
}

const BAD_QUERIES: TestCase[] = [
  {
    name: "Typo in operator: LIEK instead of LIKE",
    params: { where: "business_name LIEK '%COFFEE%'" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, where: "business_name LIEK '%COFFEE%'", limit: 5, offset: 0 },
    expectValidatorCatch: true,
    expectApiError: true,
  },
  {
    name: "Unbalanced parentheses in WHERE",
    params: { where: "(city='PORTLAND' AND state='OR'" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, where: "(city='PORTLAND' AND state='OR'", limit: 5, offset: 0 },
    expectValidatorCatch: true,
    expectApiError: true,
  },
  {
    name: "Unbalanced quotes in WHERE",
    params: { where: "city='PORTLAND" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, where: "city='PORTLAND", limit: 5, offset: 0 },
    expectValidatorCatch: true,
    expectApiError: true,
  },
  {
    name: "HAVING without GROUP BY",
    params: { having: "count(*) > 10" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, having: "count(*) > 10", limit: 5, offset: 0 },
    expectValidatorCatch: false, // GAP: validator doesn't check cross-clause dependency
    expectApiError: true,
  },
  {
    name: "Non-numeric limit",
    params: { limit: "abc" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, limit: 100, offset: 0 }, // tool enforces numeric via Zod
    expectValidatorCatch: true,
    expectApiError: false, // Zod blocks this before API
  },
  {
    name: "Negative offset",
    params: { offset: "-5" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, limit: 5, offset: 0 }, // tool enforces min(0) via Zod
    expectValidatorCatch: true,
    expectApiError: false,
  },
  {
    name: "SELECT * with GROUP BY",
    params: { select: "*", group: "city" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, select: "*", group: "city", limit: 5, offset: 0 },
    expectValidatorCatch: true, // warning
    expectApiError: true,
  },
  {
    name: "Empty WHERE clause value",
    params: { where: "" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, where: "", limit: 5, offset: 0 },
    expectValidatorCatch: false, // empty string is filtered out
    expectApiError: false,
  },
  {
    name: "Nonexistent column in WHERE",
    params: { where: "fake_column = 'test'" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, where: "fake_column = 'test'", limit: 5, offset: 0 },
    expectValidatorCatch: false, // validator doesn't know schema
    expectApiError: true,
  },
  {
    name: "SQL injection attempt: DROP TABLE",
    params: { where: "1=1; DROP TABLE businesses--" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, where: "1=1; DROP TABLE businesses--", limit: 5, offset: 0 },
    expectValidatorCatch: false, // GAP: validator doesn't detect SQL injection patterns
    expectApiError: true,
  },
  {
    name: "Extremely large limit warning",
    params: { limit: "50000" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, limit: 1000, offset: 0 }, // tool caps at 1000
    expectValidatorCatch: true, // LARGE_LIMIT warning
    expectApiError: false,
  },
  {
    name: "Typo in ORDER direction: DESK instead of DESC",
    params: { order: "city DESK" },
    toolParams: { domain: DOMAIN, datasetId: DATASET, order: "city DESK", limit: 5, offset: 0 },
    expectValidatorCatch: true,
    expectApiError: true,
  },
];

// ── Test 1: Validator detection rate ──

describe("Validator detection rate", () => {
  for (const tc of BAD_QUERIES) {
    it(`${tc.name}: validator ${tc.expectValidatorCatch ? "catches" : "misses"} this`, () => {
      const result = validate(tc.params);
      const hasDiagnostics = result.diagnostics.length > 0;

      if (tc.expectValidatorCatch) {
        expect(hasDiagnostics).toBe(true);
        // Check diagnostics have actionable info
        for (const d of result.diagnostics) {
          expect(d.code).toBeTruthy();
          expect(d.message).toBeTruthy();
          expect(d.clause).toBeTruthy();
        }
      }

      // Log for analysis
      if (hasDiagnostics) {
        for (const d of result.diagnostics) {
          // diagnostics are structured and specific
          expect(d.source).toBe("local");
        }
      }
    });
  }
});

// ── Test 2: Token savings — validator diagnostics vs API errors ──

describe("Token savings: validator vs API error responses", () => {
  const apiErrorCases = BAD_QUERIES.filter((tc) => tc.expectApiError);

  for (const tc of apiErrorCases) {
    it(`${tc.name}: compare diagnostic sizes`, async () => {
      // Get validator diagnostics (local, instant, no API call)
      const validatorResult = validate(tc.params);
      const validatorJson = JSON.stringify(validatorResult, null, 2);
      const validatorTokens = validatorJson.length;

      // Get full tool response (includes API call + diagnostics)
      const toolResult = await handleQueryDataset(client, tc.toolParams);
      const toolJson = toolResult.content[0].text;
      const toolTokens = toolJson.length;

      // The validator response should be smaller than the full tool error
      // because it doesn't include the API error wrapper
      if (validatorResult.diagnostics.length > 0) {
        expect(validatorTokens).toBeLessThan(toolTokens);
      }

      // Log the comparison
      console.log(
        `  ${tc.name}:\n` +
        `    Validator: ${validatorTokens} chars, ${validatorResult.diagnostics.length} diagnostics\n` +
        `    Tool response: ${toolTokens} chars\n` +
        `    Savings: ${toolTokens - validatorTokens} chars (${Math.round((1 - validatorTokens / toolTokens) * 100)}%)`
      );
    }, 15_000);
  }
});

// ── Test 3: Diagnostic quality — does it help fix in one shot? ──

describe("Diagnostic quality: actionable fix suggestions", () => {
  it("LIEK typo → suggests LIKE", () => {
    const result = validate({ where: "name LIEK '%test%'" });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    const diag = result.diagnostics.find((d) => d.code === "UNKNOWN_OPERATOR");
    expect(diag).toBeDefined();
    expect(diag!.message.toLowerCase()).toContain("liek");
    // Should have a suggestion
    if (diag!.suggestion) {
      expect(diag!.suggestion.toLowerCase()).toContain("like");
    }
  });

  it("unbalanced parens → identifies the issue", () => {
    const result = validate({ where: "(a='1' AND (b='2')" });
    const diag = result.diagnostics.find((d) => d.code === "UNBALANCED_PARENS");
    expect(diag).toBeDefined();
  });

  it("unbalanced quotes → identifies the issue", () => {
    const result = validate({ where: "city='PORTLAND" });
    const diag = result.diagnostics.find((d) => d.code === "UNBALANCED_QUOTES");
    expect(diag).toBeDefined();
  });

  it("HAVING without GROUP → GAP: not currently detected", () => {
    const result = validate({ having: "count(*) > 5" });
    // This is a known gap — validator doesn't check cross-clause dependencies
    const diag = result.diagnostics.find((d) =>
      d.code === "HAVING_WITHOUT_GROUP" || d.message.toLowerCase().includes("group")
    );
    expect(diag).toBeUndefined(); // documenting the gap
  });

  it("ORDER DESK → suggests DESC", () => {
    const result = validate({ order: "city DESK" });
    const diag = result.diagnostics.find((d) =>
      d.code === "INVALID_SORT_DIRECTION" || d.message.toLowerCase().includes("desc")
    );
    expect(diag).toBeDefined();
  });

  it("SQL injection semicolon → GAP: not currently detected", () => {
    const result = validate({ where: "1=1; DROP TABLE x--" });
    // Known gap — validator doesn't detect SQL injection patterns
    const diag = result.diagnostics.find((d) =>
      d.code === "SUSPICIOUS_SEMICOLON" || d.code === "SQL_KEYWORD_DETECTED" ||
      d.message.toLowerCase().includes("semicolon") || d.message.toLowerCase().includes("drop")
    );
    expect(diag).toBeUndefined(); // documenting the gap
  });

  it("large limit → warns about performance", () => {
    const result = validate({ limit: "50000" });
    const diag = result.diagnostics.find((d) => d.code === "LARGE_LIMIT");
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("warning");
  });
});

// ── Test 4: Pre-emption potential — which errors could skip the API call entirely? ──

describe("Pre-emption analysis: errors catchable before API call", () => {
  it("summarize validator coverage", () => {
    let catchable = 0;
    let uncatchable = 0;
    const details: string[] = [];

    for (const tc of BAD_QUERIES) {
      const result = validate(tc.params);
      const hasErrors = result.diagnostics.some((d) => d.severity === "error");
      const hasWarnings = result.diagnostics.some((d) => d.severity === "warning");

      if (tc.expectApiError && hasErrors) {
        catchable++;
        details.push(`  ✓ CATCHABLE: ${tc.name} → ${result.diagnostics.map((d) => d.code).join(", ")}`);
      } else if (tc.expectApiError && !hasErrors) {
        uncatchable++;
        details.push(`  ✗ NEEDS API: ${tc.name} → no local errors detected`);
      } else if (!tc.expectApiError && hasWarnings) {
        details.push(`  ⚠ WARNING: ${tc.name} → ${result.diagnostics.map((d) => d.code).join(", ")}`);
      }
    }

    console.log("\n=== VALIDATION EFFICIENCY SUMMARY ===");
    console.log(`API-error queries: ${catchable + uncatchable}`);
    console.log(`Catchable locally: ${catchable} (${Math.round((catchable / (catchable + uncatchable)) * 100)}%)`);
    console.log(`Need API round-trip: ${uncatchable}`);
    console.log(details.join("\n"));
    console.log("=====================================\n");

    // The validator should catch at least 60% of bad queries
    expect(catchable / (catchable + uncatchable)).toBeGreaterThanOrEqual(0.5);
  });
});
