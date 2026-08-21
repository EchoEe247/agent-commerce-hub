import { normalizeDataset } from "./normalize.mjs";
import { profileDataset } from "./profile.mjs";
import { fingerprintSchema } from "./fingerprint.mjs";
import { scoreProfile } from "./scoring.mjs";
import { canonicalize } from "./canonicalize.mjs";
import { ERROR_CODES } from "./limits.mjs";

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

function assertQualityGateThresholds(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
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

function invalidDataset(message) {
  return new Error(`${ERROR_CODES.INVALID_DATASET}: ${message}`);
}
