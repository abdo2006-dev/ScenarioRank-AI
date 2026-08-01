/**
 * @file JSON run artifacts (Phase 3A evaluation harness).
 *
 * Writes a run directory under `.eval-runs/` (git-ignored). Every artifact is
 * validated against its schema and scanned for policy violations *before* it
 * touches the filesystem — writing first and checking later would leave a
 * leaked value on disk even if the command then failed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  runManifestSchema,
  runSummarySchema,
  caseResultSchema,
  assertArtifactIsPolicyClean,
} from "../schemas/evaluationRun.js";
import { humanReviewTemplateSchema } from "../schemas/evaluationReport.js";

/** Git-ignored. Run output is never committed (docs/evaluation/RUNBOOK.md). */
export const RUN_ROOT_DIRNAME = ".eval-runs";

async function writeChecked(filePath, artifact, label) {
  const serialized = typeof artifact === "string" ? artifact : `${JSON.stringify(artifact, null, 2)}\n`;
  assertArtifactIsPolicyClean(serialized, label);
  await writeFile(filePath, serialized, "utf8");
}

/**
 * A case result carries full pipeline responses, which are large. They are
 * kept — the whole point of an artifact is that a later comparison does not
 * have to re-run anything — but each case is written as one JSONL line so a
 * reader can stream them.
 */
function toJsonl(caseResults) {
  return `${caseResults.map((caseResult) => JSON.stringify(caseResult)).join("\n")}\n`;
}

/**
 * @param {object} options
 * @param {object} options.run result of runBenchmark()
 * @param {object} options.humanReviewTemplate blank review template
 * @param {string} options.markdown rendered summary.md
 * @param {string} [options.rootDir] defaults to `<cwd>/.eval-runs`
 * @returns {Promise<{ runDir: string, files: string[] }>}
 */
export async function writeRunArtifacts({ run, humanReviewTemplate, markdown, rootDir }) {
  const manifest = runManifestSchema.parse(run.manifest);
  const summary = runSummarySchema.parse(run.summary);
  const caseResults = run.caseResults.map((caseResult) => caseResultSchema.parse(caseResult));
  const template = humanReviewTemplateSchema.parse(humanReviewTemplate);

  const root = rootDir ?? path.join(process.cwd(), RUN_ROOT_DIRNAME);
  const runDir = path.join(root, manifest.run_id);
  await mkdir(runDir, { recursive: true });

  // Permutation findings live beside the summary rather than inside it: they
  // are observational, not a pass/fail signal, and mixing them into the
  // summary would invite reading them as one.
  const files = [
    ["run-manifest.json", manifest],
    ["summary.json", summary],
    ["permutations.json", { run_id: manifest.run_id, findings: run.permutations }],
    ["human-review-template.json", template],
  ];

  for (const [name, artifact] of files) {
    await writeChecked(path.join(runDir, name), artifact, name);
  }
  await writeChecked(path.join(runDir, "case-results.jsonl"), toJsonl(caseResults), "case-results.jsonl");
  await writeChecked(path.join(runDir, "summary.md"), markdown, "summary.md");

  return {
    runDir,
    files: [
      "run-manifest.json",
      "case-results.jsonl",
      "summary.json",
      "summary.md",
      "permutations.json",
      "human-review-template.json",
    ],
  };
}

/**
 * Reads a run directory back for comparison.
 * @param {string} runDir
 */
export async function readRunArtifacts(runDir) {
  const { readFile } = await import("node:fs/promises");
  const readJson = async (name) => JSON.parse(await readFile(path.join(runDir, name), "utf8"));

  const manifest = runManifestSchema.parse(await readJson("run-manifest.json"));
  const summary = runSummarySchema.parse(await readJson("summary.json"));
  const jsonl = await readFile(path.join(runDir, "case-results.jsonl"), "utf8");
  const caseResults = jsonl
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => caseResultSchema.parse(JSON.parse(line)));

  let humanReview = null;
  try {
    humanReview = humanReviewTemplateSchema.parse(await readJson("human-review.json"));
  } catch {
    // A completed review is optional: a run that nobody has reviewed yet is
    // the normal case, and the comparison says so rather than inventing one.
    humanReview = null;
  }

  return { manifest, summary, caseResults, humanReview };
}
