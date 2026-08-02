/**
 * @file Evaluation run and case-result schemas (Phase 3A evaluation harness).
 *
 * These schemas *wrap* production output — they never restate it. The decision
 * response inside a case result is validated by the real public contract
 * (`completedPipelineResponseSchema` from shared/contracts/decisionApi.js);
 * this file adds only the benchmark metadata, grader results, human-review
 * slots, and accounting the harness itself owns.
 *
 * Privacy rules encoded here (docs/evaluation/RUNBOOK.md, "Artifacts"):
 *   - no API keys, headers, or request bodies are ever recorded;
 *   - no machine-specific absolute path is ever recorded — paths are stored
 *     repository-relative;
 *   - only synthetic benchmark content is ever written.
 */
import { z } from "zod";
import { benchmarkCaseIdSchema } from "./benchmarkCase.js";

export const EVALUATION_RUN_SCHEMA_VERSION = "1.0.0";

/**
 * `expected_failure` is a grader that failed in exactly the way a case's
 * `known_defects` list says it currently does. It does not gate the exit
 * status. The inverse — a known defect that has stopped reproducing — is
 * reported as a `fail`, so a fix can never land silently.
 */
export const GRADER_STATUSES = Object.freeze([
  "pass",
  "fail",
  "skip",
  "error",
  "expected_failure",
]);

/**
 * `required` graders gate the exit status: any failure makes a run fail and
 * the CLI exit nonzero. `advisory` graders report a signal worth looking at
 * without asserting that the pipeline is wrong.
 */
export const GRADER_SEVERITIES = Object.freeze(["required", "advisory"]);

export const graderResultSchema = z
  .object({
    grader_id: z.string().min(1),
    grader_version: z.string().min(1),
    severity: z.enum(GRADER_SEVERITIES),
    status: z.enum(GRADER_STATUSES),
    summary: z.string().min(1),
    /** Stable machine-readable finding classes used for exact known-defect matching. */
    finding_codes: z.array(z.string().min(1)).default([]),
    /** Structured failure identities; messages are never used as known-defect keys. */
    observations: z.array(z.record(z.unknown())).default([]),
    /** Present only when a scoped known-defect record reclassified this failure. */
    known_defect_id: z.string().min(1).optional(),
    /** Exact expected-observation identities matched by this failure. */
    known_defect_observation_ids: z.array(z.string().min(1)).default([]),
    /** XPASS-like signal: an expected product defect disappeared and needs review. */
    unexpected_defect_resolution: z.boolean().default(false),
    /** Structured, human-readable specifics. Never raw provider payloads. */
    details: z.array(z.string().min(1)),
  })
  .strict();

/**
 * One pipeline execution. A case with N scenarios produces N executions, and a
 * run with R repetitions produces N*R executions for that case — the harness
 * never collapses them, so stability can be looked at per scenario.
 */
