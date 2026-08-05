/**
 * Benchmark manifest, rubric, and case *schema* tests.
 *
 * These prove the schemas reject the specific malformed inputs that would
 * otherwise let a quietly broken benchmark produce confident-looking numbers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  benchmarkCaseSchema,
  parseBenchmarkCase,
  canonicalPairKey,
  BENCHMARK_TAGS,
} from "./benchmarkCase.js";
import {
  benchmarkManifestSchema,
  rubricSchema,
  assertSupportedSchemaVersion,
  assertPipelineCompatibility,
  SUPPORTED_BENCHMARK_SCHEMA_VERSIONS,
  EVAL_PIPELINE_VERSION,
} from "./benchmarkManifest.js";
import { findArtifactPolicyViolations, assertArtifactIsPolicyClean } from "./evaluationRun.js";
import { numericDelta } from "./evaluationReport.js";

const DATASET = path.resolve("evals/datasets/decision-benchmark-v1");
const readJson = (relative) => JSON.parse(readFileSync(path.join(DATASET, relative), "utf8"));
const manifestFixture = () => readJson("manifest.json");
const caseFixture = (id = "case-001") => readJson(`cases/${id}.json`);

describe("benchmark manifest schema", () => {
  it("accepts the committed manifest", () => {
    expect(benchmarkManifestSchema.safeParse(manifestFixture()).success).toBe(true);
  });

  it("rejects duplicate case IDs", () => {
    const manifest = manifestFixture();
    manifest.case_ids = [...manifest.case_ids.slice(0, -1), manifest.case_ids[0]];
    const result = benchmarkManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error.issues)).toContain("Duplicate case id");
  });

  it("rejects a case_count that disagrees with case_ids", () => {
    const manifest = manifestFixture();
    manifest.case_count = manifest.case_ids.length + 1;
    const result = benchmarkManifestSchema.safeParse(manifest);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error.issues)).toContain("does not match case_ids length");
  });

  it("rejects an unsupported schema version rather than guessing", () => {
    expect(() => assertSupportedSchemaVersion("9.9.9")).toThrow(/Unsupported benchmark schema_version/);
    expect(() => assertSupportedSchemaVersion(SUPPORTED_BENCHMARK_SCHEMA_VERSIONS[0])).not.toThrow();
  });

  it("requires the synthetic-data policy and a scope disclaimer", () => {
    const withoutPolicy = manifestFixture();
    delete withoutPolicy.data_policy;
    expect(benchmarkManifestSchema.safeParse(withoutPolicy).success).toBe(false);

    const shortDisclaimer = manifestFixture();
    shortDisclaimer.scope_disclaimer = "fine";
    expect(benchmarkManifestSchema.safeParse(shortDisclaimer).success).toBe(false);
  });

  it("requires every versioning-policy commitment to be affirmed", () => {
    const manifest = manifestFixture();
    manifest.versioning_policy.case_ids_immutable = false;
    expect(benchmarkManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe("rubric schema", () => {
  it("accepts the committed rubric", () => {
    expect(rubricSchema.safeParse(readJson("rubric.json")).success).toBe(true);
  });

  it("rejects duplicate dimension IDs", () => {
    const rubric = readJson("rubric.json");
    rubric.dimensions.push({ ...rubric.dimensions[0] });
    const result = rubricSchema.safeParse(rubric);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error.issues)).toContain("Duplicate rubric dimension");
  });

  it("rejects a dimension claiming automation without naming a grader", () => {
    const rubric = readJson("rubric.json");
    rubric.dimensions[0].deterministic_automation_possible = true;
    rubric.dimensions[0].deterministic_grader_id = null;
    expect(rubricSchema.safeParse(rubric).success).toBe(false);
  });

  it("rejects a dimension naming a grader while claiming no automation", () => {
    const rubric = readJson("rubric.json");
    const automated = rubric.dimensions.find((d) => d.deterministic_automation_possible);
    automated.deterministic_automation_possible = false;
    expect(rubricSchema.safeParse(rubric).success).toBe(false);
  });

  it("requires an anchor for every point on the scale", () => {
    const rubric = readJson("rubric.json");
    delete rubric.dimensions[0].anchors[2];
    expect(rubricSchema.safeParse(rubric).success).toBe(false);
  });
});

describe("benchmark case schema", () => {
  it("accepts every committed case", () => {
    for (const id of manifestFixture().case_ids) {
      expect(parseBenchmarkCase(caseFixture(id)).ok, id).toBe(true);
    }
  });

  it("rejects an unknown tag", () => {
    const value = caseFixture();
    value.tags = ["not-a-real-tag"];
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("accepts only tags from the closed vocabulary", () => {
    for (const tag of BENCHMARK_TAGS) {
      const value = caseFixture();
      value.tags = [tag];
      // Variant cases additionally require the permutation tag, so the check
      // is scoped to the tag vocabulary itself.
      value.variant_of = null;
      value.variant_kind = null;
      expect(parseBenchmarkCase(value).ok, tag).toBe(true);
    }
  });

  it("rejects a malformed case ID", () => {
    const value = caseFixture();
    value.case_id = "case-1";
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects malformed candidate IDs", () => {
    const value = caseFixture();
    value.input.candidates[0].id = "Has Spaces And Capitals";
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects duplicate candidate IDs", () => {
    const value = caseFixture();
    value.input.candidates[1].id = value.input.candidates[0].id;
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("accepts duplicate display names when the IDs are distinct", () => {
    const value = caseFixture("case-015");
    const names = value.input.candidates.map((candidate) => candidate.name);
    expect(new Set(names).size).toBeLessThan(names.length);
    expect(parseBenchmarkCase(value).ok).toBe(true);
  });

  it("requires the synthetic-data policy metadata", () => {
    const withoutSynthetic = caseFixture();
    withoutSynthetic.synthetic = false;
    expect(parseBenchmarkCase(withoutSynthetic).ok).toBe(false);

    const withoutPolicy = caseFixture();
    withoutPolicy.data_policy = "real";
    expect(parseBenchmarkCase(withoutPolicy).ok).toBe(false);
  });

  it("rejects fewer than the minimum candidates", () => {
    const value = caseFixture();
    value.input.candidates = value.input.candidates.slice(0, 1);
    value.deterministic_expectations.expected_candidate_ids = value.input.candidates.map((c) => c.id);
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects more than the maximum candidates", () => {
    const value = caseFixture();
    value.input.candidates = Array.from({ length: 11 }, (_, index) => ({
      id: `candidate-${index}`,
      name: `Candidate ${index}`,
      description: "A fictional candidate description.",
    }));
    value.deterministic_expectations.expected_candidate_ids = value.input.candidates.map((c) => c.id);
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects more scenarios than the shared contract allows", () => {
    const value = caseFixture();
    value.input.scenarios = Array.from({ length: 6 }, (_, index) => `Scenario ${index}.`);
    value.deterministic_expectations.required_scenario_coverage = value.input.scenarios;
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects expected_candidate_ids that disagree with the candidate list", () => {
    const value = caseFixture();
    value.deterministic_expectations.expected_candidate_ids = ["ghost"];
    const parsed = parseBenchmarkCase(value);
    expect(parsed.ok).toBe(false);
    expect(parsed.issues.join(" ")).toContain("expected_candidate_ids");
  });

  it("rejects a pair count that does not match the candidate count", () => {
    const value = caseFixture("case-015");
    value.deterministic_expectations.expected_pair_count = 3;
    const parsed = parseBenchmarkCase(value);
    expect(parsed.ok).toBe(false);
    expect(parsed.issues.join(" ")).toContain("expected_pair_count must be 6");
  });

  it("requires 4 logical stages with pairing and 3 without", () => {
    const pairing = caseFixture("case-015");
    pairing.deterministic_expectations.required_stage_count = 3;
    expect(parseBenchmarkCase(pairing).ok).toBe(false);

    const noPairing = caseFixture("case-001");
    noPairing.deterministic_expectations.required_stage_count = 4;
    expect(parseBenchmarkCase(noPairing).ok).toBe(false);
  });

  it("rejects expected_best_pair_ids when pairing is disabled", () => {
    const value = caseFixture("case-001");
    value.deterministic_expectations.expected_best_pair_ids = ["nadia-brookfield", "owen-kestrel"];
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects a winner expectation that names an unknown candidate", () => {
    const value = caseFixture();
    value.deterministic_expectations.allowed_winner_ids = ["nobody"];
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects a candidate that is both allowed and forbidden", () => {
    const value = caseFixture();
    const id = value.input.candidates[0].id;
    value.deterministic_expectations.allowed_winner_ids = [id];
    value.deterministic_expectations.forbidden_winner_ids = [id];
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("allows a case to make no winner claim at all", () => {
    const value = caseFixture("case-008");
    expect(value.deterministic_expectations.allowed_winner_ids).toBeNull();
    expect(parseBenchmarkCase(value).ok).toBe(true);
  });

  it("requires a fake-provider score plan for every candidate", () => {
    const value = caseFixture();
    delete value.fake_provider_plan.candidate_scores[value.input.candidates[0].id];
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects a fake-provider plan scoring an unknown candidate", () => {
    const value = caseFixture();
    value.fake_provider_plan.candidate_scores["ghost-candidate"] = { default: 5 };
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects a scenario override index beyond the case's scenarios", () => {
    const value = caseFixture("case-001");
    value.fake_provider_plan.scenario_weight_deltas = { 4: { domain_expertise: 5 } };
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("requires variant_of and variant_kind to be set together", () => {
    const value = caseFixture("case-011");
    value.variant_kind = null;
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("requires a variant to carry the permutation tag", () => {
    const value = caseFixture("case-011");
    value.tags = value.tags.filter((tag) => tag !== "permutation");
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("rejects a case that is a variant of itself", () => {
    const value = caseFixture("case-011");
    value.variant_of = value.case_id;
    expect(parseBenchmarkCase(value).ok).toBe(false);
  });

  it("defaults known_defects to an empty list", () => {
    const value = caseFixture("case-002");
    delete value.known_defects;
    const parsed = benchmarkCaseSchema.parse(value);
    expect(parsed.known_defects).toEqual([]);
  });

  it("rejects a known defect with a malformed ID or a missing reference", () => {
    const badId = caseFixture("case-001");
    badId.known_defects = [{
      defect_id: "SR-TEST-001",
      title: "A synthetic schema-test defect.",
      case_id: badId.case_id,
      execution_scope: { execution_id: "case-001#s0#r1", scenario_id: "scenario-1", scenario_index: 0, variant_id: null, repetition: 1 },
      expected_observations: [{ grader_id: "contract-validity", signature: { kind: "schema_issue", path_pattern: "candidate_evaluations.*.risk_adjusted_score", code: "too_small", minimum: 0, subject_candidate_id: "priya-tallow" } }],
      summary: "Synthetic schema-test defect.",
      reference: "docs/evaluation/BENCHMARK_V1.md",
    }];
    badId.known_defects[0].defect_id = "oops";
    expect(parseBenchmarkCase(badId).ok).toBe(false);

    const noReference = caseFixture("case-001");
    noReference.known_defects = structuredClone(badId.known_defects);
    noReference.known_defects[0].defect_id = "SR-TEST-001";
    delete noReference.known_defects[0].reference;
    expect(parseBenchmarkCase(noReference).ok).toBe(false);
  });
});

describe("pipeline compatibility probe", () => {
  it("accepts the shape the benchmark was written against", () => {
    expect(
      assertPipelineCompatibility({
        criteriaKeys: Array.from({ length: 7 }, (_, index) => `criterion_${index}`),
        maxLogicalStages: 4,
        declaredVersion: EVAL_PIPELINE_VERSION,
      }),
    ).toBe(true);
  });

  it("refuses a different criterion count", () => {
    expect(() =>
      assertPipelineCompatibility({ criteriaKeys: ["only_one"], maxLogicalStages: 4 }),
    ).toThrow(/expected 7 scoring criteria/);
  });

  it("refuses a different logical stage ceiling", () => {
    expect(() =>
      assertPipelineCompatibility({
        criteriaKeys: Array.from({ length: 7 }, (_, index) => `c${index}`),
        maxLogicalStages: 5,
      }),
    ).toThrow(/expected 4 maximum logical stages/);
  });

  it("refuses a benchmark written for a different pipeline generation", () => {
    expect(() =>
      assertPipelineCompatibility({
        criteriaKeys: Array.from({ length: 7 }, (_, index) => `c${index}`),
        maxLogicalStages: 4,
        declaredVersion: "v1-ancient",
      }),
    ).toThrow(/requires pipeline/);
  });
});

describe("artifact policy scanning", () => {
  it("passes clean, repository-relative content", () => {
    expect(
      findArtifactPolicyViolations(JSON.stringify({ path: "evals/datasets/decision-benchmark-v1" })),
    ).toEqual([]);
  });

  it("detects an OpenAI-shaped key", () => {
    const violations = findArtifactPolicyViolations('{"k":"sk-abcdefghijklmnopqrstuvwxyz012345"}');
    expect(violations.join(" ")).toContain("possible secret");
  });

  it("detects a bearer token and an authorization header", () => {
    expect(findArtifactPolicyViolations('"Bearer abcdefghijklmnopqrstuvwx"').length).toBeGreaterThan(0);
    expect(findArtifactPolicyViolations('{"authorization": "x"}').length).toBeGreaterThan(0);
  });

  it("detects a unix absolute path", () => {
    const violations = findArtifactPolicyViolations('{"dir":"/Users/someone/project"}');
    expect(violations.join(" ")).toContain("absolute path");
  });

  it("detects a file:// URL", () => {
    expect(findArtifactPolicyViolations('"file:///tmp/x"').length).toBeGreaterThan(0);
  });

  it("throws rather than writing a dirty artifact", () => {
    expect(() =>
      assertArtifactIsPolicyClean({ key: "sk-abcdefghijklmnopqrstuvwxyz012345" }, "summary.json"),
    ).toThrow(/Refusing to write summary.json/);
  });
});

describe("shared helpers", () => {
  it("canonicalises pair keys independent of order", () => {
    expect(canonicalPairKey("b", "a")).toBe(canonicalPairKey("a", "b"));
  });

  it("never marks a numeric delta as significant", () => {
    expect(numericDelta(1, 5)).toEqual({
      baseline: 1,
      candidate: 5,
      delta: 4,
      significance: "not_assessed",
    });
  });

  it("reports a null delta when either side is unavailable", () => {
    expect(numericDelta(null, 5).delta).toBeNull();
    expect(numericDelta(1, undefined).delta).toBeNull();
  });
});
