/**
 * @file Markdown run summary (Phase 3A evaluation harness).
 *
 * Renders a run into prose a human can read without opening JSON. Every claim
 * it makes is either a count or an explicit "not assessed" — it never
 * describes a result as good, fair, validated, or production-ready.
 *
 * No ANSI escapes are emitted anywhere: artifacts and CLI output must stay
 * greppable and diffable (docs/evaluation/RUNBOOK.md).
 */

const STATUS_LABEL = {
  pass: "pass",
  fail: "FAIL",
  skip: "skip",
  error: "ERROR",
  expected_failure: "known defect",
};

const RUN_STATUS_LABEL = {
  clean_pass: "CLEAN PASS",
  pass_with_known_defects: "PASS WITH KNOWN DEFECTS",
  unexpected_failure: "UNEXPECTED FAILURE",
  baseline_change_required: "BASELINE CHANGE REQUIRED",
};

function formatCost(value) {
  return value === null ? "unavailable" : `$${value.toFixed(6)}`;
}

function graderTable(graderTotals) {
  const rows = Object.entries(graderTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, totals]) =>
        `| \`${id}\` | ${totals.severity} | ${totals.pass} | ${totals.fail} | ${totals.skip} | ${totals.error} | ${totals.expected_failure} |`,
    );
  return [
    "| Grader | Severity | Pass | Fail | Skip | Error | Known defect |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

/**
 * Known defects are listed separately and prominently. They are excluded from
 * the pass/fail gate, so the report has to make sure nobody can read a green
 * run as "nothing is wrong".
 */
function knownDefectSection(caseResults) {
  const seen = new Map();
  for (const caseResult of caseResults) {
    const results = [
      ...caseResult.executions.flatMap((execution) => execution.grader_results),
      ...caseResult.grader_results,
    ];
    for (const result of results) {
      if (result.status !== "expected_failure") continue;
      const key = `${result.known_defect_id ?? "unknown"}\u0000${result.grader_id}`;
      if (!seen.has(key)) seen.set(key, { defect_id: result.known_defect_id ?? "unknown", grader_id: result.grader_id, cases: new Set(), detail: result.details.at(-1) });
      seen.get(key).cases.add(caseResult.case_id);
    }
  }
  if (seen.size === 0) return ["_No known defects were reproduced in this run._", ""];

  return [
    "These are documented, pre-existing product defects. They do not gate the exit status, and they are **not** resolved:",
    "",
    ...[...seen.values()].map(
      (entry) =>
        `- \`${entry.defect_id}\` / \`${entry.grader_id}\` in ${[...entry.cases].sort().join(", ")} — ${entry.detail ?? "see the case's known_defects entry"}`,
    ),
    "",
  ];
}

function failureDetail(caseResults) {
  const lines = [];
  for (const caseResult of caseResults) {
    const failing = [
      ...caseResult.executions.flatMap((execution) =>
        execution.grader_results
          .filter((result) => result.status === "fail" || result.status === "error")
          .map((result) => ({ where: execution.execution_id, result })),
      ),
      ...caseResult.grader_results
        .filter((result) => result.status === "fail" || result.status === "error")
        .map((result) => ({ where: caseResult.case_id, result })),
    ];
    if (failing.length === 0) continue;

    lines.push(`### ${caseResult.case_id} — ${caseResult.title}`, "");
    for (const { where, result } of failing) {
      lines.push(
        `- **${STATUS_LABEL[result.status]}** \`${result.grader_id}\` (${result.severity}) at \`${where}\`: ${result.summary}`,
      );
      for (const detail of result.details.slice(0, 8)) lines.push(`  - ${detail}`);
      if (result.details.length > 8) {
        lines.push(`  - …and ${result.details.length - 8} more`);
      }
    }
    lines.push("");
  }
  return lines;
}

function permutationSection(permutations) {
  if (permutations.length === 0) return ["_No permutation variants were part of this run._", ""];
  const rows = permutations.map((finding) => {
    if (!finding.compared) {
      return `| \`${finding.case_id}\` | ${finding.variant_kind} | not compared | ${finding.reason} |`;
    }
    const changed = [
      finding.winner_changed ? "winner" : null,
      finding.ranking_changed ? "ranking" : null,
      finding.best_pair_changed ? "pair" : null,
      finding.structured_evidence_changed ? "evidence" : null,
      finding.explanation_changed ? "explanation" : null,
    ].filter(Boolean);
    return `| \`${finding.case_id}\` | ${finding.variant_kind} | ${changed.length === 0 ? "no change" : changed.join(", ")} | vs \`${finding.variant_of}\` |`;
  });
  return [
    "| Variant | Kind | Changed | Notes |",
    "|---|---|---|---|",
    ...rows,
    "",
    "Under the offline fixture provider, wording and irrelevant-text variants cannot differ at all: the fixture scores by candidate ID and never reads description text. A \"no change\" result for those kinds validates the comparison machinery, not the model.",
    "",
  ];
}

/**
 * @param {object} run result of runBenchmark()
 * @returns {string} markdown
 */
export function renderRunMarkdown(run) {
  const { manifest, summary, caseResults, permutations } = run;

  const lines = [
    `# Evaluation run \`${manifest.run_id}\``,
    "",
    `**Run state: ${RUN_STATUS_LABEL[summary.run_state]}**`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Mode | ${manifest.mode} |`,
    `| Benchmark | \`${manifest.benchmark_id}\` v${manifest.benchmark_version} (schema ${manifest.benchmark_schema_version}) |`,
    `| Rubric | v${manifest.rubric_version} |`,
    `| Commit | ${manifest.git_commit ?? "unknown"}${manifest.git_branch ? ` (${manifest.git_branch})` : ""} |`,
    `| Provider / model | ${manifest.provider} / ${manifest.model} |`,
    `| Cases | ${summary.case_count} completed: ${summary.clean_pass_count} clean cases; ${summary.affected_execution_ids.length} cases containing expected known-defect observations; ${summary.unexpected_failures} unexpected failures |`,
    `| Clean cases | ${summary.clean_pass_count} |`,
    `| Known-defect observations | ${summary.expected_failures} |`,
    `| Affected executions | ${summary.affected_execution_ids.length} |`,
    `| Unexpected failures | ${summary.unexpected_failures} |`,
    `| Unexpected defect resolutions | ${summary.unexpected_defect_resolutions} |`,
    `| Executions | ${summary.execution_count} at ${manifest.repetitions} repetition(s) |`,
    `| Pairing cases | ${manifest.pairing_cases} |`,
    `| Logical provider stages | ${manifest.logical_provider_stages} |`,
    `| Provider attempts | ${manifest.provider_attempts} |`,
    `| Tokens (in / out / total) | ${manifest.input_tokens} / ${manifest.output_tokens} / ${manifest.total_tokens} |`,
    `| Estimated cost | ${formatCost(manifest.estimated_cost_usd)} |`,
    `| Duration | ${manifest.duration_ms} ms |`,
    "",
    "## Graders",
    "",
    graderTable(summary.grader_totals),
    "",
    "## Known defects reproduced",
    "",
    ...knownDefectSection(caseResults),
    "## Run-to-run stability",
    "",
    summary.stability.assessed
      ? `Winner agreement ${summary.stability.winner_agreement}, ranking agreement ${summary.stability.ranking_agreement}. ${summary.stability.reason}`
      : summary.stability.reason,
    "",
    "## Permutation variants",
    "",
    ...permutationSection(permutations),
    "## Cases",
    "",
    "| Case | Title | Tags | Required failures | Advisory | Result |",
    "|---|---|---|---|---|---|",
    ...caseResults.map(
      (caseResult) =>
        `| \`${caseResult.case_id}\` | ${caseResult.title} | ${caseResult.tags.join(", ")} | ${caseResult.required_failures} | ${caseResult.advisory_failures} | ${caseResult.passed ? "pass" : "FAIL"} |`,
    ),
    "",
  ];

  const failures = failureDetail(caseResults);
  if (failures.length > 0) {
    lines.push("## Failures", "", ...failures);
  }

  lines.push("## Scope", "", summary.disclaimer, "");
  return lines.join("\n");
}

/**
 * Compact, non-ANSI console summary. Kept separate from the artifact renderer
 * so CLI output can stay short without the artifact losing detail.
 * @param {object} run
 */
export function renderConsoleSummary(run) {
  const { manifest, summary } = run;
  return [
    `run: ${manifest.run_id}`,
    `mode: ${manifest.mode}  benchmark: ${manifest.benchmark_id} v${manifest.benchmark_version}  commit: ${manifest.git_commit ?? "unknown"}`,
    `cases: ${summary.passed_cases}/${summary.case_count} passed   executions: ${summary.execution_count}   repetitions: ${manifest.repetitions}`,
    `required failures: ${summary.required_failures}   advisory failures: ${summary.advisory_failures}   known defects: ${summary.expected_failures}`,
    `stages: ${manifest.logical_provider_stages}   attempts: ${manifest.provider_attempts}   tokens: ${manifest.total_tokens}   cost: ${formatCost(manifest.estimated_cost_usd)}   duration: ${manifest.duration_ms}ms`,
    `stability: ${summary.stability.assessed ? `winner ${summary.stability.winner_agreement}, ranking ${summary.stability.ranking_agreement}` : "not assessed (single repetition)"}`,
    `fixture machinery: ${summary.run_state === "unexpected_failure" || summary.run_state === "baseline_change_required" ? "FAILED" : "PASSED"}`,
    `production baseline: ${RUN_STATUS_LABEL[summary.run_state]}`,
    `known defect observations: ${summary.expected_failures} across ${summary.affected_execution_ids.length} scoped execution(s)`,
    `unexpected failures: ${summary.unexpected_failures}`,
    `unexpected defect resolutions: ${summary.unexpected_defect_resolutions}`,
  ].join("\n");
}

/**
 * @param {object} report validated comparison report
 * @returns {string} markdown
 */
export function renderComparisonMarkdown(report) {
  const delta = (entry) =>
    entry.delta === null ? "n/a" : `${entry.baseline} → ${entry.candidate} (${entry.delta >= 0 ? "+" : ""}${entry.delta})`;

  const lines = [
    `# Comparison: \`${report.baseline_run_id}\` → \`${report.candidate_run_id}\``,
    "",
    `**Verdict: ${report.verdict}**`,
    "",
    ...report.verdict_reasons.map((reason) => `- ${reason}`),
    "",
    "| Measure | Baseline → Candidate |",
    "|---|---|",
    `| Required failures | ${delta(report.invariants.required_failures)} |`,
    `| Advisory failures | ${delta(report.invariants.advisory_failures)} |`,
    `| Expected known-defect observations | ${delta(report.invariants.expected_failures)} |`,
    `| Schema failures | ${delta(report.invariants.schema_failures)} |`,
    `| Passed cases | ${delta(report.invariants.passed_cases)} |`,
    `| Total tokens | ${delta(report.tokens)} |`,
    `| Estimated cost | ${delta(report.cost)} |`,
    `| Duration (ms) | ${delta(report.duration_ms)} |`,
    "",
    `Winner changes: ${report.winner_changes.length === 0 ? "none" : report.winner_changes.join(", ")}`,
    `Ranking changes: ${report.ranking_changes.length === 0 ? "none" : report.ranking_changes.join(", ")}`,
    `Pair changes: ${report.pair_changes.length === 0 ? "none" : report.pair_changes.join(", ")}`,
    "",
    "## Rubric",
    "",
    report.rubric.compared
      ? Object.entries(report.rubric.dimensions)
          .map(([id, entry]) => `- \`${id}\`: ${delta(entry)}`)
          .join("\n")
      : report.rubric.reason,
    "",
    "## Stability",
    "",
    "## Known-defect observation comparison",
    "",
    `- Unchanged observations: ${report.defect_observations.unchanged.length}`,
    `- Disappeared observations: ${report.defect_observations.disappeared.length}`,
    `- New observations: ${report.defect_observations.appeared.length}`,
    `- Changed signatures: ${report.defect_observations.changed_signature.length}`,
    `- Moved observations: ${report.defect_observations.moved.length}`,
    `- Count changes: ${report.invariants.expected_failures.delta === null ? "n/a" : report.invariants.expected_failures.delta}`,
    "",
    report.stability.compared
      ? `Baseline winner agreement ${report.stability.baseline_winner_agreement}, candidate ${report.stability.candidate_winner_agreement}.`
      : report.stability.reason,
    "",
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "",
  ];
  return lines.join("\n");
}