export const executionResultSchema = z
  .object({
    execution_id: z.string().min(1),
    case_id: benchmarkCaseIdSchema,
    scenario_index: z.number().int().min(0),
    scenario: z.string().min(1),
    repetition: z.number().int().min(1),
    status: z.enum(["completed", "failed", "skipped"]),
    /**
     * The pipeline response, stored as-is.
     *
     * Deliberately NOT validated against `completedPipelineResponseSchema`
     * here. The whole purpose of the `contract-validity` grader is to detect a
     * response that violates the public contract; if the artifact schema also
     * enforced that contract, the harness would crash while recording the very
     * defect it exists to find, and the finding would be lost. Contract
     * validation happens in exactly one place — the grader — which reports the
     * violation instead of destroying the evidence.
     */
    response: z.record(z.unknown()).optional(),
    /** Safe message only — never a stack trace or provider payload. */
    failure_reason: z.string().min(1).optional(),
    /** A safe reason for an intentionally unstarted execution, e.g. budget guard. */
    skip_reason: z.string().min(1).optional(),
    /**
     * The decision content the comparison command actually diffs. Extracted
     * here so a comparison never has to re-walk a full response, and so
     * non-deterministic fields (request_id, timestamps, durations) are
     * structurally excluded from any comparison.
     */
    outcome: z
      .object({
        winner_id: z.string().min(1),
        ranking: z.array(z.string().min(1)),
        best_pair_key: z.string().nullable(),
        pairing_status: z.enum(["ok", "unavailable", "absent"]),
        logical_provider_stage_count: z.number().int().min(0),
        provider_attempt_count: z.number().int().min(0),
        total_tokens: z.number().int().min(0),
        estimated_cost_usd: z.number().nonnegative().nullable(),
        duration_ms: z.number().int().min(0),
      })
      .strict()
      .optional(),
    grader_results: z.array(graderResultSchema),
  })
  .strict()
  .superRefine((execution, context) => {
    if (execution.status === "completed" && !execution.response) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["response"],
        message: "A completed execution must carry its validated response.",
      });
    }
    if (execution.status === "failed" && !execution.failure_reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failure_reason"],
        message: "A failed execution must record why it failed.",
      });
    }
    if (execution.status === "skipped" && !execution.skip_reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["skip_reason"],
        message: "A skipped execution must record why it was not started.",
      });
    }
  });

export const caseResultSchema = z
  .object({
    case_id: benchmarkCaseIdSchema,
    title: z.string().min(1),
    tags: z.array(z.string().min(1)),
    variant_of: benchmarkCaseIdSchema.nullable(),
    variant_kind: z.string().nullable(),
    executions: z.array(executionResultSchema).min(1),
    /** Case-level graders run across every execution (scenario coverage). */
    grader_results: z.array(graderResultSchema),
    required_failures: z.number().int().min(0),
    advisory_failures: z.number().int().min(0),
    passed: z.boolean(),
  })
  .strict();

