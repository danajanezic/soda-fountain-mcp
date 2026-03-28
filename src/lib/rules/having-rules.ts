// src/lib/rules/having-rules.ts
import type { Diagnostic } from "../types.js";
import { validateWhere } from "./where-rules.js";

export function validateHaving(value: string): Diagnostic[] {
  const diagnostics = validateWhere(value);
  return diagnostics.map((d) => ({ ...d, clause: "$having" }));
}
