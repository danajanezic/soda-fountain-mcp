import type { Diagnostic } from "../types.js";

export function validateStructural(clause: string, value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!value || value.trim().length === 0) {
    diagnostics.push({
      source: "local",
      severity: "error",
      code: "EMPTY_CLAUSE",
      clause,
      message: `Empty ${clause} clause. Provide a value or remove the parameter.`,
    });
    return diagnostics;
  }

  diagnostics.push(...checkParentheses(clause, value));
  diagnostics.push(...checkQuotes(clause, value));

  return diagnostics;
}

function checkParentheses(clause: string, value: string): Diagnostic[] {
  let depth = 0;
  let inString = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];

    if (ch === "'" && !inString) {
      inString = true;
      continue;
    }
    if (ch === "'" && inString) {
      if (i + 1 < value.length && value[i + 1] === "'") {
        i++;
        continue;
      }
      inString = false;
      continue;
    }

    if (inString) continue;

    if (ch === "(") depth++;
    if (ch === ")") depth--;

    if (depth < 0) {
      return [
        {
          source: "local",
          severity: "error",
          code: "UNBALANCED_PARENS",
          clause,
          near: value,
          message: `Unbalanced parentheses in ${clause} clause. Unexpected closing ")".`,
        },
      ];
    }
  }

  if (depth > 0) {
    return [
      {
        source: "local",
        severity: "error",
        code: "UNBALANCED_PARENS",
        clause,
        near: value,
        message: `Unbalanced parentheses in ${clause} clause. Missing ${depth} closing ")".`,
        suggestion: value + ")".repeat(depth),
      },
    ];
  }

  return [];
}

function checkQuotes(clause: string, value: string): Diagnostic[] {
  let inString = false;

  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") {
      if (inString && i + 1 < value.length && value[i + 1] === "'") {
        i++;
        continue;
      }
      inString = !inString;
    }
  }

  if (inString) {
    return [
      {
        source: "local",
        severity: "error",
        code: "UNBALANCED_QUOTES",
        clause,
        near: value,
        message: `Unbalanced single quotes in ${clause} clause. Missing closing "'".`,
      },
    ];
  }

  return [];
}
