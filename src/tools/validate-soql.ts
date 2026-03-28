// src/tools/validate-soql.ts
import type { SoQLParams, ValidationResult } from "../lib/types.js";
import { validate } from "../lib/validator.js";

export function handleValidateSoql(params: SoQLParams): ValidationResult {
  return validate(params);
}
