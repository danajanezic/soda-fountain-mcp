// src/lib/rules/order-rules.ts
import type { Diagnostic } from "../types.js";
import { SOQL_SORT_DIRECTIONS } from "../soql-keywords.js";
import { findClosestMatch } from "../fuzzy-match.js";

export function validateOrder(value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const parts = value.split(",");

  for (const part of parts) {
    const tokens = part.trim().split(/\s+/);
    if (tokens.length >= 2) {
      const lastToken = tokens[tokens.length - 1];
      const upper = lastToken.toUpperCase();

      if (!SOQL_SORT_DIRECTIONS.includes(upper)) {
        const suggestion = findClosestMatch(upper, SOQL_SORT_DIRECTIONS);
        if (suggestion) {
          diagnostics.push({
            source: "local",
            severity: "error",
            code: "UNKNOWN_KEYWORD",
            clause: "$order",
            near: lastToken,
            message: `Unknown sort direction "${lastToken}". Did you mean "${suggestion}"?`,
            suggestion,
          });
        }
      }
    }
  }

  return diagnostics;
}
