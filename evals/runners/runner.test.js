/**
 * Runner tests: fixture mode, offline guarantees, artifacts, and stability.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadBenchmark } from "../datasets/loadBenchmark.js";
import { createEvalFakeProvider, FAKE_PROVIDER_PROFILES } from "../fixtures/fakeProviderProfiles.js";
import { runCase, resolveMaxCandidatesForCase, buildEvaluationRequest } from "./runCase.js";
import { runBenchmark, computeStability, analysePermutations, readGitContext } from "./runBenchmark.js";
import { writeRunArtifacts, readRunArtifacts } from "../reporters/jsonReporter.js";
import { renderRunMarkdown, renderConsoleSummary } from "../reporters/markdownReporter.js";
import { buildHumanReviewTemplate } from "../graders/rubricTemplate.js";

let benchmark;
let caseById;

beforeAll(async () => {
  benchmark = await loadBenchmark();
  caseById = new Map(benchmark.cases.map((entry) => [entry.case_id, entry]));
});

const fixtureProvider =
  (benchmarkCase, profile) =>
  ({ scenarioIndex }) =>
    createEvalFakeProvider({ benchmarkCase, scenarioIndex, profile });

async function runOne(caseId, options = {}) {
  const benchmarkCase = caseById.get(caseId);
  return runCase({
    benchmarkCase,
    model: "fixture:test",
    createProvider: fixtureProvider(benchmarkCase, options.profile),
    repetitions: options.repetitions ?? 1,
  });
}

async function runAll(options = {}) {
  return runBenchmark({
    benchmark,
    caseIds: options.caseIds ?? benchmark.cases.map((entry) => entry.case_id),
    mode: "fixtures",
    provider: "fake-eval",
    model: "fixture:per-case",
    repetitions: options.repetitions ?? 1,
    createProvider: ({ benchmarkCase, scenarioIndex }) =>
      createEvalFakeProvider({ benchmarkCase, scenarioIndex, profile: options.profile }),
  });
}

describe("fixture mode makes no network request", () => {
  const originals = {};

  afterEach(() => {
    for (const [key, value] of Object.entries(originals)) globalThis[key] = value;
  });

  it("completes the whole benchmark with every network primitive disabled", async () => {
    for (const key of ["fetch", "XMLHttpRequest"]) {
      originals[key] = globalThis[key];
      globalThis[key] = () => {
        throw new Error(`Network access attempted via ${key} during a fixture run.`);
      };
    }
    const run = await runAll();
    expect(run.summary.execution_count).toBeGreaterThan(0);
    expect(run.passed).toBe(true);
  });

  it("does not read an API key", async () => {
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await runOne("case-007");
      expect(result.passed).toBe(true);
    } finally {
      if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
    }
  });
});

describe("fixture baseline", () => {
  it("passes every committed case", async () => {
    const run = await runAll();
    expect(run.summary.required_failures).toBe(0);
    expect(run.summary.failed_cases).toBe(0);
    expect(run.passed).toBe(true);
  });

  it("produces one execution per scenario per repetition", async () => {
    const run = await runAll({ caseIds: ["case-004"], repetitions: 3 });
    expect(run.caseResults[0].executions).toHaveLength(2 * 3);
  });

  it("is deterministic in its decision content across repeated runs", async () => {
    const first = await runAll({ caseIds: ["case-004", "case-015"] });
    const second = await runAll({ caseIds: ["case-004", "case-015"] });
    const outcomes = (run) =>
      run.caseResults.flatMap((caseResult) =>
        caseResult.executions.map((execution) => execution.outcome),
      );
    // duration_ms is wall-clock and deliberately excluded.
    const strip = (list) =>
      list.map((outcome) =>
        Object.fromEntries(Object.entries(outcome).filter(([key]) => key !== "duration_ms")),
      );
    expect(strip(outcomes(second))).toEqual(strip(outcomes(first)));
  });

  it("produces scenario-sensitive winners for a multi-scenario case", async () => {
    const run = await runAll({ caseIds: ["case-004"] });
    const winners = run.caseResults[0].executions.map((execution) => execution.outcome.winner_id);
    expect(new Set(winners).size).toBeGreaterThan(1);
  });

  it("selects the expected best pair even when it is not the two strongest individuals", async () => {
    const run = await runAll({ caseIds: ["case-016"] });
    const execution = run.caseResults[0].executions[0];
    expect(execution.outcome.best_pair_key).toBe("finnegan-adler::hollis-nakamura");
    const ranking = execution.outcome.ranking;
    expect([ranking[0], ranking[1]].sort().join("::")).not.toBe(execution.outcome.best_pair_key);
  });
});

describe("fake provider profiles", () => {
  it("recovers from a single malformed batch without adding a logical stage", async () => {
    const clean = await runOne("case-007");
    const retried = await runOne("case-007", { profile: "malformed-once-then-success" });

    const metadata = (result) => result.executions[0].response.run_metadata;
    expect(retried.passed).toBe(true);
    expect(metadata(retried).logicalProviderStageCount).toBe(
      metadata(clean).logicalProviderStageCount,
    );
    expect(metadata(retried).providerAttemptCount).toBeGreaterThan(
      metadata(clean).providerAttemptCount,
    );
    expect(metadata(retried).attempts.scoring).toBe(2);
  });

  it("reports pairing honestly unavailable when a pair is always missing", async () => {
    const result = await runOne("case-015", { profile: "missing-pair" });
    expect(result.passed).toBe(false);
    expect(result.executions[0].response.pairing_result.status).toBe("unavailable");
    expect(result.executions[0].response.pairing_result.best_pair).toBeNull();
  });

  it("fails the scoring stage when an unknown candidate is returned", async () => {
    const result = await runOne("case-007", { profile: "unknown-candidate" });
    expect(result.passed).toBe(false);
    expect(result.executions[0].status).toBe("failed");
    expect(result.executions[0].failure_reason).toContain("candidate");
  });

  it("is caught by the graders when the narrative contradicts the ranking", async () => {
    const result = await runOne("case-007", { profile: "contradictory-explanation" });
    expect(result.passed).toBe(false);
    const failing = result.executions[0].grader_results.filter((entry) => entry.status === "fail");
    expect(failing.map((entry) => entry.grader_id)).toContain("unsupported-claims");
  });

  it("rejects an unknown profile name", () => {
    expect(() =>
      createEvalFakeProvider({
        benchmarkCase: caseById.get("case-007"),
        scenarioIndex: 0,
        profile: "does-not-exist",
      }),
    ).toThrow(/Unknown fake provider profile/);
  });

  it("documents every profile it offers", () => {
    for (const [id, meta] of Object.entries(FAKE_PROVIDER_PROFILES)) {
      expect(meta.description.length, id).toBeGreaterThan(20);
      expect(typeof meta.valid, id).toBe("boolean");
    }
  });

  it("scores by candidate ID, not by submission order", async () => {
    const original = await runOne("case-001");
    const permuted = await runOne("case-011");
    const scores = (result) =>
      Object.fromEntries(
        result.executions[0].response.candidate_evaluations.map((candidate) => [
          candidate.candidate_id,
          candidate.weighted_fit_score,
        ]),
      );
    expect(scores(permuted)).toEqual(scores(original));
  });
});

describe("request construction", () => {
  it("builds one production request per scenario", () => {
    const benchmarkCase = caseById.get("case-004");
    const request = buildEvaluationRequest(benchmarkCase, 1);
    expect(request.scenario).toBe(benchmarkCase.input.scenarios[1]);
    expect(request.candidates).toHaveLength(benchmarkCase.input.candidates.length);
  });

  it("raises the candidate cap to what a case needs, within the shared ceiling", () => {
    expect(resolveMaxCandidatesForCase(caseById.get("case-015"))).toBeGreaterThanOrEqual(4);
    expect(resolveMaxCandidatesForCase(caseById.get("case-015"))).toBeLessThanOrEqual(10);
  });
});

describe("stability accounting", () => {
  it("refuses to assess stability from a single repetition", () => {
    const stability = computeStability([], 1);
    expect(stability.assessed).toBe(false);
    expect(stability.winner_agreement).toBeNull();
    expect(stability.reason).toContain("not enough");
  });

  it("reports agreement when repetitions agree", async () => {
    const run = await runAll({ caseIds: ["case-007"], repetitions: 2 });
    expect(run.summary.stability.assessed).toBe(true);
    expect(run.summary.stability.winner_agreement).toBe(1);
    expect(run.summary.stability.ranking_agreement).toBe(1);
  });

  it("reports disagreement when repetitions disagree", () => {
    const caseResults = [
      {
        executions: [
          { status: "completed", case_id: "case-001", scenario_index: 0, outcome: { winner_id: "a", ranking: ["a", "b"] } },
          { status: "completed", case_id: "case-001", scenario_index: 0, outcome: { winner_id: "b", ranking: ["b", "a"] } },
        ],
      },
    ];
    const stability = computeStability(caseResults, 2);
    expect(stability.assessed).toBe(true);
    expect(stability.winner_agreement).toBe(0);
  });
});

describe("permutation analysis", () => {
  it("finds no change across every committed variant under the fixture provider", async () => {
    const run = await runAll();
    expect(run.permutations).toHaveLength(4);
    for (const finding of run.permutations) {
      expect(finding.compared, finding.case_id).toBe(true);
      expect(finding.winner_changed, finding.case_id).toBe(false);
      expect(finding.ranking_changed, finding.case_id).toBe(false);
      expect(finding.structured_evidence_changed, finding.case_id).toBe(false);
    }
  });

  it("reports 'not compared' when the original is outside the case selection", async () => {
    const run = await runAll({ caseIds: ["case-011"] });
    expect(run.permutations[0].compared).toBe(false);
    expect(run.permutations[0].reason).toContain("not part of this run");
  });

  it("detects a winner change between a variant and its original", () => {
    const findings = analysePermutations([
      {
        case_id: "case-001",
        variant_of: null,
        variant_kind: null,
        executions: [
          { status: "completed", scenario: "S", scenario_index: 0, outcome: { winner_id: "a", ranking: ["a"], best_pair_key: null }, response: { candidate_evaluations: [], decision_result: {}, executive_summary: {}, trade_offs: [] } },
        ],
      },
      {
        case_id: "case-011",
        variant_of: "case-001",
        variant_kind: "candidate-order",
        executions: [
          { status: "completed", scenario: "S", scenario_index: 0, outcome: { winner_id: "b", ranking: ["b"], best_pair_key: null }, response: { candidate_evaluations: [], decision_result: {}, executive_summary: {}, trade_offs: [] } },
        ],
      },
    ]);
    const variant = findings.find((entry) => entry.case_id === "case-011");
    expect(variant.winner_changed).toBe(true);
    expect(variant.ranking_changed).toBe(true);
  });
});

describe("run artifacts", () => {
  it("writes every promised file, with no secrets or absolute paths", async () => {
    const run = await runAll({ caseIds: ["case-007", "case-015"] });
    const root = await mkdtemp(path.join(tmpdir(), "eval-artifacts-"));
    const { runDir, files } = await writeRunArtifacts({
      run,
      markdown: renderRunMarkdown(run),
      humanReviewTemplate: buildHumanReviewTemplate({
        rubric: benchmark.rubric,
        manifest: run.manifest,
        caseResults: run.caseResults,
        casesById: caseById,
      }),
      rootDir: root,
    });

    expect(files).toEqual(
      expect.arrayContaining([
        "run-manifest.json",
        "case-results.jsonl",
        "summary.json",
        "summary.md",
        "human-review-template.json",
      ]),
    );
    const written = await readdir(runDir);
    expect(written.sort()).toEqual([...files].sort());

    for (const name of written) {
      const content = await readFile(path.join(runDir, name), "utf8");
      expect(content, name).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}/);
      expect(content, name).not.toMatch(/\/(?:Users|home|root)\//);
      expect(content, name).not.toMatch(/[A-Za-z]:\\\\/);
    }
  });

  it("records benchmark version, commit, grader versions, and the artifact policy", async () => {
    const run = await runAll({ caseIds: ["case-007"] });
    expect(run.manifest.benchmark_version).toBe(benchmark.manifest.benchmark_version);
    expect(run.manifest.grader_versions["contract-validity"]).toBeTruthy();
    expect(run.manifest.artifact_policy).toEqual({
      synthetic_data_only: true,
      secrets_recorded: false,
      absolute_paths_recorded: false,
    });
    const git = readGitContext();
    expect(run.manifest.git_commit).toBe(git.commit);
  });

  it("carries the scope disclaimer into the summary and markdown", async () => {
    const run = await runAll({ caseIds: ["case-007"] });
    expect(run.summary.disclaimer).toContain("not scientifically validated");
    expect(renderRunMarkdown(run)).toContain("not scientifically validated");
  });

  it("emits no ANSI escape codes", async () => {
    const run = await runAll({ caseIds: ["case-007"] });
    // eslint-disable-next-line no-control-regex
    const ansi = /\u001b\[/;
    expect(ansi.test(renderRunMarkdown(run))).toBe(false);
    expect(ansi.test(renderConsoleSummary(run))).toBe(false);
  });

  it("can record a response that violates the public contract", async () => {
    // The artifact schema must never enforce the contract the grader exists to
    // check, or the harness would crash while recording its own finding.
    const run = await runAll({ caseIds: ["case-001"] });
    const root = await mkdtemp(path.join(tmpdir(), "eval-defect-"));
    await expect(
      writeRunArtifacts({
        run,
        markdown: renderRunMarkdown(run),
        humanReviewTemplate: buildHumanReviewTemplate({
          rubric: benchmark.rubric,
          manifest: run.manifest,
          caseResults: run.caseResults,
          casesById: caseById,
        }),
        rootDir: root,
      }),
    ).resolves.toBeTruthy();
  });

  it("round-trips a written run through the reader", async () => {
    const run = await runAll({ caseIds: ["case-007"] });
    const root = await mkdtemp(path.join(tmpdir(), "eval-roundtrip-"));
    const { runDir } = await writeRunArtifacts({
      run,
      markdown: renderRunMarkdown(run),
      humanReviewTemplate: buildHumanReviewTemplate({
        rubric: benchmark.rubric,
        manifest: run.manifest,
        caseResults: run.caseResults,
        casesById: caseById,
      }),
      rootDir: root,
    });
    const read = await readRunArtifacts(runDir);
    expect(read.manifest.run_id).toBe(run.manifest.run_id);
    expect(read.caseResults).toHaveLength(run.caseResults.length);
    expect(read.humanReview).toBeNull();
  });
});

describe("known defects in the committed baseline", () => {
  it("keeps the baseline green while reporting the defect prominently", async () => {
    const run = await runAll();
    expect(run.passed).toBe(true);
    expect(run.summary.expected_failures).toBeGreaterThan(0);
    expect(renderRunMarkdown(run)).toContain("Known defects reproduced");
  });

  it("attributes every expected failure to a documented defect", async () => {
    const run = await runAll();
    const expected = run.caseResults.flatMap((caseResult) =>
      caseResult.executions
        .flatMap((execution) => execution.grader_results)
        .filter((result) => result.status === "expected_failure"),
    );
    expect(expected.length).toBeGreaterThan(0);
    for (const result of expected) {
      expect(result.summary).toMatch(/^Known defect SR-/);
      expect(result.details.join(" ")).toContain("see docs/");
    }
  });
});

describe("unknown case selection", () => {
  it("refuses a case that is not part of the benchmark", async () => {
    await expect(runAll({ caseIds: ["case-999"] })).rejects.toThrow(/is not part of benchmark/);
  });
});
