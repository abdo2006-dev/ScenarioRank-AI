/**
 * @file Benchmark case schema (Phase 3A evaluation harness).
 *
 * A benchmark case is a *fully synthetic* decision problem plus the
 * expectations the harness is allowed to check automatically. It deliberately
 * separates two very different things (docs/evaluation/BENCHMARK_V1.md):
 *
 *   - `deterministic_expectations` — invariants that are objectively true or
 *     false about a pipeline response (candidate coverage, pair coverage,
 *     stage accounting, whether the reported winner matches the deterministic
 *     ranking). These are machine-checkable and a failure is a real defect.
 *   - `rubric_dimensions` — qualitative judgments about explanation quality.
 *     These are NOT objective labels. Phase 3A scores them only through the
 *     human-review format (evals/graders/humanReview.js); no LLM-as-judge
 *     grading exists in this phase.
 *
 * A case never hardcodes one "perfect" natural-language answer. Where more
 * than one winner is legitimately defensible, `allowed_winner_ids` lists every
 * acceptable outcome rather than pretending a single one is correct.
 *
 * This module wraps — and never duplicates — the production public contracts
 * in shared/contracts/. The decision input a case describes is validated with
 * the real `evaluationRequestSchema` before it is ever executed.
 */
import { z } from "zod";
import {
  roleTitleSchema,
  roleDescriptionSchema,
  scenarioInputSchema,
  candidateNameSchema,
  candidateDescriptionSchema,
} from "../../shared/contracts/decisionApi.js";
import { DECISION_INPUT_LIMITS } from "../../shared/contracts/decisionInputLimits.js";
import { CRITERIA_KEYS } from "../../server/ai/schemas/criteriaKeys.js";

/** Bumped only when the *shape* of a case file changes incompatibly. */
export const BENCHMARK_CASE_SCHEMA_VERSION = "1.0.0";

/**
 * The closed tag vocabulary. An unknown tag is rejected rather than silently
 * accepted, so "cases tagged X" can never quietly mean "cases someone spelled
 * X-ish".
 */
export const BENCHMARK_TAGS = Object.freeze([
  "basic-ranking",
  "multi-scenario",
  "close-call",
  "missing-evidence",
  "conflicting-evidence",
  "permutation",
  "duplicate-name",
  "pairing",
  "uncertainty",
]);

/** How a variant case was derived from its original. */
export const VARIANT_KINDS = Object.freeze([
  "candidate-order",
  "scenario-order",
  "equivalent-wording",
  "irrelevant-text",
]);

/**
 * Evidence-quality profiles the offline fake provider uses to shape the
 * evidence strings it returns. These drive the *deterministic* confidence and
 * evidence review in server/pipeline/runPipeline.js — they are a controlled
 * stand-in for evidence quality, not a claim that a real model would react the
 * same way.
 */
export const EVIDENCE_QUALITY_PROFILES = Object.freeze([
  "specific",
  "vague",
  "conflicting",
  "missing",
]);

export const benchmarkCaseIdSchema = z
  .string()
  .regex(/^case-\d{3}$/, "Case IDs must look like case-001.");

const candidateIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,62}$/,
    "Candidate IDs must be lowercase alphanumeric with hyphens (2-63 chars).",
  );

const criteriaOverrideSchema = z
  .object(
    Object.fromEntries(
      CRITERIA_KEYS.map((key) => [key, z.number().min(1).max(10).optional()]),
    ),
  )
  .strict();

/**
 * Per-candidate instructions for the offline fake provider. Scores are keyed
 * by candidate ID — never by array position — so a candidate-order permutation
 * of a case produces byte-identical scoring input, which is exactly what makes
 * the permutation check meaningful.
 */
const fakeCandidateScorePlanSchema = z
  .object({
    default: z.number().min(1).max(10),
    criteria: criteriaOverrideSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    evidence_quality: z.enum(EVIDENCE_QUALITY_PROFILES).optional(),
  })
  .strict();

