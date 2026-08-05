# Evaluation runbook

Operating instructions for the ScenarioRank evaluation harness. Architecture is
in [`EVALUATION_ARCHITECTURE.md`](EVALUATION_ARCHITECTURE.md); the benchmark
itself is in [`BENCHMARK_V1.md`](BENCHMARK_V1.md).

## Commands

All four run from the repository root, support `--help`, reject unknown or
malformed options, emit no ANSI escape codes, and return nonzero on a required
failure.

```bash
npm run eval:validate
```

```bash
npm run eval:fixtures
```

```bash
npm run eval:live
```

```bash
npm run eval:compare
```

Only `eval:live` accesses the network, and only after every guard below has
passed.

## Validate

Loads and fully validates a benchmark without executing anything — no pipeline
run, no provider, no artifacts. The cheapest way to find out that a benchmark
edit broke something.

```bash
npm run eval:validate
```

Checks the supported schema version; the manifest, rubric, and every case file;
that the manifest's case list and the files on disk agree exactly; that every
case's decision input validates against the **production** request contract;
that every referenced rubric dimension and known-defect grader exists; that
every variant's `variant_of` resolves; and that the declared pipeline
generation matches this harness.

## Fixtures

```bash
npm run eval:fixtures
```

Runs the real production pipeline against offline fake providers. No network
access, no API key, no cost, deterministic decision content. Suitable for CI.

Useful options:

```bash
npm run eval:fixtures -- --case case-007 --case case-015
```

```bash
npm run eval:fixtures -- --repetitions 3
```

```bash
npm run eval:fixtures -- --no-write
```

`--profile <name>` overrides every case's fake-provider profile. It exists to
check that a grader catches a defect — for example, confirming that a missing
pair really does produce an honest "unavailable" rather than a partial best
pair:

```bash
npm run eval:fixtures -- --case case-015 --profile missing-pair --no-write
```

Deliberately-invalid profiles are never used in the committed baseline.

Exit status is `0` when every required grader passed, `1` otherwise. Known
defects do not affect it — see below.

## Live

Live mode spends real money. **No real OpenAI call was made during Phase 3A
implementation, and no automated test in this repository calls OpenAI.**

```bash
npm run eval:live -- --live --case case-001 --max-budget-usd 0.25
```

### Safeguards

| Guard | Behaviour |
|---|---|
| `--live` required | without it nothing is sent; the provider module is never even imported |
| `OPENAI_API_KEY` required | checked before anything is constructed; never recorded in any artifact |
| CI refused by default | `--allow-ci` is required to override. `CI=false` still counts as CI declaring itself |
| Budget required | `--max-budget-usd <n>` or `EVAL_MAX_BUDGET_USD`; must be positive and finite |
| Plan displayed first | model, case count, repetitions, worst-case call count, worst-case cost, and budget, before the first request |
| Pre-flight refusal | if the worst case exceeds the budget, the run is refused **before** the first call, not stopped part-way |
| Unpriced model refused | a budget that cannot be computed cannot be enforced, and guessing a price would defeat the purpose |
| Between-execution guard | stops **before** starting any execution whose worst case would breach the limit |
| Default repetitions is 1 | never silently multiplied |
| Default case selection is nothing | `--case` is repeatable; the whole benchmark requires `--all-cases` |
| No extra retries | the production retry policy is used unchanged |
| Nothing auto-committed | artifacts go to git-ignored `.eval-runs/` |

### Budget arithmetic

The estimate is deliberately pessimistic, because under-estimating is the only
error that costs money. It includes two provider attempts for each context and
decision request; two integrity passes for scoring and, where applicable,
pairing, each with two provider attempts; and truncation-retry output headroom.
It also uses a generous fixed input size per attempt, then prices the result
through the same `server/ai/pricing/openaiPricing.js` table the application
uses.

One honest caveat, stated in the stop message itself: reported spend excludes
attempts that failed before returning a response body, so true spend can exceed
the reported total. OpenAI's billing dashboard is the source of truth; this is a
budget guard, not an invoice.

### Recommended first live run

One case, one repetition, a small budget:

```bash
npm run eval:live -- --live --case case-001 --max-budget-usd 0.05
```

Read the plan it prints before letting it proceed.

## Compare

```bash
npm run eval:compare -- --baseline .eval-runs/run-a --candidate .eval-runs/run-b
```

Reads only artifacts already on disk. Writes `comparison.json` and
`comparison.md` into the candidate run directory (or `--out <dir>`).

Verdicts: `improved`, `regressed`, `unchanged`, `inconclusive`.

What it will not do:

- claim statistical significance — cost, token, and duration deltas are raw and
  marked `not_assessed`;
- compare different benchmarks or benchmark versions;
- compare rubric dimensions unless **both** runs carry a completed human review
  with at least one real score;
- compare stability unless **both** runs used more than one repetition;
- call a changed winner a regression — several cases have more than one
  defensible winner.

`--fail-on-regressed` exits nonzero on a `regressed` verdict, for CI use.

## Artifacts and privacy

Runs write to `.eval-runs/<run-id>/`, which is git-ignored:

```text
run-manifest.json           identity, versions, commit, totals, grader versions
case-results.jsonl          one JSON line per case, with full responses
summary.json                counts, grader totals, stability, disclaimer
summary.md                  readable report
permutations.json           variant-versus-original findings
human-review-template.json  blank template for a reviewer
```

Recorded: run ID, timestamp, benchmark ID/version, rubric version, git commit
and branch, provider, model, case selection, repetition count, pairing case
count, logical stages, provider attempts, token totals, estimated cost,
duration, and grader versions.

Never recorded: API keys, request headers, request or response bodies, or
machine-specific absolute paths. Every artifact is schema-validated and scanned
for secret- and absolute-path-shaped strings **before** it is written —
checking after writing would leave a leaked value on disk even if the command
then failed.

The request observer keeps derived identifiers only (candidate IDs, canonical
pair keys, per-stage attempt counts), never prompt or response text.

Run output is never committed. A run is reproducible from the committed
benchmark plus a commit hash.

## Known defects in a run

A case may declare a documented, pre-existing product defect it currently
reproduces. Those failures appear as `known defect` in the report, are listed
in their own prominent section of `summary.md`, and do **not** gate the exit
status — one real finding should not leave the baseline permanently red, which
would train everyone to ignore it.

The safety catch: every record names its exact scenario indexes and stable
semantic finding code. If that exact known defect stops reproducing, a
**required** failure fires demanding the record be removed. A known-defect
record cannot outlive the defect it describes, and it cannot suppress an
unrelated failure from the same grader.

If you see `known-defect-still-present:SR-XXX-NNN` fail, something was fixed.
Remove the `known_defects` entry from the case and update the referenced
documentation.

## CI

`npm run eval:fixtures` is CI-suitable: offline, free, deterministic, and it
exits nonzero on a required failure. `npm test` already includes
`npm run test:evals`, which covers the harness itself.

`npm run eval:live` refuses to run in CI by default and should stay that way.

## Troubleshooting

**`Unsupported benchmark schema_version`** — the benchmark's file shape is
newer than this harness build. Do not edit the version to make it load; that is
the check working.

**`Benchmark "..." failed validation`** — the error lists every issue. Nothing
runs until all are fixed; a partially-valid benchmark produces results that
look authoritative and are not.

**`Refusing to write <artifact>`** — a secret- or absolute-path-shaped string
reached an artifact. Investigate rather than relaxing the scanner.

**`Refusing to compare benchmark versions`** — expected. Re-run the baseline at
the current benchmark version.

**`no recorded pricing for model`** — the model is not in
`server/ai/pricing/openaiPricing.js`. Add it from OpenAI's own pricing page
before running live.
# Current reporting and live safeguards

Fixture reports lead with run state and list clean cases, expected observations, affected executions, unexpected failures, and unexpected defect resolutions. The current v1.1.0 baseline is `CLEAN PASS`: 16 clean cases, 0 observations, 0 affected executions, and 0 unexpected failures. Live runs are not part of this baseline and have not been run. A live plan is budget-verified before provider construction and before every execution; budgets are decimal-only and capped at $100, repetitions are decimal integers capped at 20.
