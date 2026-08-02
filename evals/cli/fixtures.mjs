#!/usr/bin/env node
/**
 * `npm run eval:fixtures`
 *
 * Runs the benchmark against the real pipeline with offline fake providers.
 * No network access, no API key, no cost, deterministic decision content.
 * Suitable for CI, and the command a change to prompts, scoring, or ranking
 * should be measured against — before and after.
 */
import { parseArgs, assertAllowedArgs, single, many, integerOption, showHelp, failWith } from "./args.js";
import { loadBenchmark, DEFAULT_BENCHMARK_ID } from "../datasets/loadBenchmark.js";
import { createEvalFakeProvider } from "../fixtures/fakeProviderProfiles.js";
import { runBenchmark } from "../runners/runBenchmark.js";
import { buildHumanReviewTemplate } from "../graders/rubricTemplate.js";
import { writeRunArtifacts } from "../reporters/jsonReporter.js";
import { renderRunMarkdown, renderConsoleSummary } from "../reporters/markdownReporter.js";

const HELP = `
eval:fixtures — run the benchmark offline against the real pipeline

Usage:
  npm run eval:fixtures -- [options]

Options:
  --benchmark <id>    Benchmark to run (default: ${DEFAULT_BENCHMARK_ID})
  --case <case-id>    Run only this case; repeatable. Default: every case
  --repetitions <n>   Executions per case+scenario (default: 1)
  --profile <name>    Override every case's fake-provider profile. Intended
                      for deliberately-invalid profiles when checking that a
                      grader catches a defect
  --no-write          Grade and print, but write no run artifacts
  --help              Show this help

Behaviour:
  - executes the real production pipeline with an offline fake provider
  - makes zero network requests and reads no API key
  - writes artifacts to .eval-runs/<run-id>/ (git-ignored)
  - decision content is deterministic; timestamps, durations, and request_id
    are not, and are excluded from every comparison

Exit status:
  0  every required grader passed
  1  at least one required grader failed, or the run could not complete
`;

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { flags, values } = parsed;
  assertAllowedArgs(parsed, { flags: ["help", "no-write"], values: ["benchmark", "case", "repetitions", "profile"], singleValues: ["benchmark", "repetitions", "profile"] });
  if (flags.help) showHelp(HELP);

  const benchmarkId = single(values, "benchmark") ?? DEFAULT_BENCHMARK_ID;
  const repetitions = integerOption(single(values, "repetitions"), "--repetitions", 1);
  if (repetitions < 1) throw new Error("--repetitions must be at least 1.");

  const benchmark = await loadBenchmark({ benchmarkId });
  const requested = many(values, "case");
  const known = new Set(benchmark.cases.map((entry) => entry.case_id));
  const unknown = requested.filter((caseId) => !known.has(caseId));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown case id(s): ${unknown.join(", ")}. Run \`npm run eval:validate\` to see this benchmark's cases.`,
    );
  }

  // Unlike live mode, running everything is the sensible default here: a
  // fixture run is free, offline, and fast.
  const caseIds = requested.length > 0 ? requested : benchmark.cases.map((entry) => entry.case_id);
  const profileOverride = single(values, "profile");

  const run = await runBenchmark({
    benchmark,
    caseIds,
    mode: "fixtures",
    provider: "fake-eval",
    model: profileOverride ? `fixture:${profileOverride}` : "fixture:per-case",
    repetitions,
    createProvider: ({ benchmarkCase, scenarioIndex }) =>
      createEvalFakeProvider({ benchmarkCase, scenarioIndex, profile: profileOverride }),
  });

  process.stdout.write(`${renderConsoleSummary(run)}\n`);

  if (!flags["no-write"]) {
    const { runDir, files } = await writeRunArtifacts({
      run,
      markdown: renderRunMarkdown(run),
      humanReviewTemplate: buildHumanReviewTemplate({
        rubric: benchmark.rubric,
        manifest: run.manifest,
        caseResults: run.caseResults,
        casesById: new Map(benchmark.cases.map((entry) => [entry.case_id, entry])),
      }),
    });
    // Relative, so the line is identical on every machine and safe to paste.
    process.stdout.write(
      `artifacts: .eval-runs/${run.manifest.run_id}/ (${files.join(", ")})\n`,
    );
    void runDir;
  }

  if (!run.passed) {
    process.stderr.write(
      `\n${run.summary.required_failures} required grader failure(s). See summary.md in the run directory for details.\n`,
    );
    process.exit(1);
  }
}

main().catch(failWith);
