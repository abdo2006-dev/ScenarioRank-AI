import { describe, it, expect } from "vitest";
import {
  clamp,
  normalizeWeights,
  applyDeltas,
  computeWeightedFitScore,
  computeOverallConfidence,
  computeExecutionRisk,
  computeCultureRisk,
  computeTimeRisk,
  computeAdaptabilityScore,
  computeExpectedOutcomeScore,
  computeRiskAdjustedScore,
  computePairScore,
} from "./scoring.js";

/**
 * Characterization tests: expected values were captured by running this
 * exact module (Phase 1A, before any formula change), not derived by
 * independent hand calculation. They pin current behavior so a future
 * refactor cannot silently change scoring, ranking, or clamping.
 */

describe("clamp", () => {
  it("passes values already inside [0, 100] through unchanged", () => {
    expect(clamp(50)).toBe(50);
  });
  it("floors below the default minimum", () => {
    expect(clamp(-10)).toBe(0);
  });
  it("ceilings above the default maximum", () => {
    expect(clamp(150)).toBe(100);
  });
  it("is inclusive at both default boundaries", () => {
    expect(clamp(0)).toBe(0);
    expect(clamp(100)).toBe(100);
  });
  it("honors custom min/max bounds", () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
  });
});

describe("computeWeightedFitScore", () => {
  it("computes the weighted sum divided by 10, rounded to 2 decimals", () => {
    expect(computeWeightedFitScore({ a: 8, b: 6 }, { a: 60, b: 40 })).toBe(72);
  });
  it("treats a missing score as 0 rather than throwing", () => {
    expect(computeWeightedFitScore({ a: 8 }, { a: 60, b: 40 })).toBe(48);
  });
  it("returns 0 for empty scores and weights", () => {
    expect(computeWeightedFitScore({}, {})).toBe(0);
  });
});

describe("computeOverallConfidence", () => {
  it("computes the weight-averaged confidence", () => {
    expect(computeOverallConfidence({ a: 0.9, b: 0.7 }, { a: 60, b: 40 })).toBe(0.82);
  });
  it("returns exactly 0 when total weight is 0, avoiding division by zero", () => {
    expect(computeOverallConfidence({}, {})).toBe(0);
  });
});

describe("computeExecutionRisk", () => {
  it("computes the weighted-inverse execution risk", () => {
    expect(
      computeExecutionRisk({ operational_execution: 8, domain_expertise: 7, crisis_management: 6 })
    ).toBe(28);
  });
  it("defaults every missing criterion to 0, yielding the maximum risk of 100", () => {
    expect(computeExecutionRisk({})).toBe(100);
  });
  it("clamps to 0 when all criteria are maxed out", () => {
    expect(
      computeExecutionRisk({ operational_execution: 10, domain_expertise: 10, crisis_management: 10 })
    ).toBe(0);
  });
});

describe("computeCultureRisk", () => {
  it("combines capability scores and a confidence value into one risk figure", () => {
    expect(
      computeCultureRisk({ stakeholder_management: 8, transformation_leadership: 7 }, { stakeholder_management: 0.9 })
    ).toBe(20);
  });
  it("defaults missing scores/confidence to 0, yielding maximum risk", () => {
    expect(computeCultureRisk({}, {})).toBe(100);
  });
});

describe("computeTimeRisk", () => {
  it("combines two criteria and the weighted fit score", () => {
    expect(computeTimeRisk({ domain_expertise: 8, operational_execution: 7 }, 75)).toBe(24.75);
  });
  it("defaults missing criteria and a 0 WFS to maximum risk", () => {
    expect(computeTimeRisk({}, 0)).toBe(100);
  });
});

describe("computeAdaptabilityScore", () => {
  // Phase 1C correctness fix (docs/architecture/KNOWN_LIMITATIONS.md P0.2,
  // docs/decisions/ADR-0003): this formula used to take a hardcoded
  // `cross_scenario_consistency` value of 75 from its caller as a second
  // argument, contributing a fixed 26.25-point floor regardless of any real
  // signal. That fabricated input is gone — the function now takes only
  // the candidate's real per-criterion scores, and these expected values
  // were re-derived by running the current (fixed) implementation, not by
  // hand. See runPipeline.test.js for the pipeline-level regression
  // coverage of this same fix.
  it("blends the three real criteria, renormalized to a 0-100 scale", () => {
    expect(
      computeAdaptabilityScore({ transformation_leadership: 8, stakeholder_management: 7, innovation_digital: 6 })
    ).toBe(70.77);
  });
  it("returns exactly 0 when all criteria are missing — no fabricated floor", () => {
    expect(computeAdaptabilityScore({})).toBe(0);
  });
  it("clamps to 100 at maximum inputs", () => {
    expect(
      computeAdaptabilityScore({ transformation_leadership: 10, stakeholder_management: 10, innovation_digital: 10 })
    ).toBe(100);
  });
  it("depends only on the three named criteria, not on any hidden constant", () => {
    expect(computeAdaptabilityScore({ transformation_leadership: 10 })).toBe(38.46);
  });
});