const criteriaDeltaSchema = z
  .object(
    Object.fromEntries(
      CRITERIA_KEYS.map((key) => [key, z.number().min(-20).max(20).optional()]),
    ),
  )
  .strict();

const fakePairMetricsSchema = z
  .object({
    scenario_coverage: z.number().min(0).max(1),
    complementarity: z.number().min(0).max(1),
    overlap_risk: z.number().min(0).max(1),
    conflict_risk: z.number().min(0).max(1),
    execution_cohesion: z.number().min(0).max(1),
    pair_adaptability: z.number().min(0).max(1),
  })
  .strict();

export const fakeProviderPlanSchema = z
  .object({
    profile: z.string().min(1),
    candidate_scores: z.record(candidateIdSchema, fakeCandidateScorePlanSchema),
    /** Keyed by zero-based scenario index, as a string (JSON object keys). */
    scenario_overrides: z
      .record(
        z.string().regex(/^\d+$/, "Scenario override keys are scenario indexes."),
        z.record(candidateIdSchema, fakeCandidateScorePlanSchema.partial()),
      )
      .optional(),
    /**
     * Per-scenario criterion weight deltas, keyed by zero-based scenario
     * index. This is how a multi-scenario case makes one scenario genuinely
     * favour different skills from another: the same candidate scores are
     * re-weighted, exactly as the production scenario-analysis stage does via
     * `applyDeltas` (server/domain/scoring.js).
     */
    scenario_weight_deltas: z
      .record(
        z.string().regex(/^\d+$/, "Scenario weight-delta keys are scenario indexes."),
        criteriaDeltaSchema,
      )
      .optional(),
    /** Keyed by canonical pair key: the two candidate IDs sorted, joined by "::". */
    pair_overrides: z.record(z.string().min(3), fakePairMetricsSchema).optional(),
  })
  .strict();

const deterministicExpectationsSchema = z
  .object({
    /** Every candidate ID the response must account for, exactly once. */
    expected_candidate_ids: z.array(candidateIdSchema).min(2),
    pairing_enabled: z.boolean(),
    /**
     * Unordered pairs the pairing stage must evaluate. `null` when pairing is
     * disabled. For N top-ranked candidates (N capped at 4) this is N*(N-1)/2.
     */
    expected_pair_count: z.number().int().min(0).nullable(),
    /** Best pair the deterministic pair score must select, as sorted IDs. */
    expected_best_pair_ids: z.tuple([candidateIdSchema, candidateIdSchema]).nullable(),
    /** Logical model-backed stage count: 3 without pairing, 4 with it. */
    required_stage_count: z.number().int().min(1).max(4),
    /** Every scenario string that must appear in this case's executions. */
    required_scenario_coverage: z.array(scenarioInputSchema).min(1),
    /**
     * Winners that are legitimately defensible for this case. `null` means the
     * case makes no winner claim at all (used where the point is coverage or
     * structure, not who wins). A single-element array is a strong claim and
     * should only be used where one candidate really does dominate.
     */
    allowed_winner_ids: z.array(candidateIdSchema).min(1).nullable(),
    forbidden_winner_ids: z.array(candidateIdSchema),
    /** Response paths that must honestly report "not_measured". */
    required_not_measured_fields: z.array(z.string().min(1)),
    /** Ceiling on real provider attempts for one execution of this case. */
    maximum_provider_attempts: z.number().int().min(1).max(24),
    /**
     * Candidates whose weak/missing evidence must produce a human-review
     * recommendation. Empty when the case makes no uncertainty claim.
     */
    expect_human_review_for_candidate_ids: z.array(candidateIdSchema),
  })
  .strict();

