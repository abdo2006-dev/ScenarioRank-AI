/**
 * @file Benchmark manifest and rubric schemas (Phase 3A evaluation harness).
 *
 * The manifest is the immutable identity of a benchmark. Everything a report
 * needs in order to be interpreted later — which benchmark, which version,
 * which rubric, which case IDs — is recorded here and copied into every run
 * artifact.
 *
 * Versioning policy (enforced by the schema below and by
 * evals/schemas/benchmarkManifest.test.js, documented in
 * docs/evaluation/BENCHMARK_V1.md):
 *
 *   1. `benchmark_id` never changes once published.
 *   2. A case ID never changes or is reused once published.
 *   3. Changing what an existing case *means* — its inputs, its expectations,
 *      what a passing result implies — requires a NEW `benchmark_version`, and
 *      by convention a new `benchmark_id` suffix (decision-benchmark-v2).
 *   4. A change that cannot alter any result — a typo in prose, a clearer
 *      description — increments `metadata_revision` only.
 *   5. `schema_version` describes the case/manifest file *shape*. A runner
 *      refuses a manifest whose `schema_version` it does not support rather
 *      than guessing.
 */
import { z } from "zod";
import { benchmarkCaseIdSchema, BENCHMARK_TAGS } from "./benchmarkCase.js";

/** Manifest file shape version. Runners refuse anything they do not support. */
export const BENCHMARK_MANIFEST_SCHEMA_VERSION = "1.0.0";

/** Every manifest schema version this harness build can execute. */
export const SUPPORTED_BENCHMARK_SCHEMA_VERSIONS = Object.freeze(["1.0.0"]);

/**
 * A harness-side declaration of which ScenarioRank pipeline generation this
 * benchmark's expectations were written against.
 *
 * Honest scope note: production does not emit a pipeline version string, and
 * Phase 3A deliberately does not add one (no production behavior changes in
 * this phase). This constant is therefore a marker maintained *by the
 * harness*, not a value read from the running pipeline. It is backed by a real
 * structural probe (`assertPipelineCompatibility` below) so a mismatch between
 * the declared marker and the actual pipeline shape cannot go unnoticed.
 */
export const EVAL_PIPELINE_VERSION = "v2-phase-2d";

export const rubricDimensionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/, "Rubric dimension IDs are snake_case."),
    label: z.string().min(1).max(120),
    /** Exactly what a reviewer is judging — never a vague quality gesture. */
    what_is_judged: z.string().min(20).max(600),
    scale: z
      .object({ min: z.literal(0), max: z.literal(4) })
      .strict(),
    /** One anchor per point on the scale, so scores mean the same thing twice. */
    anchors: z
      .object({
        0: z.string().min(5),
        1: z.string().min(5),
        2: z.string().min(5),
        3: z.string().min(5),
        4: z.string().min(5),
      })
      .strict(),
    failure_examples: z.array(z.string().min(5)).min(1),
    human_review_required: z.boolean(),
    /**
     * Whether *any* part of this dimension can be checked deterministically.
     * Where true, the named deterministic grader covers a conservative subset
     * only — it never replaces the human judgment (docs/evaluation/HUMAN_REVIEW_GUIDE.md).
     */
    deterministic_automation_possible: z.boolean(),
    deterministic_grader_id: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((dimension, context) => {
    if (dimension.deterministic_automation_possible && !dimension.deterministic_grader_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_grader_id"],
        message: "A dimension claiming automation must name the grader that provides it.",
      });
    }
    if (!dimension.deterministic_automation_possible && dimension.deterministic_grader_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deterministic_grader_id"],
        message: "A dimension without automation must not name a grader.",
      });
    }
  });

export const rubricSchema = z
  .object({
    rubric_version: z.string().min(1),
    schema_version: z.string().min(1),
    description: z.string().min(1),
    /** Guardrail prose that must travel with the rubric, not just the docs. */
    interpretation_warning: z.string().min(20),
    allowed_non_scores: z.array(z.enum(["not_applicable", "cannot_determine"])).length(2),
    dimensions: z.array(rubricDimensionSchema).min(1),
  })
  .strict()
  .superRefine((rubric, context) => {
    const seen = new Set();
    rubric.dimensions.forEach((dimension, index) => {
      if (seen.has(dimension.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dimensions", index, "id"],
          message: `Duplicate rubric dimension id "${dimension.id}".`,
        });
      }
      seen.add(dimension.id);
    });
  });

