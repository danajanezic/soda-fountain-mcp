import type { Diagnostic } from "../types.js";
import { isKnownFunction, getFunctionNames } from "../soql-keywords.js";
import { findClosestMatch } from "../fuzzy-match.js";

export function validateSelect(value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Extract function-call patterns: word followed by (
  const functionCallPattern = /(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = functionCallPattern.exec(value)) !== null) {
    const funcName = match[1];

    // Skip keywords that look like function calls but aren't
    if (funcName.toUpperCase() === "DISTINCT" || funcName.toUpperCase() === "AS") {
      continue;
    }

    if (!isKnownFunction(funcName)) {
      const suggestion = findClosestMatch(funcName, getFunctionNames());
      diagnostics.push({
        source: "local",
        severity: "error",
        code: "UNKNOWN_FUNCTION",
        clause: "$select",
        near: funcName,
        message: suggestion
          ? `Unknown function "${funcName}". Did you mean "${suggestion}"?`
          : `Unknown function "${funcName}".`,
        ...(suggestion ? { suggestion } : {}),
      });
    }
  }

  // Check for unclosed function calls: word( without matching )
  const unclosedPattern = /(\w+\s*\()[^)]*$/g;
  let unclosed: RegExpExecArray | null;
  while ((unclosed = unclosedPattern.exec(value)) !== null) {
    const fragment = unclosed[0];
    const openCount = (fragment.match(/\(/g) || []).length;
    const closeCount = (fragment.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      diagnostics.push({
        source: "local",
        severity: "error",
        code: "MALFORMED_FUNCTION",
        clause: "$select",
        near: fragment.trim(),
        message: `Malformed function call "${fragment.trim()}". Missing closing ")".`,
      });
    }
  }

  return diagnostics;
}