const caseInputSchema = z
  .object({
    role: z
      .object({ title: roleTitleSchema, description: roleDescriptionSchema })
      .strict(),
    /**
     * One or more scenarios. Each scenario is executed as its own pipeline
     * run against the unchanged production contract (which takes exactly one
     * scenario per request) — the harness never invents a multi-scenario
     * request shape the server does not support.
     */
    scenarios: z
      .array(scenarioInputSchema)
      .min(DECISION_INPUT_LIMITS.scenarios.min)
      .max(DECISION_INPUT_LIMITS.scenarios.max),
    decision_mode: z.enum(["best_fit", "lowest_risk", "best_outcome"]),
    candidates: z
      .array(
        z
          .object({
            id: candidateIdSchema,
            /**
             * Display names are deliberately allowed to collide. Duplicate
             * display names with distinct IDs are a real, tested case
             * (case-014) — the pipeline must stay unambiguous through IDs.
             */
            name: candidateNameSchema,
            description: candidateDescriptionSchema,
          })
          .strict(),
      )
      .min(DECISION_INPUT_LIMITS.candidates.min)
      .max(DECISION_INPUT_LIMITS.candidates.max),
    options: z.object({ enable_pair_simulation: z.boolean() }).strict(),
  })
  .strict();

const defectObservationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("schema_issue"),
      path_pattern: z.literal("candidate_evaluations.*.risk_adjusted_score"),
      code: z.literal("too_small"),
      minimum: z.literal(0),
      subject_candidate_id: candidateIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("score_bound_violation"),
      metric: z.literal("risk_adjusted_score"),
      operator: z.literal("lt"),
      bound: z.literal(0),
      subject_candidate_id: candidateIdSchema,
    })
    .strict(),
]);

const knownDefectSchema = z
  .object({
    defect_id: z.string().regex(/^SR-[A-Z0-9-]+$/, "Defect IDs look like SR-P3A-001."),
    title: z.string().min(20).max(240),
    /** Repeated deliberately so a record remains meaningful when extracted. */
    case_id: benchmarkCaseIdSchema,
    execution_scope: z
      .object({
        execution_id: z.string().min(1),
        scenario_id: z.string().regex(/^scenario-[1-9]\d*$/),
        scenario_index: z.number().int().min(0),
        variant_id: z.enum(VARIANT_KINDS).nullable(),
        repetition: z.number().int().min(1),
      })
      .strict(),
    expected_observations: z
      .array(
        z
          .object({
            grader_id: z.string().min(1),
            signature: defectObservationSchema,
          })
          .strict(),
      )
      .min(1),
    summary: z.string().min(20).max(500),
    reference: z.string().min(1),
  })
  .strict();

