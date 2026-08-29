import { normalizeDataset } from "./normalize.mjs";
import { profileDataset } from "./profile.mjs";
import { fingerprintSchema } from "./fingerprint.mjs";
import { scoreProfile } from "./scoring.mjs";
import { canonicalize } from "./canonicalize.mjs";
import { ERROR_CODES } from "./limits.mjs";

const CONTRACT_TYPES = new Set([
  "null",
  "array",
  "object",
  "boolean",
  "integer",
  "number",
  "string",
  "mixed",
  "unknown",
]);

export function analyzeDataset(payload, options = {}) {
  const normalized = normalizeDataset(payload, options);
  const profile = profileDataset(normalized, options);
  const schemaFingerprint = fingerprintSchema(profile.fields);
  const scored = scoreProfile(profile);
  return { normalized, profile, schemaFingerprint, scored };
}

export function duplicateAudit(payload, options = {}) {
  const { normalized, profile } = analyzeDataset(payload, options);
  const groups = new Map();

  normalized.records.forEach((record, index) => {
    const key = canonicalize(record);
    const indexes = groups.get(key) ?? [];
    indexes.push(index);
    groups.set(key, indexes);
  });

  const duplicateGroups = Array.from(groups.values())
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => ({
      first_index: indexes[0],
      indexes,
      count: indexes.length,
      duplicate_count: indexes.length - 1,
    }))
    .sort((a, b) => a.first_index - b.first_index);

  return {
    schema_version: "1.0",
    record_count: profile.record_count,
    unique_row_count: profile.record_count - profile.duplicate_rows,
    duplicate_rows: profile.duplicate_rows,
    duplicate_ratio: profile.record_count ? profile.duplicate_rows / profile.record_count : 0,
    duplicate_groups: duplicateGroups,
  };
}

export function qualityGate(payload, options = {}) {
  assertQualityGateThresholds(payload);
  const { profile, scored } = analyzeDataset(payload, options);

  const thresholds = {
    minimum_quality_score: payload.minimum_quality_score ?? 80,
    max_duplicate_rows: payload.max_duplicate_rows ?? 0,
    max_missing_values: payload.max_missing_values ?? 0,
    allow_mixed_types: payload.allow_mixed_types ?? false,
  };

  const mixedTypeFields = profile.mixed_fields.length;
  const checks = {
    quality_score: {
      observed: scored.quality_score,
      minimum: thresholds.minimum_quality_score,
      pass: scored.quality_score >= thresholds.minimum_quality_score,
    },
    duplicate_rows: {
      observed: profile.duplicate_rows,
      maximum: thresholds.max_duplicate_rows,
      pass: profile.duplicate_rows <= thresholds.max_duplicate_rows,
    },
    missing_values: {
      observed: profile.missing_cell_count,
      maximum: thresholds.max_missing_values,
      pass: profile.missing_cell_count <= thresholds.max_missing_values,
    },
    mixed_types: {
      observed_fields: mixedTypeFields,
      allowed: thresholds.allow_mixed_types,
      pass: thresholds.allow_mixed_types || mixedTypeFields === 0,
    },
  };

  const reasons = [];
  if (!checks.quality_score.pass) reasons.push("QUALITY_SCORE_BELOW_MINIMUM");
  if (!checks.duplicate_rows.pass) reasons.push("DUPLICATE_ROWS_EXCEEDED");
  if (!checks.missing_values.pass) reasons.push("MISSING_VALUES_EXCEEDED");
  if (!checks.mixed_types.pass) reasons.push("MIXED_TYPES_NOT_ALLOWED");

  return {
    schema_version: "1.0",
    pass: reasons.length === 0,
    quality_score: scored.quality_score,
    observed: {
      record_count: profile.record_count,
      field_count: profile.field_count,
      duplicate_rows: profile.duplicate_rows,
      missing_values: profile.missing_cell_count,
      mixed_type_fields: profile.mixed_fields.slice(),
    },
    thresholds,
    checks,
    reasons,
  };
}

