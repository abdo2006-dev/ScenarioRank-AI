/**
 * @file Benchmark loading and validation (Phase 3A evaluation harness).
 *
 * Loading is deliberately strict and fail-closed. A benchmark that does not
 * fully validate is never partially executed: a half-valid benchmark produces
 * results that look authoritative and are not.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluationRequestSchema } from "../../shared/contracts/decisionApi.js";
import { CRITERIA_KEYS } from "../../server/ai/schemas/criteriaKeys.js";
import { parseBenchmarkCase } from "../schemas/benchmarkCase.js";
import { ALL_GRADERS } from "../graders/deterministicGraders.js";
import {
  benchmarkManifestSchema,
  rubricSchema,
  assertSupportedSchemaVersion,
  assertPipelineCompatibility,
} from "../schemas/benchmarkManifest.js";
import { assertReleasedBenchmarkIntegrity } from "./releasedBenchmarkIntegrity.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Repository root, derived from this module's own location. */
export const REPO_ROOT = path.resolve(HERE, "..", "..");

/** The maximum logical model-backed stages the production pipeline can use. */
const PRODUCTION_MAX_LOGICAL_STAGES = 4;

export const DEFAULT_BENCHMARK_ID = "decision-benchmark-v1";

/**
 * Converts an absolute path to a repository-relative one. Every path that
 * reaches an artifact goes through this — recording `/Users/<someone>/...` in
 * a committed or shared report leaks the machine layout for no benefit.
 * @param {string} absolutePath
 */
export function toRepoRelative(absolutePath) {
  const relative = path.relative(REPO_ROOT, absolutePath);
  return relative.split(path.sep).join("/");
}

export class BenchmarkValidationError extends Error {
  /** @param {string} message @param {string[]} issues */
  constructor(message, issues) {
    super(`${message}\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "BenchmarkValidationError";
    this.issues = issues;
  }
}

async function readJson(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new BenchmarkValidationError(`Could not read ${toRepoRelative(filePath)}.`, [
      error && typeof error === "object" && "code" in error ? `filesystem error: ${error.code}` : "filesystem error",
    ]);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new BenchmarkValidationError(`Could not parse ${toRepoRelative(filePath)} as JSON.`, [
      error.message,
    ]);
  }
}

function formatIssues(zodError) {
  return zodError.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
}

/**
 * Loads, validates, and cross-checks a benchmark directory.
 *
 * Every one of these checks exists because its absence would let a silently
 * broken benchmark produce confident-looking numbers:
 *   - schema version must be one this build understands;
 *   - the manifest, the rubric, and every case must validate;
 *   - the manifest's case list and the case files on disk must agree exactly;
 *   - every case's decision input must validate against the *production*
 *     public request contract, not an evaluation-only copy of it;
 *   - every rubric dimension a case references must exist;
 *   - every variant's `variant_of` must point at a case that exists;
 *   - the benchmark's declared pipeline generation must match this harness.
 *
 * @param {{ benchmarkId?: string, datasetsDir?: string }} [options]
 */
export async function loadBenchmark({
  benchmarkId = DEFAULT_BENCHMARK_ID,
  datasetsDir = HERE,
} = {}) {
  const benchmarkDir = path.join(datasetsDir, benchmarkId);
  const manifestRaw = await readJson(path.join(benchmarkDir, "manifest.json"));

  assertSupportedSchemaVersion(manifestRaw?.schema_version);

  const manifestResult = benchmarkManifestSchema.safeParse(manifestRaw);
  if (!manifestResult.success) {
    throw new BenchmarkValidationError(
      `Invalid manifest for benchmark "${benchmarkId}".`,
      formatIssues(manifestResult.error),
    );
  }
  const manifest = manifestResult.data;

  if (manifest.benchmark_id !== benchmarkId) {
    throw new BenchmarkValidationError(`Benchmark identity mismatch.`, [
      `Directory is "${benchmarkId}" but manifest declares "${manifest.benchmark_id}".`,
    ]);
  }

  const rubricResult = rubricSchema.safeParse(
    await readJson(path.join(benchmarkDir, "rubric.json")),
  );
  if (!rubricResult.success) {
    throw new BenchmarkValidationError(
      `Invalid rubric for benchmark "${benchmarkId}".`,
      formatIssues(rubricResult.error),
    );
  }
  const rubric = rubricResult.data;

  if (rubric.rubric_version !== manifest.rubric_version) {
    throw new BenchmarkValidationError(`Rubric version mismatch.`, [
      `Manifest declares rubric ${manifest.rubric_version}, rubric file is ${rubric.rubric_version}.`,
    ]);
  }

  assertPipelineCompatibility({
    criteriaKeys: CRITERIA_KEYS,
    maxLogicalStages: PRODUCTION_MAX_LOGICAL_STAGES,
    declaredVersion: manifest.required_pipeline_version,
  });

  const casesDir = path.join(benchmarkDir, "cases");
  const caseFiles = (await readdir(casesDir))
    .filter((name) => name.endsWith(".json"))
    .sort();

  const issues = [];
  const cases = [];
  const rubricIds = new Set(rubric.dimensions.map((dimension) => dimension.id));
  const graderIds = new Set(ALL_GRADERS.map((grader) => grader.id));

  for (const fileName of caseFiles) {
    const parsed = parseBenchmarkCase(await readJson(path.join(casesDir, fileName)));
    if (!parsed.ok) {
      issues.push(...parsed.issues.map((issue) => `${fileName}: ${issue}`));
      continue;
    }
    const benchmarkCase = parsed.data;

    if (`${benchmarkCase.case_id}.json` !== fileName) {
      issues.push(`${fileName}: file name must match case_id "${benchmarkCase.case_id}".`);
    }
    if (benchmarkCase.schema_version !== manifest.schema_version) {
      issues.push(
        `${fileName}: schema_version "${benchmarkCase.schema_version}" does not match the manifest's "${manifest.schema_version}".`,
      );
    }
    for (const tag of benchmarkCase.tags) {
      if (!manifest.tag_catalog.includes(tag)) {
        issues.push(`${fileName}: tag "${tag}" is not in the manifest tag catalog.`);
      }
    }
    for (const dimensionId of benchmarkCase.rubric_dimensions) {
      if (!rubricIds.has(dimensionId)) {
        issues.push(`${fileName}: unknown rubric dimension "${dimensionId}".`);
      }
    }

