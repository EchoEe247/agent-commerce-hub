import test from "node:test";
import assert from "node:assert/strict";
import { scoreProfile } from "../src/dataset/scoring.mjs";

test("scores clean dataset at 100 and repeats identically", () => {
  const rawProfile = {
    record_count: 4,
    field_count: 2,
    duplicate_rows: 0,
    missing_cell_count: 0,
    fields: {
      id: { inferred_type: "integer", null_count: 0, distinct_count: 4, constant: false, near_constant: false, candidate_identifier: true },
      value: { inferred_type: "string", null_count: 0, distinct_count: 4, constant: false, near_constant: false, candidate_identifier: false },
    },
  };

  const first = scoreProfile(rawProfile);
  assert.equal(first.quality_score, 100);
  assert.deepEqual(first.score_breakdown, {
    missing_data: 0,
    duplicates: 0,
    type_conflicts: 0,
    malformed_records: 0,
    constant_fields: 0,
    identifier_integrity: 0,
  });

  assert.deepEqual(scoreProfile(rawProfile), first);
});

test("applies penalties and stays within bounds", () => {
  const rawProfile = {
    record_count: 10,
    field_count: 10,
    duplicate_rows: 5,
    missing_cell_count: 50,
    fields: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `f${i}`,
        {
          inferred_type: i === 0 ? "mixed" : (i === 1 ? "string" : "integer"),
          null_count: i === 2 ? 8 : 0,
          distinct_count: i === 3 ? 1 : 10,
          constant: i === 3,
          near_constant: i === 3,
          candidate_identifier: i === 4,
        },
      ])
    ),
  };

  const scored = scoreProfile(rawProfile);
  assert.ok(scored.quality_score >= 0 && scored.quality_score <= 100);
  assert.equal(scored.scoring_version, "1.0");
});
