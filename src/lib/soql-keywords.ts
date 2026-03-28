export const SOQL_FUNCTIONS: Record<string, { args: string; description: string }> = {
  // Aggregation
  count: { args: "(*) or (column)", description: "Count rows or non-null values" },
  sum: { args: "(column)", description: "Sum numeric values" },
  avg: { args: "(column)", description: "Average numeric values" },
  min: { args: "(column)", description: "Minimum value" },
  max: { args: "(column)", description: "Maximum value" },
  stddev_pop: { args: "(column)", description: "Population standard deviation" },
  stddev_samp: { args: "(column)", description: "Sample standard deviation" },

  // String
  upper: { args: "(column)", description: "Convert to uppercase" },
  lower: { args: "(column)", description: "Convert to lowercase" },
  starts_with: { args: "(column, 'prefix')", description: "Check if string starts with prefix" },
  unaccent: { args: "(column)", description: "Remove accent marks" },

  // Date extraction
  date_extract_y: { args: "(column)", description: "Extract year" },
  date_extract_m: { args: "(column)", description: "Extract month" },
  date_extract_d: { args: "(column)", description: "Extract day" },
  date_extract_dow: { args: "(column)", description: "Extract day of week" },
  date_extract_woy: { args: "(column)", description: "Extract week of year" },
  date_extract_hh: { args: "(column)", description: "Extract hour" },
  date_extract_mm: { args: "(column)", description: "Extract minute" },
  date_extract_ss: { args: "(column)", description: "Extract second" },

  // Date truncation
  date_trunc_y: { args: "(column)", description: "Truncate to year" },
  date_trunc_ym: { args: "(column)", description: "Truncate to year-month" },
  date_trunc_ymd: { args: "(column)", description: "Truncate to year-month-day" },

  // Geospatial
  within_box: { args: "(column, latN, lonW, latS, lonE)", description: "Filter to bounding box" },
  within_circle: { args: "(column, lat, lon, radius)", description: "Filter to radius" },
  within_polygon: { args: "(column, 'MULTIPOLYGON(...)')", description: "Filter to polygon" },
  distance_in_meters: { args: "(column, 'POINT(lon lat)')", description: "Distance in meters" },
  intersects: { args: "(column, 'MULTIPOLYGON(...)')", description: "Geometry intersection" },
  convex_hull: { args: "(column)", description: "Convex hull of geometries" },
  extent: { args: "(column)", description: "Bounding box of geometries" },
  num_points: { args: "(column)", description: "Number of points in geometry" },
  simplify: { args: "(column, tolerance)", description: "Simplify geometry" },
  simplify_preserve_topology: { args: "(column, tolerance)", description: "Simplify preserving topology" },

  // Other
  greatest: { args: "(val1, val2, ...)", description: "Greatest of values" },
  least: { args: "(val1, val2, ...)", description: "Least of values" },
  ln: { args: "(column)", description: "Natural logarithm" },
};

export const SOQL_OPERATORS: string[] = [
  "=", "!=", ">", "<", ">=", "<=",
  "AND", "OR", "NOT",
  "IS NULL", "IS NOT NULL",
  "LIKE", "NOT LIKE",
  "IN", "NOT IN",
  "BETWEEN",
];

export const SOQL_SORT_DIRECTIONS: string[] = ["ASC", "DESC"];

export const SOQL_CLAUSES: string[] = [
  "select", "where", "order", "group", "having", "limit", "offset", "q",
];

const functionNamesLower = new Set(
  Object.keys(SOQL_FUNCTIONS).map((f) => f.toLowerCase())
);

const operatorsLower = new Set(
  SOQL_OPERATORS.map((op) => op.toLowerCase())
);

export function isKnownFunction(name: string): boolean {
  return functionNamesLower.has(name.toLowerCase());
}

export function isKnownOperator(op: string): boolean {
  return operatorsLower.has(op.toLowerCase());
}

export function getFunctionNames(): string[] {
  return Object.keys(SOQL_FUNCTIONS);
}