describe("computeExpectedOutcomeScore", () => {
  it("computes the weighted outcome blend", () => {
    expect(
      computeExpectedOutcomeScore({ wfs: 80, adapt: 70, exec: 20, cult: 15, time: 10, conf: 0.85 })
    ).toBe(79.75);
  });
});

describe("computeRiskAdjustedScore", () => {
  it("computes the risk-adjusted score for favorable inputs", () => {
    expect(
      computeRiskAdjustedScore({ wfs: 80, exec: 20, cult: 15, time: 10, conf: 0.85, adapt: 70, opp: 15 })
    ).toBe(63);
  });
  it("preserves signed scores and rounds before enforcing the public range", () => {
    expect(computeRiskAdjustedScore({ wfs: 50, exec: 50, cult: 50, time: 50, conf: 0.5, adapt: 50, opp: 50 })).toBe(0);
    expect(computeRiskAdjustedScore({ wfs: 50.1, exec: 49.9, cult: 49.92, time: 49.9, conf: 0.5, adapt: 50.1, opp: 49.91 })).toBe(0.18);
    expect(computeRiskAdjustedScore({ wfs: 49.9, exec: 50.1, cult: 50.08, time: 50.1, conf: 0.5, adapt: 49.9, opp: 50.09 })).toBe(-0.18);
    expect(computeRiskAdjustedScore({ wfs: 30, exec: 70, cult: 60, time: 70, conf: 0.8, adapt: 30, opp: 66.67 })).toBe(-30);
    expect(computeRiskAdjustedScore({ wfs: 10, exec: 90, cult: 92, time: 90, conf: 0, adapt: 10, opp: 90.67 })).toBe(-82);
  });

  it("bounds values only after preserving two-decimal signed rounding", () => {
    expect(computeRiskAdjustedScore({ wfs: -1, exec: 100, cult: 100, time: 100, conf: 0, adapt: 0, opp: 100 })).toBe(-100);
    expect(computeRiskAdjustedScore({ wfs: 101, exec: 0, cult: 0, time: 0, conf: 1, adapt: 100, opp: 0 })).toBe(100);
    expect(computeRiskAdjustedScore({ wfs: 50.004, exec: 0, cult: 0, time: 0, conf: 1, adapt: 100, opp: 0 })).toBe(50);
  });
});

describe("computePairScore", () => {
  it("computes the weighted pair-compatibility score", () => {
    expect(computePairScore({ sc: 0.8, comp: 0.7, coh: 0.75, pa: 0.6, conf: 0.3, over: 0.2 })).toBe(61.5);
  });
  it("clamps to 0 at the worst-case inputs", () => {
    expect(computePairScore({ sc: 0, comp: 0, coh: 0, pa: 0, conf: 1, over: 1 })).toBe(0);
  });
  it("reaches 90 (not 100) at the best-case inputs, since conf/over terms are only 0 there, not negative", () => {
    expect(computePairScore({ sc: 1, comp: 1, coh: 1, pa: 1, conf: 0, over: 0 })).toBe(90);
  });
});

describe("normalizeWeights", () => {
  it("passes already-normalized weights through with the same values", () => {
    expect(normalizeWeights({ a: 15, b: 15, c: 15, d: 15, e: 15, f: 12, g: 13 })).toEqual({
      a: 15, b: 15, c: 15, d: 15, e: 15, f: 12, g: 13,
    });
  });
  it("splits equally when every input is 0 (division-by-zero fallback path)", () => {
    const result = normalizeWeights({ a: 0, b: 0, c: 0 });
    // Documented current behavior: equal float division, NOT run through the
    // remainder-absorption branch, so the three values do not sum to exactly 100.
    expect(result.a).toBeCloseTo(33.333333333333336, 10);
    expect(result.b).toBeCloseTo(33.333333333333336, 10);
    expect(result.c).toBeCloseTo(33.333333333333336, 10);
  });
  it("clamps a negative adjusted weight to 0 before redistributing", () => {
    expect(normalizeWeights({ a: -10, b: 50, c: 50 })).toEqual({ a: 0, b: 50, c: 50 });
  });
  it("makes the last key absorb the rounding remainder so the total is exactly 100", () => {
    const result = normalizeWeights({ a: 33, b: 33, c: 34 });
    expect(result).toEqual({ a: 33, b: 33, c: 34 });
    expect(result.a + result.b + result.c).toBe(100);
  });
});

describe("applyDeltas", () => {
  it("applies signed deltas then re-normalizes to 100", () => {
    expect(
      applyDeltas(
        { a: 15, b: 15, c: 15, d: 15, e: 15, f: 12, g: 13 },
        { a: 10, b: -5, c: 0, d: 0, e: 0, f: 0, g: -5 }
      )
    ).toEqual({ a: 25, b: 10, c: 15, d: 15, e: 15, f: 12, g: 8 });
  });
  it("clamps a delta that pushes a weight below 0 before normalizing", () => {
    expect(applyDeltas({ a: 50, b: 50 }, { a: -100, b: 0 })).toEqual({ a: 0, b: 100 });
  });
});
