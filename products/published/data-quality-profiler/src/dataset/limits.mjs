export const LIMITS = Object.freeze({
  bodyBytes: 1_048_576,
  records: 1_000,
  fieldsPerRecord: 250,
  nestingDepth: 8,
  processingMs: 5_000,
});

export const ERROR_CODES = Object.freeze({
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  INVALID_DATASET: "INVALID_DATASET",
  INVALID_RECORD_SHAPE: "INVALID_RECORD_SHAPE",
  TOO_MANY_RECORDS: "TOO_MANY_RECORDS",
  TOO_MANY_FIELDS: "TOO_MANY_FIELDS",
  NESTING_TOO_DEEP: "NESTING_TOO_DEEP",
  MALFORMED_CSV: "MALFORMED_CSV",
  PROCESSING_TIMEOUT: "PROCESSING_TIMEOUT",
});

export function assertMaxDepth(value, maxDepth, depth = 1) {
  if (Array.isArray(value)) {
    if (depth > maxDepth) {
      throw new Error(`${ERROR_CODES.NESTING_TOO_DEEP}: depth ${depth} exceeds max ${maxDepth}`);
    }
    for (const item of value) {
      assertMaxDepth(item, maxDepth, depth + 1);
    }
  } else if (value && typeof value === "object") {
    if (depth > maxDepth) {
      throw new Error(`${ERROR_CODES.NESTING_TOO_DEEP}: depth ${depth} exceeds max ${maxDepth}`);
    }
    for (const key of Object.keys(value)) {
      assertMaxDepth(value[key], maxDepth, depth + 1);
    }
  }
}

export function assertPlainObject(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`${ERROR_CODES.INVALID_RECORD_SHAPE}: record must be a plain object`);
  }
}
