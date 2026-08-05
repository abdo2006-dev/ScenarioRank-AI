/**
 * Committed-benchmark validation tests.
 *
 * These assert properties of the *actual dataset in the repository*, not of
 * the schema. They are what stops a benchmark edit from quietly changing what
 * the benchmark measures, or from introducing anything that is not synthetic.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { loadBenchmark, toRepoRelative, BenchmarkValidationError } from "./loadBenchmark.js";
import { VALID_BASELINE_PROFILES } from "../fixtures/fakeProviderProfiles.js";
import {
  readReleaseRegistry,
  assertReleasedBenchmarkIntegrity,
  benchmarkContentDigest,
  canonicalJson,
} from "./releasedBenchmarkIntegrity.js";
import { evaluationRequestSchema } from "../../shared/contracts/decisionApi.js";

const DATASET = path.resolve("evals/datasets/decision-benchmark-v1");

const benchmark = await loadBenchmark();

describe("committed benchmark", () => {
  it("loads, validates, and matches its manifest", () => {
    expect(benchmark.manifest.benchmark_id).toBe("decision-benchmark-v1");
    expect(benchmark.cases).toHaveLength(benchmark.manifest.case_count);
    expect(benchmark.cases.map((entry) => entry.case_id)).toEqual(benchmark.manifest.case_ids);
  });

  it("matches the reviewed content lock for this released benchmark", async () => {
    const registry = await readReleaseRegistry();
    const record = registry.records.find((entry) =>
      entry.benchmark_id === benchmark.manifest.benchmark_id &&
      entry.benchmark_version === benchmark.manifest.benchmark_version &&
      entry.metadata_revision === benchmark.manifest.metadata_revision,
    );
    expect(record?.digest).toBeTruthy();
    await expect(benchmarkContentDigest(DATASET, benchmark.manifest)).resolves.toBe(
      record.digest,
    );
  });

  it("refuses an unregistered version instead of letting a version bump bypass the lock", async () => {
    await expect(
      assertReleasedBenchmarkIntegrity(DATASET, {
        ...benchmark.manifest,
        benchmark_version: "999.0.0",
      }),
    ).rejects.toThrow(/invalid release-integrity/i);
  });

  it("canonicalizes object keys while preserving meaningful array order", () => {
    expect(canonicalJson({ b: ["second", "first"], a: 1 })).toBe(
      canonicalJson({ a: 1, b: ["second", "first"] }),
    );
    expect(canonicalJson({ a: ["first", "second"] })).not.toBe(
      canonicalJson({ a: ["second", "first"] }),
    );
  });

  it("contains between 12 and 16 cases", () => {
    expect(benchmark.cases.length).toBeGreaterThanOrEqual(12);
    expect(benchmark.cases.length).toBeLessThanOrEqual(16);
  });

  it("orders cases by the manifest, not by the filesystem", () => {
    const onDisk = readdirSync(path.join(DATASET, "cases")).sort();
    expect(onDisk).toHaveLength(benchmark.cases.length);
    expect(benchmark.cases.map((entry) => entry.case_id)).toEqual(benchmark.manifest.case_ids);
  });

  it("declares every case synthetic-only", () => {
    for (const entry of benchmark.cases) {
      expect(entry.synthetic, entry.case_id).toBe(true);
      expect(entry.data_policy, entry.case_id).toBe("synthetic-only");
    }
  });

  it("uses only valid baseline fake-provider profiles", () => {
    for (const entry of benchmark.cases) {
      expect(VALID_BASELINE_PROFILES, entry.case_id).toContain(entry.fake_provider_plan.profile);
    }
  });

  it("validates every scenario against the production request contract", () => {
    for (const entry of benchmark.cases) {
      for (const scenario of entry.input.scenarios) {
        const result = evaluationRequestSchema.safeParse({
          role: entry.input.role,
          scenario,
          decision_mode: entry.input.decision_mode,
          candidates: entry.input.candidates,
          options: entry.input.options,
        });
        expect(result.success, `${entry.case_id}: ${scenario}`).toBe(true);
      }
    }
  });

  it("covers every category the benchmark claims to cover", () => {
    const tags = new Set(benchmark.cases.flatMap((entry) => entry.tags));
    for (const required of [
      "basic-ranking",
      "multi-scenario",
      "close-call",
      "missing-evidence",
      "conflicting-evidence",
      "permutation",
      "duplicate-name",
      "pairing",
      "uncertainty",
    ]) {
      expect(tags, required).toContain(required);
    }
  });

  it("covers both pairing-disabled and pairing-enabled cases", () => {
    const enabled = benchmark.cases.filter((e) => e.deterministic_expectations.pairing_enabled);
    const disabled = benchmark.cases.filter((e) => !e.deterministic_expectations.pairing_enabled);
    expect(enabled.length).toBeGreaterThan(0);
    expect(disabled.length).toBeGreaterThan(0);
  });

  it("covers all four variant kinds with valid linkage", () => {
    const variants = benchmark.cases.filter((entry) => entry.variant_of !== null);
    const kinds = new Set(variants.map((entry) => entry.variant_kind));
    expect(kinds).toEqual(
      new Set(["candidate-order", "scenario-order", "equivalent-wording", "irrelevant-text"]),
    );

    const byId = new Map(benchmark.cases.map((entry) => [entry.case_id, entry]));
    for (const variant of variants) {
      const original = byId.get(variant.variant_of);
      expect(original, variant.case_id).toBeDefined();
      // Candidate IDs are the link between a variant and its original. Losing
      // them would make the comparison meaningless.
      expect(
        [...variant.input.candidates.map((c) => c.id)].sort(),
        variant.case_id,
      ).toEqual([...original.input.candidates.map((c) => c.id)].sort());
    }
  });

  it("includes a case with duplicate display names and distinct IDs", () => {
    const duplicate = benchmark.cases.find((entry) => entry.tags.includes("duplicate-name"));
    expect(duplicate).toBeDefined();
    const names = duplicate.input.candidates.map((c) => c.name);
    const ids = duplicate.input.candidates.map((c) => c.id);
    expect(new Set(names).size).toBeLessThan(names.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes single-scenario and multi-scenario cases, within contract limits", () => {
    const counts = benchmark.cases.map((entry) => entry.input.scenarios.length);
    expect(Math.min(...counts)).toBe(1);
    expect(Math.max(...counts)).toBeGreaterThan(1);
    expect(Math.max(...counts)).toBeLessThanOrEqual(5);
  });

  it("uses allowed_winner_ids with more than one option for close-call cases", () => {
    const closeCalls = benchmark.cases.filter((entry) => entry.tags.includes("close-call"));
    expect(closeCalls.length).toBeGreaterThan(0);
    for (const entry of closeCalls) {
      const allowed = entry.deterministic_expectations.allowed_winner_ids;
      // Either several winners are defensible, or the case declines to make a
      // winner claim at all. A single hard-coded winner would be dishonest for
      // a case that exists because the decision is genuinely close.
      expect(allowed === null || allowed.length > 1, entry.case_id).toBe(true);
    }
  });

  it("expects human review wherever it claims thin or conflicting evidence", () => {
    const uncertain = benchmark.cases.filter((entry) => entry.tags.includes("uncertainty"));
    expect(uncertain.length).toBeGreaterThan(0);
    for (const entry of uncertain) {
      expect(
        entry.deterministic_expectations.expect_human_review_for_candidate_ids.length,
        entry.case_id,
      ).toBeGreaterThan(0);
    }
  });

  it("references only rubric dimensions that exist", () => {
    const ids = new Set(benchmark.rubric.dimensions.map((dimension) => dimension.id));
    for (const entry of benchmark.cases) {
      for (const dimensionId of entry.rubric_dimensions) {
        expect(ids, `${entry.case_id}:${dimensionId}`).toContain(dimensionId);
      }
    }
  });

  it("asks for the pairing rubric dimension only where pairing is enabled", () => {
    for (const entry of benchmark.cases) {
      const asksPairing = entry.rubric_dimensions.includes("pairing_usefulness");
      expect(asksPairing, entry.case_id).toBe(entry.deterministic_expectations.pairing_enabled);
    }
  });

  it("documents every known defect with a real reference", () => {
    for (const entry of benchmark.cases) {
      for (const defect of entry.known_defects) {
        expect(defect.reference.length, `${entry.case_id}:${defect.id}`).toBeGreaterThan(0);
        expect(defect.summary.length).toBeGreaterThan(20);
      }
    }
  });
});

describe("committed benchmark content contains no real-world data", () => {
  const raw = readdirSync(path.join(DATASET, "cases"))
    .map((name) => readFileSync(path.join(DATASET, "cases", name), "utf8"))
    .join("\n");

  it("contains no email address, phone number, or URL", () => {
    expect(raw).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(raw).not.toMatch(/\+?\d[\d\s().-]{8,}\d/);
    expect(raw).not.toMatch(/https?:\/\//);
  });

  it("contains no absolute filesystem path", () => {
    expect(raw).not.toMatch(/\/(?:Users|home|root)\//);
    expect(raw).not.toMatch(/[A-Za-z]:\\\\/);
  });

  it("contains no secret-shaped string", () => {
    expect(raw).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}/);
  });

  it("labels its people and organisations as invented", () => {
    // Every case description states its content is fictional; this asserts the
    // convention holds rather than trusting it.
    for (const name of readdirSync(path.join(DATASET, "cases"))) {
      const text = readFileSync(path.join(DATASET, "cases", name), "utf8");
      expect(text, name).toMatch(/fictional|invented|synthetic/i);
    }
  });
});

describe("benchmark loading failures", () => {
  it("throws BenchmarkValidationError for a benchmark that does not exist", async () => {
    await expect(loadBenchmark({ benchmarkId: "decision-benchmark-v999" })).rejects.toThrow();
  });

  it("reports issues as a readable list", () => {
    const error = new BenchmarkValidationError("broken", ["one", "two"]);
    expect(error.message).toContain("- one");
    expect(error.issues).toEqual(["one", "two"]);
  });
});

describe("path handling", () => {
  it("converts absolute paths to repository-relative ones", () => {
    const relative = toRepoRelative(path.join(process.cwd(), "evals", "datasets"));
    expect(relative).toBe("evals/datasets");
    expect(relative.startsWith("/")).toBe(false);
  });
});
