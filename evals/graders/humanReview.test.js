/**
 * Human-review template and aggregation tests.
 *
 * The behaviour these lock down is mostly about what the harness refuses to
 * do: coerce a declined judgment into a number, or collapse eight dimensions
 * into one figure that hides which one was weak.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { loadBenchmark } from "../datasets/loadBenchmark.js";
import { createEvalFakeProvider } from "../fixtures/fakeProviderProfiles.js";
import { runCase } from "../runners/runCase.js";
import { buildHumanReviewTemplate, SCALE_LEGEND, REVIEW_INSTRUCTIONS } from "./rubricTemplate.js";
import {
  parseHumanReview,
  aggregateHumanReview,
  hasAnyScores,
  MINIMUM_SCORED_DIMENSIONS_FOR_AGGREGATE,
  AGGREGATE_CAVEAT,
} from "./humanReview.js";

let benchmark;
let caseById;

beforeAll(async () => {
  benchmark = await loadBenchmark();
  caseById = new Map(benchmark.cases.map((entry) => [entry.case_id, entry]));
});

async function templateFor(caseIds, { profile } = {}) {
  const caseResults = [];
  for (const caseId of caseIds) {
    const benchmarkCase = caseById.get(caseId);
    caseResults.push(
      await runCase({
        benchmarkCase,
        model: "fixture:test",
        createProvider: ({ scenarioIndex }) =>
          createEvalFakeProvider({ benchmarkCase, scenarioIndex, profile }),
      }),
    );
  }
  return buildHumanReviewTemplate({
    rubric: benchmark.rubric,
    manifest: {
      run_id: "run-test",
      benchmark_id: benchmark.manifest.benchmark_id,
      benchmark_version: benchmark.manifest.benchmark_version,
      rubric_version: benchmark.rubric.rubric_version,
    },
    caseResults,
    casesById: caseById,
  });
}

describe("human-review template", () => {
  it("creates one entry per completed execution", async () => {
    const template = await templateFor(["case-004"]);
    expect(template.entries).toHaveLength(2);
    expect(template.entries.map((entry) => entry.scenario_index)).toEqual([0, 1]);
  });

  it("omits failed executions, which have no explanation to review", async () => {
    const template = await templateFor(["case-007"], { profile: "unknown-candidate" });
    expect(template.entries).toHaveLength(0);
  });

  it("carries each dimension's anchors into the template", async () => {
    const template = await templateFor(["case-007"]);
    for (const dimension of template.entries[0].dimensions) {
      expect(Object.keys(dimension.anchors).sort()).toEqual(["0", "1", "2", "3", "4"]);
      expect(dimension.what_is_judged.length).toBeGreaterThan(20);
    }
  });

  it("asks only for the dimensions a case declares", async () => {
    const plain = await templateFor(["case-007"]);
    const pairing = await templateFor(["case-015"]);
    const dimensionIds = (template) => template.entries[0].dimensions.map((d) => d.dimension_id);
    expect(dimensionIds(plain)).not.toContain("pairing_usefulness");
    expect(dimensionIds(pairing)).toContain("pairing_usefulness");
  });

  it("leaves every score unset for the reviewer to fill in", async () => {
    const template = await templateFor(["case-007"]);
    for (const dimension of template.entries[0].dimensions) {
      expect(dimension.score).toBeNull();
      expect(dimension.reviewer_notes).toBe("");
    }
    expect(template.entries[0].reviewer).toBe("");
  });

  it("includes the anchored scale legend and both non-scores", async () => {
    const template = await templateFor(["case-007"]);
    expect(template.scale_legend).toEqual(SCALE_LEGEND);
    expect(template.scale_legend.not_applicable).toBeTruthy();
    expect(template.scale_legend.cannot_determine).toBeTruthy();
  });

  it("states that the scores are opinion, not measurement", async () => {
    const template = await templateFor(["case-007"]);
    expect(template.instructions).toBe(REVIEW_INSTRUCTIONS);
    expect(template.instructions).toContain("not calibrated");
    expect(template.instructions).toContain("structured opinion");
  });

  it("validates as a human-review template", async () => {
    const template = await templateFor(["case-007"]);
    expect(() => parseHumanReview(template)).not.toThrow();
  });
});

function review(dimensionsPerEntry) {
  return parseHumanReview({
    schema_version: "1.0.0",
    run_id: "r",
    benchmark_id: "decision-benchmark-v1",
    benchmark_version: "1.0.0",
    rubric_version: "1.0.0",
    instructions: "x".repeat(50),
    scale_legend: { 0: "unacceptable" },
    entries: dimensionsPerEntry.map((dimensions, index) => ({
      execution_id: `e${index}`,
      case_id: "case-001",
      scenario_index: 0,
      repetition: 1,
      reviewer: "reviewer",
      reviewed_at: "2026-08-02",
      dimensions: Object.entries(dimensions).map(([id, score]) => ({
        dimension_id: id,
        label: id,
        what_is_judged: "judged",
        anchors: { 0: "bad" },
        score,
        reviewer_notes: "",
      })),
      overall_notes: "",
    })),
  });
}

describe("human-review aggregation", () => {
  it("retains per-dimension statistics", () => {
    const aggregate = aggregateHumanReview(review([{ clarity: 2 }, { clarity: 4 }]));
    expect(aggregate.dimension_scores.clarity).toMatchObject({
      scored_count: 2,
      mean: 3,
      min: 2,
      max: 4,
    });
  });

  it("never coerces not_applicable or cannot_determine into a number", () => {
    const aggregate = aggregateHumanReview(
      review([{ clarity: "not_applicable" }, { clarity: "cannot_determine" }, { clarity: 4 }]),
    );
    expect(aggregate.dimension_scores.clarity).toMatchObject({
      scored_count: 1,
      not_applicable_count: 1,
      cannot_determine_count: 1,
      mean: 4,
    });
  });

  it("reports a null mean for a dimension nobody scored", () => {
    const aggregate = aggregateHumanReview(review([{ clarity: "not_applicable" }]));
    expect(aggregate.dimension_scores.clarity.mean).toBeNull();
    expect(aggregate.dimension_scores.clarity.min).toBeNull();
  });

  it("withholds the convenience aggregate below the minimum sample", () => {
    const aggregate = aggregateHumanReview(review([{ clarity: 3 }]));
    expect(aggregate.aggregate_mean).toBeNull();
  });

  it("produces the convenience aggregate once enough dimensions are scored", () => {
    const scores = Object.fromEntries(
      Array.from({ length: MINIMUM_SCORED_DIMENSIONS_FOR_AGGREGATE }, (_, index) => [`d${index}`, 4]),
    );
    const aggregate = aggregateHumanReview(review([scores]));
    expect(aggregate.aggregate_mean).toBe(4);
  });

  it("always attaches the caveat to the aggregate", () => {
    const aggregate = aggregateHumanReview(review([{ clarity: 3 }]));
    expect(aggregate.aggregate_caveat).toBe(AGGREGATE_CAVEAT);
    expect(aggregate.aggregate_caveat).toContain("never be reported without the per-dimension scores");
  });

  it("counts only entries that carry at least one real score", () => {
    const aggregate = aggregateHumanReview(
      review([{ clarity: 3 }, { clarity: "cannot_determine" }, { clarity: null }]),
    );
    expect(aggregate.scored_entries).toBe(1);
  });
});

describe("review completeness detection", () => {
  it("recognises a blank template as unscored", () => {
    expect(hasAnyScores(review([{ clarity: null }]))).toBe(false);
  });

  it("does not treat declined judgments as scores", () => {
    expect(hasAnyScores(review([{ clarity: "cannot_determine" }]))).toBe(false);
  });

  it("recognises a single real score", () => {
    expect(hasAnyScores(review([{ clarity: 0 }]))).toBe(true);
  });
});

describe("review parsing", () => {
  it("rejects a score outside the anchored scale", () => {
    expect(() => review([{ clarity: 7 }])).toThrow(/not valid/);
  });

  it("rejects an unrecognised non-score", () => {
    expect(() => review([{ clarity: "probably_fine" }])).toThrow(/not valid/);
  });

  it("rejects a review with no dimensions on an entry", () => {
    expect(() => review([{}])).toThrow(/not valid/);
  });
});
