import type { SocrataClient } from "../lib/socrata-client.js";
import type { SocrataError, SoqlParams, ToolResult } from "../lib/types.js";
import { validate } from "../lib/validator.js";
import { validateWithSchema } from "../lib/schema-validator.js";
import type { Diagnostic } from "../lib/types.js";

function getWarnings(params: {
  limit?: number;
  offset?: number;
  select?: string;
  where?: string;
  group?: string;
  having?: string;
  order?: string;
  search?: string;
}): Diagnostic[] {
  const soqlParams = {
    select: params.select,
    where: params.where,
    order: params.order,
    group: params.group,
    having: params.having,
    limit: params.limit?.toString(),
    offset: params.offset?.toString(),
    q: params.search,
  };
  const result = validate(soqlParams);
  return result.diagnostics.filter((d) => d.severity === "warning");
}

function inferClauseFromMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("select")) return "$select";
  if (lower.includes("where")) return "$where";
  if (lower.includes("order")) return "$order";
  if (lower.includes("group")) return "$group";
  if (lower.includes("having")) return "$having";
  if (lower.includes("limit")) return "$limit";
  if (lower.includes("offset")) return "$offset";
  return "$where";
}

function normalizeApiError(message: string): Diagnostic {
  return {
    source: "api",
    severity: "error",
    code: "API_QUERY_ERROR",
    clause: inferClauseFromMessage(message),
    message: `Socrata: ${message}`,
  };
}

function getErrorDiagnostics(
  params: {
    select?: string;
    where?: string;
    order?: string;
    group?: string;
    having?: string;
    limit?: number;
    offset?: number;
    search?: string;
  },
  apiMessage: string
): Diagnostic[] {
  const apiDiag = normalizeApiError(apiMessage);
  const soqlParams = {
    select: params.select,
    where: params.where,
    order: params.order,
    group: params.group,
    having: params.having,
    limit: params.limit?.toString(),
    offset: params.offset?.toString(),
    q: params.search,
  };
  const localResult = validate(soqlParams);
  const localErrors = localResult.diagnostics.filter((d) => d.severity === "error");
  return [apiDiag, ...localErrors];
}

export async function handleQueryDataset(
  client: SocrataClient,
  params: {
    domain: string;
    datasetId: string;
    select?: string;
    where?: string;
    group?: string;
    having?: string;
    order?: string;
    limit: number;
    offset: number;
    search?: string;
    format?: "json" | "csv" | "geojson" | "markdown";
  }
): Promise<ToolResult> {
  try {
    // ── Pre-flight: schema-aware validation ──
    // Catches LLM mistakes (wrong columns, SQL habits) BEFORE hitting the API
    try {
      const columns = await client.getColumns(params.domain, params.datasetId);
      const schemaErrors = validateWithSchema(
        {
          select: params.select,
          where: params.where,
          order: params.order,
          group: params.group,
          having: params.having,
          search: params.search,
        },
        columns
      );

      const errors = schemaErrors.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                code: "QUERY_VALIDATION_FAILED",
                message: `Query has ${errors.length} error(s) that would fail. Fix these before querying.`,
                recoverable: true,
                suggestion: errors[0].suggestion ?? "Check column names and SoQL syntax",
                diagnostics: schemaErrors,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    } catch {
      // Schema fetch failed — proceed without validation (don't block queries)
    }

    // ── Execute query ──
    const soqlParams: SoqlParams = {
      select: params.select,
      where: params.where,
      group: params.group,
      having: params.having,
      order: params.order,
      limit: params.limit,
      offset: params.offset,
      search: params.search,
    };

    const format = params.format ?? "json";
    const response = await client.queryDataset(params.domain, params.datasetId, soqlParams, format);

    // For csv, geojson, and markdown — response is a string
    if (typeof response === "string") {
      return {
        content: [{ type: "text", text: response }],
      };
    }

    const warnings = getWarnings(params);
    const responseWithDiagnostics =
      warnings.length > 0 ? { ...response, diagnostics: warnings } : response;

    return {
      content: [{ type: "text", text: JSON.stringify(responseWithDiagnostics, null, 2) }],
    };
  } catch (err) {
    const socrataErr = err as SocrataError;
    if (socrataErr.error) {
      if (socrataErr.code === "BAD_QUERY") {
        const diagnostics = getErrorDiagnostics(params, socrataErr.message);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...socrataErr, diagnostics }, null, 2),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(socrataErr, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "NETWORK_ERROR",
            message: `Could not reach ${params.domain} — ${String(err)}`,
            recoverable: true,
            suggestion: "Check your network connection",
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
