import { parse } from "csv-parse/sync";
import { LIMITS, ERROR_CODES, assertMaxDepth, assertPlainObject } from "./limits.mjs";

export function normalizeDataset(payload, { deadlineMs = LIMITS.processingMs, now = () => Date.now() } = {}) {
  const deadline = now() + deadlineMs;
  if (!payload || typeof payload !== "object") {
    throw new Error(`${ERROR_CODES.INVALID_DATASET}: payload must be an object`);
  }

  const format = payload.format;
  if (format !== "json" && format !== "csv") {
    throw new Error(`${ERROR_CODES.UNSUPPORTED_FORMAT}: format must be json or csv`);
  }

  let records;
  if (format === "json") {
    if (!Array.isArray(payload.records)) {
      throw new Error(`${ERROR_CODES.INVALID_DATASET}: records must be an array`);
    }
    records = payload.records;
  } else {
    const data = payload.data;
    if (typeof data !== "string") {
      throw new Error(`${ERROR_CODES.INVALID_DATASET}: csv data must be a string`);
    }
    try {
      records = parse(data, {
        columns: true,
        skip_empty_lines: true,
        relax: false,
        trim: true,
      });
    } catch {
      throw new Error(`${ERROR_CODES.MALFORMED_CSV}: malformed CSV input`);
    }
  }

  if (records.length > LIMITS.records) {
    throw new Error(`${ERROR_CODES.TOO_MANY_RECORDS}: max ${LIMITS.records} records allowed`);
  }

  const normalized = [];
  const fieldSet = new Set();
  for (const record of records) {
    if (now() > deadline) {
      throw new Error(`${ERROR_CODES.PROCESSING_TIMEOUT}: normalization exceeded deadline`);
    }
    if (format === "json") {
      assertPlainObject(record);
      assertMaxDepth(record, LIMITS.nestingDepth);
    }

    const fields = Object.keys(record);
    if (fields.length > LIMITS.fieldsPerRecord) {
      throw new Error(`${ERROR_CODES.TOO_MANY_FIELDS}: max ${LIMITS.fieldsPerRecord} fields allowed`);
    }
    fields.forEach((f) => fieldSet.add(f));
    normalized.push({ ...record });
  }

  const fieldNames = Array.from(fieldSet).sort();
  return { format, records: normalized, fieldNames };
}
