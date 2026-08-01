/**
 * @file Human-review and comparison report schemas (Phase 3A evaluation harness).
 *
 * Two deliberate design constraints are encoded here:
 *
 *  1. **Dimension-level scores are never discarded.** A report MAY carry an
 *     aggregate for convenience, but the per-dimension scores are required, so
 *     "the explanation quality was 3.1" can always be unpacked into which
 *     dimension was weak. Collapsing qualitative judgment into one opaque
 *     number is exactly the failure this phase exists to avoid.
 *
 *  2. **A comparison never claims statistical significance.** The verdict
 *     vocabulary is `improved | regressed | unchanged | inconclusive`, and
 *     numeric deltas (cost, tokens, duration) are reported with an explicit
 *     `significance: "not_assessed"` marker. Two runs of a benchmark this size
 *     cannot support a significance claim, so the schema does not offer a
 *     field in which to make one.
 */
import { z } from "zod";
import { benchmarkCaseIdSchema } from "./benchmarkCase.js";

export const EVALUATION_REPORT_SCHEMA_VERSION = "1.0.0";

export const COMPARISON_VERDICTS = Object.freeze([
  "improved",
  "regressed",
  "unchanged",
  "inconclusive",
]);

/** 0-4 anchored scale, plus two explicit non-scores. */
export const humanReviewScoreSchema = z.union([
  z.number().int().min(0).max(4),
  z.literal("not_applicable"),
  z.literal("cannot_determine"),
]);

export const humanReviewDimensionSchema = z
  .object({
    dimension_id: z.string().min(1),
    label: z.string().min(1),
    what_is_judged: z.string().min(1),
    anchors: z.record(z.string().min(1)),
    score: humanReviewScoreSchema.nullable(),
    reviewer_notes: z.string(),
  })
  .strict();

export const humanReviewEntrySchema = z
  .object({
    execution_id: z.string().min(1),
    case_id: benchmarkCaseIdSchema,
    scenario_index: z.number().int().min(0),
    repetition: z.number().int().min(1),
    /** Filled in by the reviewer, not by the harness. */
    reviewer: z.string(),
    reviewed_at: z.string(),
    dimensions: z.array(humanReviewDimensionSchema).min(1),
    overall_notes: z.string(),
  })
  .strict();

export const humanReviewTemplateSchema = z
  .object({
    schema_version: z.string().min(1),
    run_id: z.string().min(1),
    benchmark_id: z.string().min(1),
    benchmark_version: z.string().min(1),
    rubric_version: z.string().min(1),
    instructions: z.string().min(40),
    scale_legend: z.record(z.string().min(1)),
    entries: z.array(humanReviewEntrySchema),
  })
  .strict();

/**
 * Aggregate of a completed human review. `dimension_scores` is required and
 * always retained; `aggregate_mean` is a convenience only, and is explicitly
 * `null` when too few dimensions were actually scored to mean anything.
 */
export const humanReviewAggregateSchema = z
  .object({
    scored_entries: z.number().int().min(0),
    dimension_scores: z.record(
      z
        .object({
          scored_count: z.number().int().min(0),
          not_applicable_count: z.number().int().min(0),
          cannot_determine_count: z.number().int().min(0),
          mean: z.number().min(0).max(4).nullable(),
          min: z.number().int().min(0).max(4).nullable(),
          max: z.number().int().min(0).max(4).nullable(),
        })
        .strict(),
    ),
    aggregate_mean: z.number().min(0).max(4).nullable(),
    aggregate_caveat: z.string().min(20),
  })
  .strict();

const numericDeltaSchema = z
  .object({
    baseline: z.number().nullable(),
    candidate: z.number().nullable(),
    delta: z.number().nullable(),
    /**
     * Always "not_assessed" in Phase 3A. A benchmark of this size, run without
     * a designed repetition schedule, cannot support a significance claim.
     */
    significance: z.literal("not_assessed"),
  })
  .strict();

export const caseComparisonSchema = z
  .object({
    case_id: benchmarkCaseIdSchema,
    verdict: z.enum(COMPARISON_VERDICTS),
    reasons: z.array(z.string().min(1)),
    winner_changed: z.boolean(),
    ranking_changed: z.boolean(),
    best_pair_changed: z.boolean(),
    structured_evidence_changed: z.boolean(),
    explanation_changed: z.boolean(),
    required_failures: numericDeltaSchema,
    advisory_failures: numericDeltaSchema,
    schema_failures: numericDeltaSchema,
  })
  .strict();

export const comparisonReportSchema = z
  .object({
    schema_version: z.string().min(1),
    generated_at: z.string().datetime(),
    baseline_run_id: z.string().min(1),
    candidate_run_id: z.string().min(1),
    benchmark_id: z.string().min(1),
    benchmark_version: z.string().min(1),
    verdict: z.enum(COMPARISON_VERDICTS),
    verdict_reasons: z.array(z.string().min(1)).min(1),
    invariants: z
      .object({
        required_failures: numericDeltaSchema,
        advisory_failures: numericDeltaSchema,
        schema_failures: numericDeltaSchema,
        passed_cases: numericDeltaSchema,
      })
      .strict(),
    cost: numericDeltaSchema,
    tokens: numericDeltaSchema,
    duration_ms: numericDeltaSchema,
    /** Rubric comparison is only populated when BOTH runs carry a review. */
    rubric: z
      .object({
        compared: z.boolean(),
        reason: z.string().min(1),
        dimensions: z.record(numericDeltaSchema),
      })
      .strict(),
    stability: z
      .object({
        compared: z.boolean(),
        reason: z.string().min(1),
        baseline_winner_agreement: z.number().min(0).max(1).nullable(),
        candidate_winner_agreement: z.number().min(0).max(1).nullable(),
      })
      .strict(),
    winner_changes: z.array(benchmarkCaseIdSchema),
    ranking_changes: z.array(benchmarkCaseIdSchema),
    pair_changes: z.array(benchmarkCaseIdSchema),
    cases: z.array(caseComparisonSchema),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict();

/** Reusable helper so every numeric delta is built the same, honest way. */
export function numericDelta(baseline, candidate) {
  const bothNumeric = typeof baseline === "number" && typeof candidate === "number";
  return {
    baseline: typeof baseline === "number" ? baseline : null,
    candidate: typeof candidate === "number" ? candidate : null,
    delta: bothNumeric ? Number((candidate - baseline).toFixed(10)) : null,
    significance: "not_assessed",
  };
}
