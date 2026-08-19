import { LIMITS, ERROR_CODES } from "./limits.mjs";

const clampZero = (value) => value || 0;

export function scoreProfile(rawProfile) {
  const { record_count, field_count, duplicate_rows, fields } = rawProfile;
  const missingCellRatio = rawProfile.missing_cell_count / Math.max(1, record_count * field_count);
  const duplicateRowRatio = duplicate_rows / Math.max(1, record_count);

  const mixedFields = Object.values(fields).filter((f) => f.inferred_type === "mixed").length;
  const mixedFieldRatio = mixedFields / Math.max(1, field_count);

  const constantFields = Object.values(fields).filter((f) => f.constant).length;
  const constantFieldRatio = constantFields / Math.max(1, field_count);

  const candidateIdentifiers = Object.entries(fields).filter(([, f]) => f.candidate_identifier);
  let badIdentifierRatio = 0;
  if (candidateIdentifiers.length > 0) {
    const badCount = candidateIdentifiers.filter(([, f]) => f.null_count > 0 || f.distinct_count < record_count - f.null_count).length;
    badIdentifierRatio = badCount / candidateIdentifiers.length;
  }

  const missingData = clampZero(-Math.round(Math.min(25, missingCellRatio * 25)));
  const duplicates = clampZero(-Math.round(Math.min(20, duplicateRowRatio * 20)));
  const typeConflicts = clampZero(-Math.round(Math.min(20, mixedFieldRatio * 20)));
  const malformedRecords = 0;
  const constantFieldsPenalty = clampZero(-Math.round(Math.min(5, constantFieldRatio * 5)));
  const identifierIntegrity = clampZero(-Math.round(Math.min(10, badIdentifierRatio * 10)));

  const quality_score = Math.max(0, Math.min(100, 100 + missingData + duplicates + typeConflicts + malformedRecords + constantFieldsPenalty + identifierIntegrity));

  return {
    quality_score,
    score_breakdown: {
      missing_data: missingData,
      duplicates,
      type_conflicts: typeConflicts,
      malformed_records: malformedRecords,
      constant_fields: constantFieldsPenalty,
      identifier_integrity: identifierIntegrity,
    },
    scoring_version: "1.0",
  };
}
