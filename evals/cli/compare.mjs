#!/usr/bin/env node
/**
 * `npm run eval:compare`
 *
 * Compares two recorded runs and reports one of four verdicts. Reads only
 * artifacts already on disk: no pipeline runs, no provider, no network.
 */
import path from "node:path";
import { writeFile } from "node:fs/promises";

import { parseArgs, assertAllowedArgs, single, showHelp, failWith } from "./args.js";
import { readRunArtifacts } from "../reporters/jsonReporter.js";
import { compareRuns } from "../runners/compareRuns.js";
import { renderComparisonMarkdown } from "../reporters/markdownReporter.js";
import { assertArtifactIsPolicyClean } from "../schemas/evaluationRun.js";

const HELP = `
eval:compare — compare two recorded evaluation runs

Usage:
  npm run eval:compare -- --baseline .eval-runs/run-a --candidate .eval-runs/run-b

Required:
  --baseline <dir>    Run directory to compare against
  --candidate <dir>   Run directory being assessed

Options:
  --out <dir>         Write comparison.json and comparison.md here
                      (default: the candidate run directory)
  --fail-on-regressed Exit nonzero when the verdict is "regressed"
  --help              Show this help

Verdicts:
  improved      required-grader failures fell
  regressed     required-grader failures rose
  unchanged     no invariant, decision, or explanation difference
  inconclusive  output changed without any invariant change, or the runs
                could not be meaningfully compared

What it deliberately does not do:
  - it never claims statistical significance; cost, token, and duration
    deltas are reported raw and marked "not_assessed"
  - it refuses to compare different benchmarks or benchmark versions
  - it compares rubric dimensions only when both runs carry a completed
    human review containing at least one real score
  - it compares stability only when both runs used more than one repetition

Exit status:
  0  the comparison completed
  1  the runs could not be compared, or --fail-on-regressed and the verdict
     was "regressed"
`;

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { flags, values } = parsed;
  assertAllowedArgs(parsed, { flags: ["help", "fail-on-regressed"], values: ["baseline", "candidate", "out"], singleValues: ["baseline", "candidate", "out"] });
  if (flags.help) showHelp(HELP);

  const baselineDir = single(values, "baseline");
  const candidateDir = single(values, "candidate");
  if (!baselineDir || !candidateDir) {
    throw new Error(
      "Both --baseline <dir> and --candidate <dir> are required. Each must be a run directory produced by eval:fixtures or eval:live.",
    );
  }

  let baseline;
  let candidate;
  try {
    baseline = await readRunArtifacts(path.resolve(baselineDir));
    candidate = await readRunArtifacts(path.resolve(candidateDir));
  } catch {
    throw new Error("Could not read one or both run directories. Pass directories produced by eval:fixtures or eval:live.");
  }
  const report = compareRuns(baseline, candidate);

  const markdown = renderComparisonMarkdown(report);
  process.stdout.write(`${markdown}\n`);

  const outDir = path.resolve(single(values, "out") ?? candidateDir);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  assertArtifactIsPolicyClean(json, "comparison.json");
  assertArtifactIsPolicyClean(markdown, "comparison.md");
  await writeFile(path.join(outDir, "comparison.json"), json, "utf8");
  await writeFile(path.join(outDir, "comparison.md"), `${markdown}\n`, "utf8");

  if (flags["fail-on-regressed"] && report.verdict === "regressed") {
    process.exit(1);
  }
}

main().catch(failWith);
