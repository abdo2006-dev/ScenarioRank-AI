/**
 * @file Human-review parsing and aggregation (Phase 3A evaluation harness).
 *
 * A completed review is read back with the same strictness as any other
 * artifact, and aggregated in a way that deliberately refuses to hide the
 * detail: per-dimension statistics are always produced, and the single
 * convenience mean is `null` unless enough dimensions were actually scored to
 * mean anything.
 *
 * `not_applicable` and `cannot_determine` are never silently coerced to a
 * number. Counting "the reviewer could not tell" as a mid-range score would
 * manufacture data that was explicitly declined.
 */
import {
  humanReviewTemplateSchema,
  humanReviewAggregateSchema,
} from "../schemas/evaluationReport.js";

/** Below this many scored dimensions, a single aggregate number is noise. */
export const MINIMUM_SCORED_DIMENSIONS_FOR_AGGREGATE = 5;

export const AGGREGATE_CAVEAT =
  "This aggregate is a convenience only. It averages independent qualitative judgments that are not calibrated and not inter-rater validated, and it must never be reported without the per-dimension scores it was derived from.";

/**
 * @param {unknown} value a filled-in human-review template
 * @returns {object} validated review
 */
export function parseHumanReview(value) {
  const result = humanReviewTemplateSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Human review file is not valid:\n${result.error.issues
        .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return result.data;
}

/**
 * Aggregates a completed review, retaining dimension-level detail.
 * @param {object} review validated human review
 * @returns {object} matching `humanReviewAggregateSchema`
 */
export function aggregateHumanReview(review) {
  const dimensionScores = {};
  let scoredEntries = 0;

  for (const entry of review.entries) {
    let entryHasScore = false;
    for (const dimension of entry.dimensions) {
      if (!dimensionScores[dimension.dimension_id]) {
        dimensionScores[dimension.dimension_id] = {
          scored_count: 0,
          not_applicable_count: 0,
          cannot_determine_count: 0,
          values: [],
        };
      }
      const bucket = dimensionScores[dimension.dimension_id];
      if (dimension.score === "not_applicable") {
        bucket.not_applicable_count += 1;
      } else if (dimension.score === "cannot_determine") {
        bucket.cannot_determine_count += 1;
      } else if (typeof dimension.score === "number") {
        bucket.scored_count += 1;
        bucket.values.push(dimension.score);
        entryHasScore = true;
      }
    }
    if (entryHasScore) scoredEntries += 1;
  }

  const finalised = {};
  const allValues = [];
  for (const [dimensionId, bucket] of Object.entries(dimensionScores)) {
    allValues.push(...bucket.values);
    finalised[dimensionId] = {
      scored_count: bucket.scored_count,
      not_applicable_count: bucket.not_applicable_count,
      cannot_determine_count: bucket.cannot_determine_count,
      mean:
        bucket.values.length > 0
          ? Number((bucket.values.reduce((a, b) => a + b, 0) / bucket.values.length).toFixed(4))
          : null,
      min: bucket.values.length > 0 ? Math.min(...bucket.values) : null,
      max: bucket.values.length > 0 ? Math.max(...bucket.values) : null,
    };
  }

  const aggregate = {
    scored_entries: scoredEntries,
    dimension_scores: finalised,
    aggregate_mean:
      allValues.length >= MINIMUM_SCORED_DIMENSIONS_FOR_AGGREGATE
        ? Number((allValues.reduce((a, b) => a + b, 0) / allValues.length).toFixed(4))
        : null,
    aggregate_caveat: AGGREGATE_CAVEAT,
  };

  return humanReviewAggregateSchema.parse(aggregate);
}

/**
 * True when a review file carries at least one real score. Used by the
 * comparison command to decide whether rubric comparison is possible at all,
 * rather than comparing two empty templates and calling the result unchanged.
 * @param {object} review
 */
export function hasAnyScores(review) {
  return review.entries.some((entry) =>
    entry.dimensions.some((dimension) => typeof dimension.score === "number"),
  );
}
