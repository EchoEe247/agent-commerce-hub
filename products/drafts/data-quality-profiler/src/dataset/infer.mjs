import { canonicalize } from "./canonicalize.mjs";

export function classifyValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  return "unknown";
}

function isNumericType(type) {
  return type === "integer" || type === "number";
}

export function profileField(records, fieldName, { isCsv = false } = {}) {
  const nonMissing = [];
  const missing = [];
  const typeCounts = {};

  for (const record of records) {
    const value = record[fieldName];
    const exists = Object.prototype.hasOwnProperty.call(record, fieldName);
    const isNull = value === null;
    const isEmptyString = isCsv && typeof value === "string" && value === "";

    if (!exists || isNull || isEmptyString) {
      missing.push({ record, exists, isNull, isEmptyString });
      continue;
    }

    const type = classifyValue(value);
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    nonMissing.push({ value, type });
  }

  const nonMissingCount = nonMissing.length;
  const missingCount = missing.length;
  const totalCount = records.length;
  const inferredType = deriveInferredType(typeCounts, nonMissingCount);

  const distinctValues = new Set(nonMissing.map((item) => canonicalize(item.value)));
  const distinctCount = distinctValues.size;

  const numericStats = isNumericType(inferredType)
    ? computeNumericStats(nonMissing.map((item) => item.value))
    : computeStringStats(nonMissing.map((item) => item.value));

  const constant = deriveConstant(typeCounts, nonMissingCount, distinctCount);
  const nearConstant = deriveNearConstant(nonMissing);
  const uniqueRatio = nonMissingCount ? distinctCount / nonMissingCount : 0;
  const candidateIdentifier = /^(id|.*_id|uuid|key)$/i.test(fieldName);

  const typeConflicts = Object.keys(typeCounts).length > 1 ? { ...typeCounts } : null;

  return {
    inferred_type: inferredType,
    null_count: missingCount,
    null_pct: totalCount ? round((missingCount / totalCount) * 100, 2) : 0,
    distinct_count: distinctCount,
    unique_ratio: round(uniqueRatio, 4),
    candidate_identifier: candidateIdentifier,
    constant,
    near_constant: nearConstant,
    type_conflicts: typeConflicts,
    ...numericStats,
  };
}

function deriveInferredType(typeCounts, nonMissingCount) {
  const types = Object.keys(typeCounts);
  if (types.length === 0) return "null";
  if (types.length === 1) return types[0];
  return "mixed";
}

function computeNumericStats(values) {
  const sorted = values.map((v) => Number(v)).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const median = computeMedian(sorted);
  return { min, max, mean, median };
}

function computeMedian(sorted) {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeStringStats(values) {
  const lengths = values.map((v) => String(v).length);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const mean = lengths.reduce((acc, v) => acc + v, 0) / lengths.length;
  return { string_min_length: min, string_max_length: max, string_mean_length: round(mean, 2) };
}

function deriveConstant(typeCounts, nonMissingCount, distinctCount) {
  if (nonMissingCount === 0) return false;
  if (distinctCount === 1) return true;
  return false;
}

function deriveNearConstant(nonMissing) {
  if (nonMissing.length < 10) return false;
  const valueCounts = {};
  for (const item of nonMissing) {
    const key = String(item.value);
    valueCounts[key] = (valueCounts[key] || 0) + 1;
  }
  const dominant = Math.max(...Object.values(valueCounts));
  return dominant / nonMissing.length >= 0.95;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