export function schemaDrift(payload, options = {}) {
  if (!isPlainObject(payload) || !isPlainObject(payload.baseline) || !isPlainObject(payload.current)) {
    throw invalidDataset("schema drift requires baseline and current dataset objects");
  }

  const baseline = analyzeDataset(payload.baseline, options);
  const current = analyzeDataset(payload.current, options);
  const baselineNames = Object.keys(baseline.profile.fields).sort();
  const currentNames = Object.keys(current.profile.fields).sort();
  const baselineSet = new Set(baselineNames);
  const currentSet = new Set(currentNames);

  const addedFields = currentNames.filter((field) => !baselineSet.has(field));
  const removedFields = baselineNames.filter((field) => !currentSet.has(field));
  const commonFields = baselineNames.filter((field) => currentSet.has(field));

  const typeChanges = commonFields.flatMap((field) => {
    const baselineType = baseline.profile.fields[field].inferred_type;
    const currentType = current.profile.fields[field].inferred_type;
    return baselineType === currentType
      ? []
      : [{ field, baseline_type: baselineType, current_type: currentType }];
  });

  const nullableChanges = commonFields.flatMap((field) => {
    const baselineNullable = baseline.profile.fields[field].null_count > 0;
    const currentNullable = current.profile.fields[field].null_count > 0;
    return baselineNullable === currentNullable
      ? []
      : [{ field, baseline_nullable: baselineNullable, current_nullable: currentNullable }];
  });

  return {
    schema_version: "1.0",
    baseline_fingerprint: baseline.schemaFingerprint,
    current_fingerprint: current.schemaFingerprint,
    added_fields: addedFields,
    removed_fields: removedFields,
    type_changes: typeChanges,
    nullable_changes: nullableChanges,
    breaking_change: removedFields.length > 0 || typeChanges.length > 0,
  };
}

export function dataContractCheck(payload, options = {}) {
  if (!isPlainObject(payload) || !isPlainObject(payload.dataset) || !isPlainObject(payload.contract)) {
    throw invalidDataset("data contract check requires dataset and contract objects");
  }

  const contract = payload.contract;
  const requiredFields = contract.required_fields ?? [];
  const fieldTypes = contract.field_types ?? {};
  const allowExtraFields = contract.allow_extra_fields ?? true;

  if (!Array.isArray(requiredFields)) {
    throw invalidDataset("required_fields must be an array of unique non-empty strings");
  }
  const normalizedRequired = requiredFields.map((field) => {
    if (typeof field !== "string" || field.trim() === "") {
      throw invalidDataset("required_fields must contain unique non-empty strings");
    }
    return field.trim();
  });
  if (new Set(normalizedRequired).size !== normalizedRequired.length) {
    throw invalidDataset("required_fields must contain unique non-empty strings");
  }

  if (!isPlainObject(fieldTypes)) {
    throw invalidDataset("field_types must be an object");
  }
  const normalizedFieldTypes = {};
  for (const [rawField, expectedType] of Object.entries(fieldTypes)) {
    const field = rawField.trim();
    if (!field || !CONTRACT_TYPES.has(expectedType)) {
      throw invalidDataset("field_types must map non-empty field names to supported inferred types");
    }
    normalizedFieldTypes[field] = expectedType;
  }

  if (typeof allowExtraFields !== "boolean") {
    throw invalidDataset("allow_extra_fields must be a boolean");
  }

  const { profile, schemaFingerprint } = analyzeDataset(payload.dataset, options);
  const observedFields = Object.keys(profile.fields).sort();
  const observedSet = new Set(observedFields);
  const missingRequiredFields = normalizedRequired.filter((field) => !observedSet.has(field)).sort();
  const declaredSet = new Set([...normalizedRequired, ...Object.keys(normalizedFieldTypes)]);
  const extraFields = allowExtraFields
    ? []
    : observedFields.filter((field) => !declaredSet.has(field));

  const typeMismatches = Object.keys(normalizedFieldTypes)
    .sort()
    .flatMap((field) => {
      if (!observedSet.has(field)) return [];
      const observedType = profile.fields[field].inferred_type;
      const expectedType = normalizedFieldTypes[field];
      return observedType === expectedType
        ? []
        : [{ field, expected_type: expectedType, observed_type: observedType }];
    });

  const reasons = [];
  if (missingRequiredFields.length > 0) reasons.push("MISSING_REQUIRED_FIELDS");
  if (extraFields.length > 0) reasons.push("EXTRA_FIELDS_NOT_ALLOWED");
  if (typeMismatches.length > 0) reasons.push("FIELD_TYPE_MISMATCH");

  return {
    schema_version: "1.0",
    compatible: reasons.length === 0,
    schema_fingerprint: schemaFingerprint,
    missing_required_fields: missingRequiredFields,
    extra_fields: extraFields,
    type_mismatches: typeMismatches,
    reasons,
  };
}

