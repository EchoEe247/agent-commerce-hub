import { LIMITS, ERROR_CODES } from "./limits.mjs";
import { profileField } from "./infer.mjs";

function canonicalize(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

export function profileDataset(normalized, { now = () => Date.now(), deadlineMs = LIMITS.processingMs } = {}) {
  const { records, fieldNames } = normalized;
  const deadline = now() + deadlineMs;

  const duplicateRows = detectDuplicates(records);
  const fields = {};
  const warnings = [];
  const mixedFields = [];
  const constantFields = [];
  const candidateIdentifiers = [];

  for (const fieldName of fieldNames) {
    if (now() > deadline) {
      throw new Error(`${ERROR_CODES.PROCESSING_TIMEOUT}: profiling exceeded deadline`);
    }
    const profile = profileField(records, fieldName);
    fields[fieldName] = profile;

    if (profile.inferred_type === "mixed") {
      mixedFields.push(fieldName);
      warnings.push({ code: "MIXED_TYPES", field: fieldName });
    }
    if (profile.constant) {
      constantFields.push(fieldName);
      warnings.push({ code: "CONSTANT_FIELD", field: fieldName });
    }
    if (profile.candidate_identifier) {
      candidateIdentifiers.push(fieldName);
      const badCount = profile.null_count + (profile.distinct_count === 1 ? 0 : 0);
      if (badCount > 0) {
        warnings.push({ code: "IDENTIFIER_INTEGRITY", field: fieldName });
      }
    }
  }

  const missingCellCount = records.length * fieldNames.length - Object.values(fields).reduce((sum, f) => sum + (records.length - f.null_count), 0);

  if (duplicateRows > 0) {
    warnings.push({ code: "DUPLICATE_ROWS", count: duplicateRows });
  }
  const totalMissing = Object.values(fields).reduce((sum, f) => sum + f.null_count, 0);
  if (totalMissing > 0) {
    warnings.push({ code: "MISSING_VALUES", count: totalMissing });
  }

  return {
    record_count: records.length,
    field_count: fieldNames.length,
    duplicate_rows: duplicateRows,
    fields,
    warnings,
    mixed_fields: mixedFields,
    constant_fields: constantFields,
    candidate_identifiers: candidateIdentifiers,
    missing_cell_count: totalMissing,
  };
}

function detectDuplicates(records) {
  const seen = new Set();
  let duplicateCount = 0;
  for (const record of records) {
    const key = canonicalize(record);
    if (seen.has(key)) {
      duplicateCount += 1;
    } else {
      seen.add(key);
    }
  }
  return duplicateCount;
}
