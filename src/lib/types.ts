import { z } from "zod";

// Dataset ID validation: 4x4 lowercase alphanumeric with dash
export const DatasetIdSchema = z
  .string()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, "datasetId must be a 4x4 identifier (e.g., tckn-sxa6)");

// Tool result shape returned by all handlers
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// Structured error response
export interface SocrataError {
  error: true;
  code: string;
  message: string;
  recoverable: boolean;
  suggestion: string;
}

// Column definition from metadata API
export interface ColumnDef {
  fieldName: string;
  type: string;
  name: string;
}

// Dataset summary from catalog search
export interface DatasetSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  updatedAt: string;
}

// Schema response
export interface DatasetSchema {
  name: string;
  description: string;
  category: string;
  columns: ColumnDef[];
  sampleRows: Record<string, unknown>[];
}

// Query response
export interface QueryResponse {
  results: Record<string, unknown>[];
  metadata: {
    rowsReturned: number;
    query: string;
  };
  notice?: string;
}

// Search response
export interface SearchResponse {
  results: DatasetSummary[];
  metadata: {
    totalResults: number;
    returned: number;
  };
}

// SoQL parameters for queryDataset
export interface SoqlParams {
  select?: string;
  where?: string;
  group?: string;
  having?: string;
  order?: string;
  limit: number;
  offset: number;
  search?: string;
}

// --- SoQL Validation Types ---

export interface Diagnostic {
  source: "local" | "api";
  severity: "error" | "warning";
  code: string;
  clause: string;
  near?: string;
  message: string;
  suggestion?: string;
}

export interface SoQLParams {
  select?: string;
  where?: string;
  order?: string;
  group?: string;
  having?: string;
  limit?: string;
  offset?: string;
  q?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}
