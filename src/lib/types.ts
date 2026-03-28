import { z } from "zod";

// Dataset ID validation: 4x4 lowercase alphanumeric with dash
export const DatasetIdSchema = z
  .string()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/, "datasetId must be a 4x4 identifier (e.g., tckn-sxa6)");

// Tool result shape returned by all handlers
export interface ToolResult {
  [x: string]: unknown;
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
  domain: string;
  updatedAt: string;
}

// Domain info from catalog API
export interface DomainInfo {
  domain: string;
  datasetCount: number;
}

// Domain categories response
export interface DomainCategoriesResponse {
  domain: string;
  categories: Array<{ name: string; count: number }>;
  tags: Array<{ name: string; count: number }>;
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
    columnTypes?: Record<string, string>;
    truncated?: boolean;
    nullCounts?: Record<string, number>;
    numericSummary?: Record<string, { min: number; max: number; avg: number }>;
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

// --- Correlation Key Index Types ---

export const KeyTypeEnum = z.enum([
  "geographic",
  "temporal",
  "entity",
  "fiscal",
  "enforcement",
]);
export type KeyType = z.infer<typeof KeyTypeEnum>;

export const CorrelationDatasetEntrySchema = z.object({
  domain: z.string(),
  id: z.string().regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/),
  name: z.string(),
  column: z.string(),
  columnType: z.string(),
  columnNote: z.string().optional(),
});
export type CorrelationDatasetEntry = z.infer<typeof CorrelationDatasetEntrySchema>;

export const CorrelationKeySchema = z.object({
  key: z.string(),
  type: KeyTypeEnum,
  description: z.string(),
  crossStateJoin: z.boolean(),
  normalizations: z.array(z.string()),
  datasets: z.array(CorrelationDatasetEntrySchema),
});
export type CorrelationKey = z.infer<typeof CorrelationKeySchema>;

export const DomainEntrySchema = z.object({
  state: z.string().length(2),
  name: z.string(),
});
export type DomainEntry = z.infer<typeof DomainEntrySchema>;

export const CorrelationKeySeedSchema = z.object({
  version: z.string(),
  domains: z.record(z.string(), DomainEntrySchema),
  keys: z.array(CorrelationKeySchema),
});
export type CorrelationKeySeed = z.infer<typeof CorrelationKeySeedSchema>;
