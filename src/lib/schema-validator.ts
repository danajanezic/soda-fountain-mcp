/**
 * Schema-aware SoQL validation targeting mistakes LLMs actually make.
 *
 * Unlike the syntax validator (which catches human typos), this catches:
 * - Wrong column names (with fuzzy suggestions)
 * - SQL habits that don't work in SoQL (FROM, JOIN, DISTINCT, subqueries)
 * - Cross-clause logic errors (HAVING without GROUP BY)
 * - Type confusion (= NULL vs IS NULL)
 */

import type { ColumnDef, Diagnostic } from "./types.js";

interface SchemaValidationParams {
  select?: string;
  where?: string;
  order?: string;
  group?: string;
  having?: string;
  search?: string;
}

/** Extract identifiers that look like column references from a SoQL clause. */
function extractColumnRefs(clause: string): string[] {
  // Remove string literals so we don't match column names inside quotes
  const noStrings = clause.replace(/'[^']*'/g, "''");

  // Remove known SoQL functions and keywords
  const cleaned = noStrings
    .replace(/\b(count|sum|avg|min|max|stddev_pop|stddev_samp|regr_slope|regr_intercept|regr_r2)\s*\(/gi, "(")
    .replace(/\b(upper|lower|unaccent|starts_with|date_extract_\w+|date_trunc_\w+|ln|greatest|least|num_points|simplify|simplify_preserve_topology|extent|convex_hull|distance_in_meters|within_box|within_circle|within_polygon|intersects)\s*\(/gi, "(")
    .replace(/\b(AND|OR|NOT|IS|NULL|LIKE|IN|BETWEEN|ASC|DESC|AS|TRUE|FALSE|CASE|WHEN|THEN|ELSE|END)\b/gi, " ")
    .replace(/[(),:*><=!+\-/|]/g, " ");

  // Extract remaining identifiers (not numbers, not quoted)
  const tokens = cleaned.split(/\s+/).filter((t) => t && /^[a-z_][a-z0-9_]*$/i.test(t));

  // Remove aliases (word after AS)
  const original = clause.replace(/'[^']*'/g, "''");
  const aliasPattern = /\bAS\s+(\w+)/gi;
  const aliases = new Set<string>();
  let match;
  while ((match = aliasPattern.exec(original)) !== null) {
    aliases.add(match[1].toLowerCase());
  }

  return tokens.filter((t) => !aliases.has(t.toLowerCase()));
}

/** Simple Levenshtein distance for column name suggestions. */
function levenshtein(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 0;
  const m = al.length;
  const n = bl.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (al[i - 1] === bl[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function suggestColumn(ref: string, columns: ColumnDef[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const col of columns) {
    const d = levenshtein(ref, col.fieldName);
    if (d < bestDist && d <= 3) {
      bestDist = d;
      best = col.fieldName;
    }
  }
  return best;
}

/** Collect aliases defined in $select (e.g., "count(*) as total" → "total"). */
function collectAliases(select?: string): Set<string> {
  const aliases = new Set<string>();
  if (!select) return aliases;
  const pattern = /\bAS\s+(\w+)/gi;
  let match;
  while ((match = pattern.exec(select)) !== null) {
    aliases.add(match[1].toLowerCase());
  }
  return aliases;
}

export function validateWithSchema(
  params: SchemaValidationParams,
  columns: ColumnDef[]
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const colNames = new Set(columns.map((c) => c.fieldName.toLowerCase()));
  const aliases = collectAliases(params.select);

  // ── SQL habits that don't work in SoQL ──

  const allClauses = [params.select, params.where, params.order, params.group, params.having]
    .filter(Boolean)
    .join(" ");

  // FROM clause
  if (/\bFROM\s+\w/i.test(allClauses)) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "SQL_FROM_CLAUSE",
      clause: "$select",
      message: "SoQL does not use FROM clauses — the dataset is implicit from the API endpoint. Remove the FROM clause.",
      suggestion: "Remove 'FROM ...' from your query",
    });
  }

  // JOIN
  if (/\bJOIN\b/i.test(allClauses)) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "SQL_JOIN",
      clause: "$select",
      message: "SoQL does not support JOIN. Each dataset is queried independently via its own endpoint.",
      suggestion: "Query each dataset separately and combine results in your application",
    });
  }

  // DISTINCT (not supported as keyword)
  if (/\bDISTINCT\b/i.test(params.select ?? "")) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "SQL_DISTINCT",
      clause: "$select",
      message: "SoQL does not support DISTINCT in $select. Use $group to get unique values instead.",
      suggestion: "Use $group=column_name with $select=column_name to get distinct values",
    });
  }

  // Subqueries
  if (/\bSELECT\b/i.test(params.where ?? "")) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "SQL_SUBQUERY",
      clause: "$where",
      message: "SoQL does not support subqueries in $where.",
      suggestion: "Run the inner query first, then use the results in a second query",
    });
  }

  // Double-quoted identifiers (SQL habit, SoQL uses single quotes for strings)
  if (/"/.test(allClauses)) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "DOUBLE_QUOTES",
      clause: "$where",
      message: "SoQL uses single quotes for strings, not double quotes. Double-quoted identifiers are not supported.",
      suggestion: "Replace double quotes with single quotes for string values",
    });
  }

  // Backtick column names
  if (/`/.test(allClauses)) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "BACKTICK_IDENTIFIERS",
      clause: "$select",
      message: "SoQL does not support backtick-quoted identifiers. Use the column field name directly.",
      suggestion: "Remove backticks and use the column's fieldName from the schema",
    });
  }

  // ILIKE (Postgres habit)
  if (/\bILIKE\b/i.test(params.where ?? "")) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "SQL_ILIKE",
      clause: "$where",
      message: "SoQL does not support ILIKE. Use upper() or lower() with LIKE for case-insensitive matching.",
      suggestion: "Replace 'column ILIKE pattern' with 'upper(column) LIKE upper(pattern)'",
    });
  }

  // ── Cross-clause logic ──

  // HAVING without GROUP BY
  if (params.having && !params.group) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "HAVING_WITHOUT_GROUP",
      clause: "$having",
      message: "$having requires $group. Add a $group clause specifying which columns to group by.",
      suggestion: "Add a $group parameter with the columns you want to aggregate over",
    });
  }

  // Aggregation in SELECT without GROUP BY
  if (params.select && !params.group) {
    const hasAgg = /\b(count|sum|avg|min|max|stddev_pop|stddev_samp)\s*\(/i.test(params.select);
    const hasNonAgg = extractColumnRefs(
      params.select.replace(/\b(count|sum|avg|min|max|stddev_pop|stddev_samp)\s*\([^)]*\)/gi, "")
    ).length > 0;
    if (hasAgg && hasNonAgg) {
      diagnostics.push({
        source: "local",
        severity: "error",
        code: "AGG_WITHOUT_GROUP",
        clause: "$select",
        message: "Mixing aggregation functions with non-aggregated columns requires $group. Add a $group clause with the non-aggregated columns.",
        suggestion: "Add $group with the non-aggregated columns from your $select",
      });
    }
  }

  // ── Type confusion ──

  // = NULL instead of IS NULL
  if (params.where && /=\s*NULL\b/i.test(params.where) && !/IS\s+(NOT\s+)?NULL/i.test(params.where)) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "EQUALS_NULL",
      clause: "$where",
      message: "Use 'IS NULL' or 'IS NOT NULL' instead of '= NULL'. Equality comparison with NULL always returns false in SoQL.",
      suggestion: "Replace '= NULL' with 'IS NULL' or '!= NULL' with 'IS NOT NULL'",
    });
  }

  // ── Column name validation ──

  const clausesToCheck: Array<[string, string | undefined]> = [
    ["$select", params.select],
    ["$where", params.where],
    ["$order", params.order],
    ["$group", params.group],
    ["$having", params.having],
  ];

  for (const [clause, value] of clausesToCheck) {
    if (!value) continue;
    const refs = extractColumnRefs(value);
    for (const ref of refs) {
      // Skip aliases defined in $select (e.g., "total" from "count(*) as total")
      if (aliases.has(ref.toLowerCase())) continue;
      if (!colNames.has(ref.toLowerCase())) {
        const suggestion = suggestColumn(ref, columns);
        diagnostics.push({
          source: "local",
          severity: "error",
          code: "UNKNOWN_COLUMN",
          clause,
          near: ref,
          message: suggestion
            ? `Column '${ref}' not found in this dataset. Did you mean '${suggestion}'?`
            : `Column '${ref}' not found in this dataset. Available columns: ${columns.map((c) => c.fieldName).slice(0, 10).join(", ")}${columns.length > 10 ? ", ..." : ""}`,
          suggestion: suggestion
            ? `Replace '${ref}' with '${suggestion}'`
            : "Use get_dataset_schema to see available columns",
        });
      }
    }
  }

  return diagnostics;
}
