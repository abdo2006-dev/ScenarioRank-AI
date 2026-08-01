/**
 * Case-variant utility tests: controlled changes, preserved linkage, and
 * variants that are still valid benchmark cases.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { loadBenchmark } from "../datasets/loadBenchmark.js";
import {
  createCandidateOrderVariant,
  createScenarioOrderVariant,
  createWordingVariant,
  createIrrelevantTextVariant,
  validateVariant,
} from "./caseVariants.js";

let caseById;

beforeAll(async () => {
  const benchmark = await loadBenchmark();
  caseById = new Map(benchmark.cases.map((entry) => [entry.case_id, entry]));
});

const ids = (benchmarkCase) => benchmarkCase.input.candidates.map((candidate) => candidate.id);

describe("candidate-order variant", () => {
  it("reverses the submitted order while preserving the candidate set", () => {
    const original = caseById.get("case-001");
    const variant = createCandidateOrderVariant(original, "case-901");
    expect(ids(variant)).toEqual([...ids(original)].reverse());
    expect([...ids(variant)].sort()).toEqual([...ids(original)].sort());
  });

  it("keeps expectations in step with the new order", () => {
    const variant = createCandidateOrderVariant(caseById.get("case-001"), "case-901");
    expect(variant.deterministic_expectations.expected_candidate_ids).toEqual(ids(variant));
  });

  it("records the linkage and tags itself a permutation", () => {
    const variant = createCandidateOrderVariant(caseById.get("case-001"), "case-901");
    expect(variant.variant_of).toBe("case-001");
    expect(variant.variant_kind).toBe("candidate-order");
    expect(variant.tags).toContain("permutation");
  });

  it("produces a case that still validates", () => {
    expect(() => validateVariant(createCandidateOrderVariant(caseById.get("case-001"), "case-901"))).not.toThrow();
  });

  it("changes nothing but the order", () => {
    const original = caseById.get("case-001");
    const variant = createCandidateOrderVariant(original, "case-901");
    expect(variant.input.scenarios).toEqual(original.input.scenarios);
    expect(variant.input.role).toEqual(original.input.role);
    expect(variant.fake_provider_plan.candidate_scores).toEqual(
      original.fake_provider_plan.candidate_scores,
    );
  });
});

describe("scenario-order variant", () => {
  it("reverses scenario order", () => {
    const original = caseById.get("case-004");
    const variant = createScenarioOrderVariant(original, "case-902");
    expect(variant.input.scenarios).toEqual([...original.input.scenarios].reverse());
    expect(variant.deterministic_expectations.required_scenario_coverage).toEqual(
      variant.input.scenarios,
    );
  });

  it("moves each scenario's weight deltas with it", () => {
    const original = caseById.get("case-004");
    const variant = createScenarioOrderVariant(original, "case-902");
    expect(variant.fake_provider_plan.scenario_weight_deltas["1"]).toEqual(
      original.fake_provider_plan.scenario_weight_deltas["0"],
    );
    expect(variant.fake_provider_plan.scenario_weight_deltas["0"]).toEqual(
      original.fake_provider_plan.scenario_weight_deltas["1"],
    );
  });

  it("moves each scenario's score overrides with it", () => {
    const original = caseById.get("case-006");
    const variant = createScenarioOrderVariant(original, "case-902");
    expect(variant.fake_provider_plan.scenario_overrides["0"]).toEqual(
      original.fake_provider_plan.scenario_overrides["1"],
    );
  });

  it("produces a case that still validates", () => {
    expect(() => validateVariant(createScenarioOrderVariant(caseById.get("case-004"), "case-902"))).not.toThrow();
  });
});

describe("wording variant", () => {
  it("applies the caller's rewrite to every description", () => {
    const original = caseById.get("case-007");
    const variant = createWordingVariant(original, "case-903", (text) => `Rewritten: ${text}`);
    for (const candidate of variant.input.candidates) {
      expect(candidate.description.startsWith("Rewritten: ")).toBe(true);
    }
  });

  it("preserves candidate IDs so the two cases stay comparable", () => {
    const original = caseById.get("case-007");
    const variant = createWordingVariant(original, "case-903", (text) => `Reworded. ${text}`);
    expect(ids(variant)).toEqual(ids(original));
  });

  it("leaves the role, scenarios, and score plan untouched", () => {
    const original = caseById.get("case-007");
    const variant = createWordingVariant(original, "case-903", (text) => `Reworded. ${text}`);
    expect(variant.input.role).toEqual(original.input.role);
    expect(variant.input.scenarios).toEqual(original.input.scenarios);
    expect(variant.fake_provider_plan).toEqual(original.fake_provider_plan);
  });

  it("produces a case that still validates", () => {
    const variant = createWordingVariant(caseById.get("case-007"), "case-903", (text) => `Reworded. ${text}`);
    expect(() => validateVariant(variant)).not.toThrow();
  });
});

describe("irrelevant-text variant", () => {
  it("appends exactly one sentence per candidate", () => {
    const original = caseById.get("case-007");
    const variant = createIrrelevantTextVariant(original, "case-904");
    variant.input.candidates.forEach((candidate, index) => {
      expect(candidate.description.startsWith(original.input.candidates[index].description)).toBe(true);
      expect(candidate.description.length).toBeGreaterThan(
        original.input.candidates[index].description.length,
      );
    });
  });

  it("accepts caller-supplied sentences", () => {
    const variant = createIrrelevantTextVariant(caseById.get("case-007"), "case-904", [
      "An entirely irrelevant sentence.",
    ]);
    for (const candidate of variant.input.candidates) {
      expect(candidate.description.endsWith("An entirely irrelevant sentence.")).toBe(true);
    }
  });

  it("preserves candidate IDs and the score plan", () => {
    const original = caseById.get("case-007");
    const variant = createIrrelevantTextVariant(original, "case-904");
    expect(ids(variant)).toEqual(ids(original));
    expect(variant.fake_provider_plan).toEqual(original.fake_provider_plan);
  });

  it("produces a case that still validates", () => {
    expect(() => validateVariant(createIrrelevantTextVariant(caseById.get("case-007"), "case-904"))).not.toThrow();
  });
});

describe("variant validation", () => {
  it("rejects a generated variant that is not a valid case", () => {
    const broken = createCandidateOrderVariant(caseById.get("case-001"), "case-905");
    broken.tags = ["not-a-tag"];
    expect(() => validateVariant(broken)).toThrow(/not a valid benchmark case/);
  });

  it("links a variant of a variant back to the original case", () => {
    const first = createCandidateOrderVariant(caseById.get("case-001"), "case-906");
    const second = createIrrelevantTextVariant(first, "case-907");
    expect(second.variant_of).toBe("case-001");
  });

  it("does not mutate the case it derives from", () => {
    const original = caseById.get("case-001");
    const before = JSON.stringify(original);
    createCandidateOrderVariant(original, "case-908");
    createIrrelevantTextVariant(original, "case-909");
    createWordingVariant(original, "case-910", (text) => `x ${text}`);
    expect(JSON.stringify(original)).toBe(before);
  });
});
