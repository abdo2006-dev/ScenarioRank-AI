#!/usr/bin/env node
/**
 * `npm run eval:live`
 *
 * Runs benchmark cases against the real OpenAI provider. Every guard in
 * evals/runners/liveRunner.js applies, and the provider module is imported
 * lazily so that merely loading this file — for `--help`, or for a test —
 * never constructs an OpenAI client.
 *
 * No real OpenAI call was made by this command during Phase 3A
 * implementation. Its refusal paths and budget arithmetic are covered by
 * tests that inject values rather than calling the API.
 */
import { parseArgs, assertAllowedArgs, single, many, integerOption, showHelp, failWith } from "./args.js";
import { loadBenchmark, DEFAULT_BENCHMARK_ID } from "../datasets/loadBenchmark.js";
import { runBenchmark } from "../runners/runBenchmark.js";
import { buildHumanReviewTemplate } from "../graders/rubricTemplate.js";
import { writeRunArtifacts } from "../reporters/jsonReporter.js";
import { renderRunMarkdown, renderConsoleSummary } from "../reporters/markdownReporter.js";
import {
  assertLiveModeAllowed,
  assertBudgetCoversPlan,
  estimateRunBudget,
  createBudgetGuard,
  renderLivePlan,
} from "../runners/liveRunner.js";

const HELP = `
eval:live — run benchmark cases against the real OpenAI provider (spends money)

Usage:
  npm run eval:live -- --live --case case-001 --max-budget-usd 0.25

Required:
  --live                   Explicit opt-in. Without it, nothing is sent
  --max-budget-usd <n>     Hard budget limit (or set EVAL_MAX_BUDGET_USD)
  --case <case-id>         Case to run; repeatable
    or --all-cases         Run every case in the benchmark, deliberately

Options:
  --benchmark <id>         Benchmark to run (default: ${DEFAULT_BENCHMARK_ID})
  --repetitions <n>        Executions per case+scenario (default: 1)
  --allow-ci               Permit running inside CI (refused by default)
  --help                   Show this help

Safeguards:
  - OPENAI_API_KEY must be set; it is never recorded in any artifact
  - refuses to run in CI unless --allow-ci is passed
  - refuses without an explicit, positive, finite budget limit
  - refuses a model that has no recorded pricing, because an unpriced run
    cannot be budget-enforced
  - prints the model, case count, repetitions, worst-case call count, and
    worst-case cost before the first request
  - refuses to start if the worst case exceeds the budget
  - stops before starting any execution that could exceed the budget
  - default repetitions is 1, and no case is selected by default

Cost note:
  Reported spend excludes attempts that failed before returning a response
  body, so true spend can exceed the reported total. OpenAI's billing
  dashboard is the source of truth.

Exit status:
  0  every required grader passed
  1  refused, failed to complete, or a required grader failed
`;

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const { flags, values } = parsed;
  assertAllowedArgs(parsed, { flags: ["help", "live", "all-cases", "allow-ci"], values: ["benchmark", "case", "repetitions", "max-budget-usd"], singleValues: ["benchmark", "repetitions", "max-budget-usd"] });
  if (flags.help) showHelp(HELP);

  const benchmarkId = single(values, "benchmark") ?? DEFAULT_BENCHMARK_ID;
  const benchmark = await loadBenchmark({ benchmarkId });

  const { budgetUsd, selectedIds, repetitions } = assertLiveModeAllowed({
    live: Boolean(flags.live),
    allowCi: Boolean(flags["allow-ci"]),
    caseIds: many(values, "case"),
    allCases: Boolean(flags["all-cases"]),
    repetitions: integerOption(single(values, "repetitions"), "--repetitions", 1),
    maxBudgetUsd: single(values, "max-budget-usd"),
    benchmarkCases: benchmark.cases,
  });

  // Imported only after every guard has passed, so no OpenAI client is ever
  // constructed by a refused invocation.
  const { createProvider } = await import("../../server/ai/providerFactory.js");
  const provider = createProvider();
  const model = provider.model;

  const selectedCases = selectedIds.map((caseId) =>
    benchmark.cases.find((entry) => entry.case_id === caseId),
  );
  const estimate = estimateRunBudget(selectedCases, model, repetitions);

  process.stdout.write(`${renderLivePlan({ model, selectedIds, repetitions, estimate, budgetUsd })}\n\n`);
  assertBudgetCoversPlan(estimate, budgetUsd);

  const guard = createBudgetGuard({ budgetUsd, model });
  const stopped = [];

  const run = await runBenchmark({
    benchmark,
    caseIds: selectedIds,
    mode: "live",
    provider: provider.name,
    model,
    repetitions,
    createProvider: () => provider,
    onExecution: (execution) => {
      guard.record(execution.response?.run_metadata.estimatedCostUsd ?? null);
    },
    beforeExecution: ({ benchmarkCase }) => {
      if (guard.canProceed(benchmarkCase)) return true;
      stopped.push(benchmarkCase.case_id);
      return false;
    },
  });

  process.stdout.write(`${renderConsoleSummary(run)}\n`);
  process.stdout.write(`reported spend: $${guard.spentUsd.toFixed(6)} of $${budgetUsd.toFixed(6)} budget\n`);
  if (stopped.length > 0) {
    process.stdout.write(`not executed (budget): ${stopped.join(", ")}\n`);
  }
  if (guard.stoppedReason) {
    process.stdout.write(`${guard.stoppedReason}\n`);
  }

  const { files } = await writeRunArtifacts({
    run,
    markdown: renderRunMarkdown(run),
    humanReviewTemplate: buildHumanReviewTemplate({
      rubric: benchmark.rubric,
      manifest: run.manifest,
      caseResults: run.caseResults,
      casesById: new Map(benchmark.cases.map((entry) => [entry.case_id, entry])),
    }),
  });
  process.stdout.write(`artifacts: .eval-runs/${run.manifest.run_id}/ (${files.join(", ")})\n`);

  if (!run.passed) process.exit(1);
}

main().catch(failWith);