export const runManifestSchema = z
  .object({
    run_id: z.string().min(1),
    schema_version: z.string().min(1),
    timestamp: z.string().datetime(),
    mode: z.enum(["fixtures", "live"]),
    benchmark_id: z.string().min(1),
    benchmark_version: z.string().min(1),
    benchmark_schema_version: z.string().min(1),
    rubric_version: z.string().min(1),
    /** Repository commit the run executed against; null outside a git repo. */
    git_commit: z.string().nullable(),
    git_branch: z.string().nullable(),
    provider: z.string().min(1),
    model: z.string().min(1),
    case_selection: z.array(benchmarkCaseIdSchema).min(1),
    repetitions: z.number().int().min(1),
    pairing_cases: z.number().int().min(0),
    /** Aggregate accounting across every execution in the run. */
    logical_provider_stages: z.number().int().min(0),
    provider_attempts: z.number().int().min(0),
    input_tokens: z.number().int().min(0),
    output_tokens: z.number().int().min(0),
    total_tokens: z.number().int().min(0),
    estimated_cost_usd: z.number().nonnegative().nullable(),
    duration_ms: z.number().int().min(0),
    grader_versions: z.record(z.string().min(1)),
    /** Reasserts what this artifact is and is not allowed to contain. */
    artifact_policy: z
      .object({
        synthetic_data_only: z.literal(true),
        secrets_recorded: z.literal(false),
        absolute_paths_recorded: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const runSummarySchema = z
  .object({
    run_id: z.string().min(1),
    schema_version: z.string().min(1),
    benchmark_id: z.string().min(1),
    benchmark_version: z.string().min(1),
    mode: z.enum(["fixtures", "live"]),
    git_commit: z.string().nullable(),
    repetitions: z.number().int().min(1),
    case_count: z.number().int().min(0),
    execution_count: z.number().int().min(0),
    passed_cases: z.number().int().min(0),
    failed_cases: z.number().int().min(0),
    required_failures: z.number().int().min(0),
    advisory_failures: z.number().int().min(0),
    run_state: z.enum(["clean_pass", "pass_with_known_defects", "unexpected_failure", "baseline_change_required"]),
    grader_totals: z.record(
      z
        .object({
          pass: z.number().int().min(0),
          fail: z.number().int().min(0),
          skip: z.number().int().min(0),
          error: z.number().int().min(0),
          expected_failure: z.number().int().min(0),
          severity: z.enum(GRADER_SEVERITIES),
        })
        .strict(),
    ),
    /** Failures attributed to a documented, pre-existing product defect. */
    expected_failures: z.number().int().min(0),
    clean_pass_count: z.number().int().min(0),
    affected_defect_ids: z.array(z.string().min(1)),
    affected_execution_ids: z.array(z.string().min(1)),
    unexpected_failures: z.number().int().min(0),
    unexpected_defect_resolutions: z.number().int().min(0),
    known_defect_observations: z.array(z.record(z.unknown())).default([]),
    /**
     * Winner agreement across repetitions of the same case+scenario.
     * `insufficient_samples` when repetitions < 2 — a single run can never
     * demonstrate stability, and this field says so rather than reporting a
     * meaningless 100%.
     */
    stability: z
      .object({
        assessed: z.boolean(),
        reason: z.string().min(1),
        winner_agreement: z.number().min(0).max(1).nullable(),
        ranking_agreement: z.number().min(0).max(1).nullable(),
      })
      .strict(),
    totals: z
      .object({
        logical_provider_stages: z.number().int().min(0),
        provider_attempts: z.number().int().min(0),
        total_tokens: z.number().int().min(0),
        estimated_cost_usd: z.number().nonnegative().nullable(),
        duration_ms: z.number().int().min(0),
      })
      .strict(),
    /** Non-negotiable honesty text carried into every artifact. */
    disclaimer: z.string().min(40),
  })
  .strict();

/**
 * Conservative secret scan applied to every artifact before it is written.
 * These patterns are deliberately narrow — they exist to catch an accidental
 * key, not to claim the harness can detect every possible secret shape.
 */
const SECRET_PATTERNS = Object.freeze([
  { name: "openai-style key", pattern: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { name: "bearer token header", pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/i },
  { name: "authorization header", pattern: /"authorization"\s*:/i },
  { name: "api key assignment", pattern: /\b(?:api[_-]?key|apikey|secret)\b\s*[:=]\s*["'][^"']{8,}/i },
]);

/**
 * Absolute-path shapes that would leak a machine layout into an artifact.
 * Repository-relative paths (`evals/datasets/...`) are unaffected.
 */
const ABSOLUTE_PATH_PATTERNS = Object.freeze([
  { name: "unix home path", pattern: /(?:^|["'\s])\/(?:Users|home|root|var|private|tmp)\// },
  { name: "windows drive path", pattern: /(?:^|["'\s])[A-Za-z]:\\\\?/ },
  { name: "file url", pattern: /file:\/\/\// },
]);

/**
 * @param {string} serialized JSON text about to be written to an artifact.
 * @returns {string[]} human-readable findings; empty means clean.
 */
export function findArtifactPolicyViolations(serialized) {
  const violations = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(serialized)) violations.push(`possible secret (${name})`);
  }
  for (const { name, pattern } of ABSOLUTE_PATH_PATTERNS) {
    if (pattern.test(serialized)) violations.push(`absolute path (${name})`);
  }
  return violations;
}

/**
 * Throws rather than writing an artifact that violates the recorded policy.
 * Fail-closed is the right default here: a leaked key in a run directory is
 * far worse than a failed evaluation run.
 * @param {unknown} artifact
 * @param {string} label
 */
export function assertArtifactIsPolicyClean(artifact, label) {
  const serialized = typeof artifact === "string" ? artifact : JSON.stringify(artifact);
  const violations = findArtifactPolicyViolations(serialized);
  if (violations.length > 0) {
    throw new Error(
      `Refusing to write ${label}: ${violations.join(", ")}. ` +
        "Evaluation artifacts must never contain secrets or machine-specific absolute paths.",
    );
  }
}
