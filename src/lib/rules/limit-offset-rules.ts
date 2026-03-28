// src/lib/rules/limit-offset-rules.ts
import type { Diagnostic } from "../types.js";

export function validateLimit(value: string): Diagnostic[] {
  const num = Number(value);

  if (!Number.isInteger(num) || num < 0) {
    return [
      {
        source: "local",
        severity: "error",
        code: "INVALID_LIMIT",
        clause: "$limit",
        near: value,
        message: `Invalid $limit value "${value}". Must be a non-negative integer.`,
      },
    ];
  }

  if (num > 10000) {
    return [
      {
        source: "local",
        severity: "warning",
        code: "LARGE_LIMIT",
        clause: "$limit",
        near: value,
        message: `Limit of ${num} is large. Consider pagination with $limit and $offset.`,
      },
    ];
  }

  return [];
}

export function validateOffset(value: string): Diagnostic[] {
  const num = Number(value);

  if (!Number.isInteger(num) || num < 0) {
    return [
      {
        source: "local",
        severity: "error",
        code: "INVALID_OFFSET",
        clause: "$offset",
        near: value,
        message: `Invalid $offset value "${value}". Must be a non-negative integer.`,
      },
    ];
  }

  return [];
}
