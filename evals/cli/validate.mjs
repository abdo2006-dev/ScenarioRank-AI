#!/usr/bin/env node
/**
 * `npm run eval:validate`
 *
 * Loads and fully validates a benchmark without executing anything. No
 * pipeline runs, no provider is constructed, no network access, no artifacts
 * written. This is the cheapest way to find out that a benchmark edit broke
 * something.
 */
import { parseArgs, single, showHelp, failWith } from "./args.js";
import { loadBenchmark, DEFAULT_BENCHMARK_ID } from "../datasets/loadBenchmark.js";
import { FAKE_PROVIDER_PROFILES, VALID_BASELINE_PROFILES } from "../fixtures/fakeProviderProfiles.js";
import { ALL_GRADERS, GRADER_SUITE_VERSION } from "../graders/deterministicGraders.js";

const HELP = `
eval:validate — validate a benchmark's manifest, rubric, and cases

Usage:
  npm run eval:validate -- [options]

Options:
  --benchmark <id>   Benchmark to validate (default: ${DEFAULT_BENCHMARK_ID})
  --help             Show this help

What it checks:
  - the manifest schema_version is one this harness supports
  - the manifest, rubric, and every case file validate against their schemas
  - the manifest's case list and the case files on disk agree exactly
  - every case's decision input validates against the production public
    request contract in shared/contracts/decisionApi.js
  - every rubric dimension a case references exists
  - every variant's variant_of points at a case that exists
  - the benchmark's declared pipeline generation matches this harness
  - every committed case declares synthetic-only data and a valid baseline
    fake-provider profile

Exit status:
  0  the benchmark is valid
  1  validation failed (details on stderr)

No pipeline is executed and no network request is made.
`;

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  if (flags.help) showHelp(HELP);

  const benchmarkId = single(values, "benchmark") ?? DEFAULT_BENCHMARK_ID;
  const { manifest, rubric, cases } = await loadBenchmark({ benchmarkId });

  // Checked here rather than in the schema: which profiles are acceptable for
  // a *committed baseline* case is a policy of this harness build, not part of
  // the case file format.
  const badProfiles = cases
    .filter((entry) => !VALID_BASELINE_PROFILES.includes(entry.fake_provider_plan.profile))
    .map((entry) => `${entry.case_id}: "${entry.fake_provider_plan.profile}"`);
  if (badProfiles.length > 0) {
    throw new Error(
      `Committed cases must declare a valid baseline fake-provider profile ` +
        `(${VALID_BASELINE_PROFILES.join(", ")}). Invalid profiles found:\n  - ${badProfiles.join("\n  - ")}\n` +
        "Deliberately-invalid profiles exist to prove the graders catch real defects, and belong in targeted tests, not in the committed baseline.",
    );
  }

  const tagCounts = {};
  for (const entry of cases) {
    for (const tag of entry.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }

  const lines = [
    `benchmark:        ${manifest.benchmark_id} v${manifest.benchmark_version} (schema ${manifest.schema_version}, metadata revision ${manifest.metadata_revision})`,
    `rubric:           v${rubric.rubric_version}, ${rubric.dimensions.length} dimension(s)`,
    `cases:            ${cases.length} valid`,
    `pairing cases:    ${cases.filter((entry) => entry.deterministic_expectations.pairing_enabled).length}`,
    `variant cases:    ${cases.filter((entry) => entry.variant_of !== null).length}`,
    `multi-scenario:   ${cases.filter((entry) => entry.input.scenarios.length > 1).length}`,
    `scenarios total:  ${cases.reduce((total, entry) => total + entry.input.scenarios.length, 0)}`,
    `graders:          ${ALL_GRADERS.length} (suite ${GRADER_SUITE_VERSION})`,
    `fixture profiles: ${Object.keys(FAKE_PROVIDER_PROFILES).length} (${VALID_BASELINE_PROFILES.length} valid for committed cases)`,
    `data policy:      ${manifest.data_policy}`,
    "",
    "tags:",
    ...Object.entries(tagCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tag, count]) => `  ${tag.padEnd(22)} ${count}`),
    "",
    manifest.scope_disclaimer,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

main().catch(failWith);
