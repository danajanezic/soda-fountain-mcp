import type { Diagnostic, SoQLParams, ValidationResult } from "./types.js";
import { validateStructural } from "./rules/structural-rules.js";
import { validateSelect } from "./rules/select-rules.js";
import { validateWhere } from "./rules/where-rules.js";
import { validateOrder } from "./rules/order-rules.js";
import { validateGroup } from "./rules/group-rules.js";
import { validateHaving } from "./rules/having-rules.js";
import { validateLimit, validateOffset } from "./rules/limit-offset-rules.js";

export function validate(params: SoQLParams): ValidationResult {
  const diagnostics: Diagnostic[] = [];

  const clauseMap: Array<[string, string | undefined]> = [
    ["$select", params.select],
    ["$where", params.where],
    ["$order", params.order],
    ["$group", params.group],
    ["$having", params.having],
  ];

  for (const [clause, value] of clauseMap) {
    if (value !== undefined) {
      diagnostics.push(...validateStructural(clause, value));
    }
  }

  if (params.select && params.select.trim()) {
    diagnostics.push(...validateSelect(params.select));
  }

  if (params.where && params.where.trim()) {
    diagnostics.push(...validateWhere(params.where));
  }

  if (params.order && params.order.trim()) {
    diagnostics.push(...validateOrder(params.order));
  }

  if (params.group && params.group.trim()) {
    diagnostics.push(...validateGroup(params.group));
  }

  if (params.having && params.having.trim()) {
    diagnostics.push(...validateHaving(params.having));
  }

  if (params.limit !== undefined) {
    diagnostics.push(...validateLimit(params.limit));
  }

  if (params.offset !== undefined) {
    diagnostics.push(...validateOffset(params.offset));
  }

  // Cross-clause warnings
  if (params.select?.trim() === "*" && params.group) {
    diagnostics.push({
      source: "local",
      severity: "warning",
      code: "SELECT_STAR_WITH_GROUP",
      clause: "$select",
      message: "Using $select=* with $group may produce unexpected results. Select specific columns or aggregations instead.",
    });
  }

  const hasErrors = diagnostics.some((d) => d.severity === "error");

  return {
    valid: !hasErrors,
    diagnostics,
  };
}
