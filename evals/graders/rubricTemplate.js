/**
 * @file Rubric template construction (Phase 3A evaluation harness).
 *
 * Turns a benchmark's rubric plus a run's executions into the blank
 * human-review template a reviewer fills in. Every dimension carries its own
 * anchors into the template, so a reviewer never has to hold the rubric open
 * in another window and never has to guess what a 2 means.
 */
import { EVALUATION_REPORT_SCHEMA_VERSION } from "../schemas/evaluationReport.js";

export const SCALE_LEGEND = Object.freeze({
  0: "unacceptable",
  1: "major problems",
  2: "mixed",
  3: "good",
  4: "excellent",
  not_applicable: "this dimension does not apply to this case",
  cannot_determine: "the output does not contain enough information to judge this dimension",
});

export const REVIEW_INSTRUCTIONS =
  "Score each dimension independently on the 0-4 anchored scale below. Use not_applicable when the dimension genuinely does not apply to the case, and cannot_determine when the output does not give you enough to judge — do not split the difference with a 2. Leave reviewer_notes wherever a score would otherwise be unexplainable to someone else. These scores are structured opinion, not measurement: they are not calibrated, not inter-rater validated, and are not evidence that the system is fair or production-ready.";

/**
 * @param {object} options
 * @param {object} options.rubric validated rubric
 * @param {object} options.manifest run manifest
 * @param {object[]} options.caseResults
 * @param {Map<string, object>} options.casesById benchmark cases, for their
 *   declared `rubric_dimensions`
 * @returns {object} matching `humanReviewTemplateSchema`
 */
export function buildHumanReviewTemplate({ rubric, manifest, caseResults, casesById }) {
  const dimensionsById = new Map(rubric.dimensions.map((dimension) => [dimension.id, dimension]));

  const entries = [];
  for (const caseResult of caseResults) {
    const benchmarkCase = casesById.get(caseResult.case_id);
    const requested = benchmarkCase?.rubric_dimensions ?? rubric.dimensions.map((d) => d.id);

    for (const execution of caseResult.executions) {
      // A failed execution has no explanation to review. Including a blank
      // entry for it would invite a reviewer to score something that does not
      // exist.
      if (execution.status !== "completed") continue;

      entries.push({
        execution_id: execution.execution_id,
        case_id: execution.case_id,
        scenario_index: execution.scenario_index,
        repetition: execution.repetition,
        reviewer: "",
        reviewed_at: "",
        dimensions: requested
          .map((dimensionId) => dimensionsById.get(dimensionId))
          .filter(Boolean)
          .map((dimension) => ({
            dimension_id: dimension.id,
            label: dimension.label,
            what_is_judged: dimension.what_is_judged,
            anchors: { ...dimension.anchors },
            score: null,
            reviewer_notes: "",
          })),
        overall_notes: "",
      });
    }
  }

  return {
    schema_version: EVALUATION_REPORT_SCHEMA_VERSION,
    run_id: manifest.run_id,
    benchmark_id: manifest.benchmark_id,
    benchmark_version: manifest.benchmark_version,
    rubric_version: manifest.rubric_version,
    instructions: REVIEW_INSTRUCTIONS,
    scale_legend: { ...SCALE_LEGEND },
    entries,
  };
}