export function cleanNormalize(payload, options = {}) {
  if (!isPlainObject(payload)) {
    throw invalidDataset("body must be a JSON object");
  }
  if (payload.options !== undefined && !isPlainObject(payload.options)) {
    throw invalidDataset("options must be an object");
  }
  const rawOptions = payload.options ?? {};
  const cleanOptions = {
    trim_strings: optionOrDefault(rawOptions, "trim_strings", true),
    blank_to_null: optionOrDefault(rawOptions, "blank_to_null", true),
    deduplicate: optionOrDefault(rawOptions, "deduplicate", true),
  };
  for (const [name, value] of Object.entries(cleanOptions)) {
    if (typeof value !== "boolean") {
      throw invalidDataset(`options.${name} must be a boolean`);
    }
  }

  const { normalized } = analyzeDataset(payload, options);
  const counters = {
    trimmed_strings: 0,
    blanks_to_null: 0,
    duplicates_removed: 0,
  };

  const transformedRecords = normalized.records.map((record) =>
    transformValue(record, cleanOptions, counters)
  );

  const cleanedRecords = [];
  const seen = new Set();
  for (const record of transformedRecords) {
    if (cleanOptions.deduplicate) {
      const key = canonicalize(record);
      if (seen.has(key)) {
        counters.duplicates_removed += 1;
        continue;
      }
      seen.add(key);
    }
    cleanedRecords.push(record);
  }

  const cleanedAnalysis = analyzeDataset({ format: "json", records: cleanedRecords }, options);

  return {
    schema_version: "1.0",
    original_record_count: normalized.records.length,
    cleaned_record_count: cleanedRecords.length,
    removed_duplicate_rows: counters.duplicates_removed,
    transformations: counters,
    schema_fingerprint: cleanedAnalysis.schemaFingerprint,
    records: cleanedRecords,
  };
}

export function repairPlan(payload, options = {}) {
  const { profile, schemaFingerprint, scored } = analyzeDataset(payload, options);
  const identifierIntegrityFields = Object.entries(profile.fields)
    .filter(([, field]) => field.candidate_identifier && field.null_count > 0)
    .map(([name]) => name)
    .sort();
  const mixedTypeFields = profile.mixed_fields.slice().sort();
  const constantFields = profile.constant_fields.slice().sort();

  const issues = {
    duplicate_rows: profile.duplicate_rows,
    missing_values: profile.missing_cell_count,
    mixed_type_fields: mixedTypeFields,
    identifier_integrity_fields: identifierIntegrityFields,
    constant_fields: constantFields,
  };

  const actions = [];
  if (issues.duplicate_rows > 0) {
    actions.push({
      code: "DEDUPLICATE_ROWS",
      priority: 1,
      affected_count: issues.duplicate_rows,
      recommendation: "Remove or reconcile exact duplicate rows before downstream use.",
    });
  }
  if (issues.missing_values > 0) {
    actions.push({
      code: "RESOLVE_MISSING_VALUES",
      priority: 2,
      affected_count: issues.missing_values,
      recommendation: "Review missing values and apply a domain-appropriate fill, exclusion, or acceptance policy.",
    });
  }
  if (mixedTypeFields.length > 0) {
    actions.push({
      code: "NORMALIZE_FIELD_TYPES",
      priority: 3,
      fields: mixedTypeFields,
      recommendation: "Normalize mixed-type fields to one explicit contract before ETL, RAG, analytics, or agent use.",
    });
  }
  if (identifierIntegrityFields.length > 0) {
    actions.push({
      code: "REPAIR_IDENTIFIER_INTEGRITY",
      priority: 4,
      fields: identifierIntegrityFields,
      recommendation: "Repair missing identifier values before relying on record identity or joins.",
    });
  }
  if (constantFields.length > 0) {
    actions.push({
      code: "REVIEW_CONSTANT_FIELDS",
      priority: 5,
      fields: constantFields,
      recommendation: "Review constant fields and remove them when they carry no downstream signal.",
    });
  }

  return {
    schema_version: "1.0",
    quality_score: scored.quality_score,
    schema_fingerprint: schemaFingerprint,
    issues,
    actions,
  };
}

function transformValue(value, cleanOptions, counters) {
  if (typeof value === "string") {
    let next = value;
    if (cleanOptions.trim_strings) {
      const trimmed = next.trim();
      if (trimmed !== next) counters.trimmed_strings += 1;
      next = trimmed;
    }
    if (cleanOptions.blank_to_null && next.trim() === "") {
      counters.blanks_to_null += 1;
      return null;
    }
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformValue(item, cleanOptions, counters));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, transformValue(child, cleanOptions, counters)])
    );
  }
  return value;
}

function optionOrDefault(options, name, fallback) {
  return Object.prototype.hasOwnProperty.call(options, name) ? options[name] : fallback;
}

function assertQualityGateThresholds(payload) {
  if (!isPlainObject(payload)) {
    throw invalidDataset("body must be a JSON object");
  }

  if (payload.minimum_quality_score !== undefined) {
    const value = payload.minimum_quality_score;
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw invalidDataset("minimum_quality_score must be a number from 0 to 100");
    }
  }

  for (const field of ["max_duplicate_rows", "max_missing_values"]) {
    if (payload[field] !== undefined) {
      const value = payload[field];
      if (!Number.isInteger(value) || value < 0) {
        throw invalidDataset(`${field} must be a non-negative integer`);
      }
    }
  }

  if (payload.allow_mixed_types !== undefined && typeof payload.allow_mixed_types !== "boolean") {
    throw invalidDataset("allow_mixed_types must be a boolean");
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidDataset(message) {
  return new Error(`${ERROR_CODES.INVALID_DATASET}: ${message}`);
}