export const benchmarkCaseSchema = z
  .object({
    case_id: benchmarkCaseIdSchema,
    schema_version: z.string().min(1),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(1000),
    tags: z.array(z.enum(BENCHMARK_TAGS)).min(1),
    /**
     * Synthetic-data policy metadata. Both fields are literals, not booleans a
     * future case could quietly flip: every committed case is invented, and no
     * real person, applicant, employee, company, or record appears anywhere in
     * this benchmark (docs/evaluation/BENCHMARK_V1.md).
     */
    synthetic: z.literal(true),
    data_policy: z.literal("synthetic-only"),
    input: caseInputSchema,
    deterministic_expectations: deterministicExpectationsSchema,
    /** Rubric dimension IDs a human reviewer should score for this case. */
    rubric_dimensions: z.array(z.string().min(1)).min(1),
    /** Set on a permutation/wording variant; null on an original case. */
    variant_of: benchmarkCaseIdSchema.nullable(),
    variant_kind: z.enum(VARIANT_KINDS).nullable(),
    fake_provider_plan: fakeProviderPlanSchema,
    /**
     * Graders this case is currently *expected* to fail because of a
     * documented, pre-existing defect in the product — not because the case is
     * wrong.
     *
     * This exists so a real finding can stay visible without leaving the
     * baseline permanently red, which would train everyone to ignore it. Two
     * rules keep it honest:
     *   - a known defect must name a documented reference, so it cannot be
     *     used as a quiet suppression;
     *   - when a listed grader starts *passing*, the harness reports a
     *     required failure. A fix can never land unnoticed, and the record can
     *     never silently rot.
     */
    known_defects: z.array(knownDefectSchema).default([]),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((benchmarkCase, context) => {
    const declaredIds = benchmarkCase.input.candidates.map((c) => c.id);
    const uniqueIds = new Set(declaredIds);
    if (uniqueIds.size !== declaredIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["input", "candidates"],
        message: "Candidate IDs must be unique within a case.",
      });
    }

    const expectations = benchmarkCase.deterministic_expectations;
    const knownDefectIds = new Set();
    const knownObservationKeys = new Set();
    benchmarkCase.known_defects.forEach((defect, defectIndex) => {
      if (defect.case_id !== benchmarkCase.case_id) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["known_defects", defectIndex, "case_id"], message: "Known-defect case_id must equal its enclosing case." });
      }
      if (defect.execution_scope.scenario_index >= benchmarkCase.input.scenarios.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["known_defects", defectIndex, "execution_scope", "scenario_index"], message: "Known-defect scenario index is outside this case's scenario list." });
      }
      const expectedScenarioId = `scenario-${defect.execution_scope.scenario_index + 1}`;
      const expectedExecutionId = `${benchmarkCase.case_id}#s${defect.execution_scope.scenario_index}#r${defect.execution_scope.repetition}`;
      if (defect.execution_scope.scenario_id !== expectedScenarioId || defect.execution_scope.execution_id !== expectedExecutionId) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["known_defects", defectIndex, "execution_scope"], message: `Known-defect execution scope must identify ${expectedExecutionId} / ${expectedScenarioId}.` });
      }
      if (defect.execution_scope.variant_id !== benchmarkCase.variant_kind) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["known_defects", defectIndex, "execution_scope", "variant_id"], message: "Known-defect variant_id must match this case's variant kind (or null)." });
      }
      if (knownDefectIds.has(defect.defect_id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["known_defects", defectIndex, "defect_id"], message: "Duplicate known-defect ID in one case." });
      }
      knownDefectIds.add(defect.defect_id);
      defect.expected_observations.forEach((observation, observationIndex) => {
        if (!declaredIds.includes(observation.signature.subject_candidate_id)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["known_defects", defectIndex, "expected_observations", observationIndex, "signature", "subject_candidate_id"], message: "Known-defect observation references a candidate that is not in this case." });
        }
        const key = `${defect.execution_scope.execution_id}\u0000${observation.grader_id}\u0000${JSON.stringify(observation.signature)}`;
        if (knownObservationKeys.has(key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["known_defects", defectIndex, "expected_observations", observationIndex], message: "Duplicate or ambiguous known-defect observation signature." });
        knownObservationKeys.add(key);
      });
    });
    const expectedIds = [...expectations.expected_candidate_ids].sort();
    if (JSON.stringify(expectedIds) !== JSON.stringify([...declaredIds].sort())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_expectations", "expected_candidate_ids"],
        message: "expected_candidate_ids must match the case's candidate IDs exactly.",
      });
    }

    if (expectations.pairing_enabled !== benchmarkCase.input.options.enable_pair_simulation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_expectations", "pairing_enabled"],
        message: "pairing_enabled must match input.options.enable_pair_simulation.",
      });
    }

    // The pipeline pairs the top four ranked candidates, so the expected pair
    // count is fully determined by the candidate count — it is never a free
    // parameter a case can get wrong silently.
    const pairedCount = Math.min(4, declaredIds.length);
    const expectedPairs = expectations.pairing_enabled
      ? (pairedCount * (pairedCount - 1)) / 2
      : null;
    if (expectations.expected_pair_count !== expectedPairs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_expectations", "expected_pair_count"],
        message: `expected_pair_count must be ${expectedPairs} for this case.`,
      });
    }

    const expectedStages = expectations.pairing_enabled ? 4 : 3;
    if (expectations.required_stage_count !== expectedStages) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_expectations", "required_stage_count"],
        message: `required_stage_count must be ${expectedStages} for this case.`,
      });
    }

    if (
      JSON.stringify(expectations.required_scenario_coverage) !==
      JSON.stringify(benchmarkCase.input.scenarios)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_expectations", "required_scenario_coverage"],
        message: "required_scenario_coverage must list this case's scenarios in order.",
      });
    }

    if (!expectations.pairing_enabled && expectations.expected_best_pair_ids !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_expectations", "expected_best_pair_ids"],
        message: "expected_best_pair_ids requires pairing to be enabled.",
      });
    }

    for (const id of expectations.allowed_winner_ids ?? []) {
      if (!uniqueIds.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deterministic_expectations", "allowed_winner_ids"],
          message: `allowed_winner_ids references unknown candidate "${id}".`,
        });
      }
    }
    for (const id of expectations.forbidden_winner_ids) {
      if (!uniqueIds.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deterministic_expectations", "forbidden_winner_ids"],
          message: `forbidden_winner_ids references unknown candidate "${id}".`,
        });
      }
      if (expectations.allowed_winner_ids?.includes(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deterministic_expectations", "forbidden_winner_ids"],
          message: `"${id}" cannot be both allowed and forbidden.`,
        });
      }
    }

    for (const id of declaredIds) {
      if (!(id in benchmarkCase.fake_provider_plan.candidate_scores)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fake_provider_plan", "candidate_scores"],
          message: `fake_provider_plan is missing a score plan for "${id}".`,
        });
      }
    }
    for (const id of Object.keys(benchmarkCase.fake_provider_plan.candidate_scores)) {
      if (!uniqueIds.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fake_provider_plan", "candidate_scores"],
          message: `fake_provider_plan scores unknown candidate "${id}".`,
        });
      }
    }

    for (const [field, overrides] of [
      ["scenario_overrides", benchmarkCase.fake_provider_plan.scenario_overrides],
      ["scenario_weight_deltas", benchmarkCase.fake_provider_plan.scenario_weight_deltas],
    ]) {
      for (const index of Object.keys(overrides ?? {})) {
        if (Number(index) >= benchmarkCase.input.scenarios.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fake_provider_plan", field],
            message: `Scenario index ${index} is out of range.`,
          });
        }
      }
    }

    const hasVariantOf = benchmarkCase.variant_of !== null;
    const hasVariantKind = benchmarkCase.variant_kind !== null;
    if (hasVariantOf !== hasVariantKind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variant_kind"],
        message: "variant_of and variant_kind must both be set, or both be null.",
      });
    }
    if (hasVariantOf && !benchmarkCase.tags.includes("permutation")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tags"],
        message: "A variant case must carry the \"permutation\" tag.",
      });
    }
    if (hasVariantOf && benchmarkCase.variant_of === benchmarkCase.case_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variant_of"],
        message: "A case cannot be a variant of itself.",
      });
    }

    for (const id of expectations.expect_human_review_for_candidate_ids) {
      if (!uniqueIds.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deterministic_expectations", "expect_human_review_for_candidate_ids"],
          message: `expect_human_review_for_candidate_ids references unknown candidate "${id}".`,
        });
      }
    }
  });

/**
 * Canonical unordered pair key. Pair identity is always ID-based and
 * order-independent, mirroring `mapPairResultsByIdentity` in
 * server/pipeline/runPipeline.js so the harness cannot disagree with
 * production about what "the same pair" means.
 * @param {string} a
 * @param {string} b
 */
export function canonicalPairKey(a, b) {
  return [a, b].sort().join("::");
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, data: object } | { ok: false, issues: string[] }}
 */
export function parseBenchmarkCase(value) {
  const result = benchmarkCaseSchema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}
