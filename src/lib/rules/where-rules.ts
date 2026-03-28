import type { Diagnostic } from "../types.js";
import { isKnownFunction, isKnownOperator, getFunctionNames, SOQL_OPERATORS } from "../soql-keywords.js";
import { findClosestMatch } from "../fuzzy-match.js";

export function validateWhere(value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(...checkOperators(value));
  diagnostics.push(...checkFunctions(value));
  diagnostics.push(...checkBetween(value));
  diagnostics.push(...checkCase(value));

  return diagnostics;
}

function checkOperators(value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const tokens = tokenizeOutsideStrings(value);

  for (const token of tokens) {
    if (!/^[a-zA-Z_]+$/.test(token)) continue;

    const upper = token.toUpperCase();

    // Skip known valid things
    if (isKnownOperator(upper)) continue;
    if (isKnownFunction(token)) continue;
    if (["CASE", "WHEN", "THEN", "ELSE", "END", "AS", "DISTINCT", "NULL", "NOT", "IS", "TRUE", "FALSE"].includes(upper)) continue;

    // Check if it looks like a misspelled operator (not all-lowercase = likely intended as keyword)
    if (token !== token.toLowerCase()) {
      const suggestion = findClosestMatch(upper, SOQL_OPERATORS.filter((op) => !op.includes(" ")));
      if (suggestion) {
        diagnostics.push({
          source: "local",
          severity: "error",
          code: "UNKNOWN_OPERATOR",
          clause: "$where",
          near: token,
          message: `Unknown operator "${token}". Did you mean "${suggestion}"?`,
          suggestion,
        });
      }
    }
  }

  return diagnostics;
}

function checkFunctions(value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const functionCallPattern = /(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = functionCallPattern.exec(value)) !== null) {
    const funcName = match[1];
    const upper = funcName.toUpperCase();

    if (["IN", "NOT", "CASE", "WHEN"].includes(upper)) continue;

    if (!isKnownFunction(funcName)) {
      const suggestion = findClosestMatch(funcName, getFunctionNames());
      if (suggestion) {
        diagnostics.push({
          source: "local",
          severity: "error",
          code: "UNKNOWN_FUNCTION",
          clause: "$where",
          near: funcName,
          message: `Unknown function "${funcName}". Did you mean "${suggestion}"?`,
          suggestion,
        });
      }
    }
  }

  return diagnostics;
}

function checkBetween(value: string): Diagnostic[] {
  const betweenPattern = /BETWEEN\b/gi;
  let match: RegExpExecArray | null;
  const diagnostics: Diagnostic[] = [];

  while ((match = betweenPattern.exec(value)) !== null) {
    const afterBetween = value.slice(match.index + match[0].length);
    if (!/\bAND\b/i.test(afterBetween)) {
      diagnostics.push({
        source: "local",
        severity: "error",
        code: "MALFORMED_BETWEEN",
        clause: "$where",
        near: value.slice(match.index, match.index + 30).trim(),
        message: `BETWEEN requires AND: "BETWEEN value1 AND value2".`,
      });
    }
  }

  return diagnostics;
}

function checkCase(value: string): Diagnostic[] {
  const caseCount = (value.match(/\bCASE\b/gi) || []).length;
  const endCount = (value.match(/\bEND\b/gi) || []).length;

  if (caseCount > endCount) {
    return [
      {
        source: "local",
        severity: "error",
        code: "MALFORMED_CASE",
        clause: "$where",
        message: `CASE expression missing END. Each CASE must have a matching END.`,
      },
    ];
  }

  return [];
}

function tokenizeOutsideStrings(value: string): string[] {
  const tokens: string[] = [];
  let inString = false;
  let current = "";

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];

    if (ch === "'" && !inString) {
      inString = true;
      if (current.trim()) tokens.push(current.trim());
      current = "";
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

    if (/[\s,()=<>!]/.test(ch)) {
      if (current.trim()) tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}