    // A known-defect record that names a grader which does not exist would
    // silently suppress nothing while looking like an acknowledged issue.
    for (const defect of benchmarkCase.known_defects) {
      for (const observation of defect.expected_observations) {
        if (!graderIds.has(observation.grader_id)) {
          issues.push(
            `${fileName}: known defect ${defect.defect_id} references unknown grader "${observation.grader_id}".`,
          );
        }
      }
    }

    // Every scenario must produce a request the *production* contract accepts.
    // If the benchmark can describe a request the server would reject, the
    // benchmark is measuring something the product cannot actually do.
    benchmarkCase.input.scenarios.forEach((scenario, index) => {
      const requestResult = evaluationRequestSchema.safeParse({
        role: benchmarkCase.input.role,
        scenario,
        decision_mode: benchmarkCase.input.decision_mode,
        candidates: benchmarkCase.input.candidates,
        options: benchmarkCase.input.options,
      });
      if (!requestResult.success) {
        issues.push(
          ...formatIssues(requestResult.error).map(
            (issue) => `${fileName}: scenario[${index}] fails the production request contract: ${issue}`,
          ),
        );
      }
    });

    cases.push(benchmarkCase);
  }

  const foundIds = cases.map((benchmarkCase) => benchmarkCase.case_id);
  const declaredIds = manifest.case_ids;
  const missing = declaredIds.filter((id) => !foundIds.includes(id));
  const unexpected = foundIds.filter((id) => !declaredIds.includes(id));
  if (missing.length > 0) {
    issues.push(`manifest lists case(s) with no file on disk: ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    issues.push(`case file(s) not listed in the manifest: ${unexpected.join(", ")}`);
  }

  const byId = new Map(cases.map((benchmarkCase) => [benchmarkCase.case_id, benchmarkCase]));
  for (const benchmarkCase of cases) {
    if (benchmarkCase.variant_of && !byId.has(benchmarkCase.variant_of)) {
      issues.push(
        `${benchmarkCase.case_id}: variant_of references unknown case "${benchmarkCase.variant_of}".`,
      );
    }
  }

  if (issues.length > 0) {
    throw new BenchmarkValidationError(
      `Benchmark "${benchmarkId}" failed validation.`,
      issues,
    );
  }

  // Only the repository's released corpus is locked. Temporary datasets in
  // schema tests remain free to model invalid inputs deliberately.
  if (path.resolve(datasetsDir) === HERE) {
    await assertReleasedBenchmarkIntegrity(benchmarkDir, manifest);
  }

  // Ordered by the manifest, so a run's case order is a property of the
  // benchmark rather than of the filesystem.
  const ordered = declaredIds.map((id) => byId.get(id));
  return { manifest, rubric, cases: ordered, benchmarkDir };
}