export const benchmarkManifestSchema = z
  .object({
    benchmark_id: z
      .string()
      .regex(/^[a-z][a-z0-9-]*-v\d+$/, "Benchmark IDs end in a version suffix, e.g. -v1."),
    benchmark_version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "benchmark_version is semver-shaped."),
    schema_version: z.string().min(1),
    /**
     * Incremented for changes that cannot alter any result (typos, clearer
     * prose). A meaning change requires a new benchmark_version instead.
     */
    metadata_revision: z.number().int().min(0),
    created_at: z.string().datetime(),
    description: z.string().min(1),
    case_count: z.number().int().min(1),
    case_ids: z.array(benchmarkCaseIdSchema).min(1),
    rubric_version: z.string().min(1),
    supported_modes: z.array(z.enum(["fixtures", "live"])).min(1),
    required_pipeline_version: z.string().min(1),
    /** Closed tag vocabulary, mirrored from the case schema. */
    tag_catalog: z.array(z.enum(BENCHMARK_TAGS)).min(1),
    data_policy: z.literal("synthetic-only"),
    /** Prose the harness refuses to let a benchmark drop. */
    scope_disclaimer: z.string().min(40),
    versioning_policy: z
      .object({
        case_ids_immutable: z.literal(true),
        meaning_change_requires_new_version: z.literal(true),
        cosmetic_change_increments_metadata_revision: z.literal(true),
        reports_record_benchmark_version_and_commit: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.case_count !== manifest.case_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["case_count"],
        message: `case_count (${manifest.case_count}) does not match case_ids length (${manifest.case_ids.length}).`,
      });
    }
    const seen = new Set();
    manifest.case_ids.forEach((caseId, index) => {
      if (seen.has(caseId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["case_ids", index],
          message: `Duplicate case id "${caseId}".`,
        });
      }
      seen.add(caseId);
    });
  });

/**
 * Refuses a benchmark whose file shape this build does not understand, rather
 * than attempting a best-effort read of an unknown format.
 * @param {string} schemaVersion
 */
export function assertSupportedSchemaVersion(schemaVersion) {
  if (!SUPPORTED_BENCHMARK_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw new Error(
      `Unsupported benchmark schema_version "${schemaVersion}". ` +
        `This harness supports: ${SUPPORTED_BENCHMARK_SCHEMA_VERSIONS.join(", ")}. ` +
        "Refusing to run rather than guess at an unknown case format.",
    );
  }
}

/**
 * Structural probe backing `EVAL_PIPELINE_VERSION`. Rather than trusting a
 * hand-maintained string alone, this asserts the observable facts the
 * benchmark's expectations actually depend on:
 *
 *   - seven scoring criteria (weights, coverage, and score-integrity graders);
 *   - at most four logical model-backed stages (pipeline-accounting grader).
 *
 * A future pipeline change that breaks either assumption fails loudly here
 * instead of silently invalidating every recorded benchmark result.
 * @param {{ criteriaKeys: string[], maxLogicalStages: number, declaredVersion?: string }} probe
 */
export function assertPipelineCompatibility({
  criteriaKeys,
  maxLogicalStages,
  declaredVersion = EVAL_PIPELINE_VERSION,
}) {
  const problems = [];
  if (criteriaKeys.length !== 7) {
    problems.push(`expected 7 scoring criteria, found ${criteriaKeys.length}`);
  }
  if (maxLogicalStages !== 4) {
    problems.push(`expected 4 maximum logical stages, found ${maxLogicalStages}`);
  }
  if (declaredVersion !== EVAL_PIPELINE_VERSION) {
    problems.push(
      `benchmark requires pipeline "${declaredVersion}" but this harness targets "${EVAL_PIPELINE_VERSION}"`,
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Benchmark is incompatible with the current pipeline: ${problems.join("; ")}. ` +
        "Re-validate the benchmark's expectations before recording any further results.",
    );
  }
  return true;
}
