# ADR-0009: Local-first evaluation harness and versioned benchmark

- **Status:** Accepted (Phase 3A)
- **Date:** 2026-08-02
- **Supersedes:** nothing
- **Related:** [ADR-0004](ADR-0004-single-openai-provider.md) (single OpenAI
  provider), [ADR-0005](ADR-0005-shared-http-contracts.md) (shared contracts),
  [ADR-0006](ADR-0006-retain-node-express.md) (Node/Express retained),
  [ADR-0007](ADR-0007-npm-only-lockfile.md) (npm only)

## Context

Phase 3 is "reliability and evaluation." Before ScenarioRank changes a prompt,
a model, a structured-output schema, the deterministic scoring formulas, the
ranking, or the pairing behaviour, it needs a way to tell whether that change
made anything better or worse. Without one, every future change is an opinion.

Two questions had to be answered before writing any of it.

**Where should evaluation run?** OpenAI offers a hosted Evals API, and using it
would mean less code to maintain.

**What is a benchmark result actually worth?** A benchmark that is described
as more than it is becomes a liability: it invites "our system was evaluated
and passed" from a set of sixteen invented cases.

## Current Phase 3A status (2026-08-05)

The committed offline baseline is `pass_with_known_defects`; fixture machinery:
passed. 16/16 cases completed without unexpected failure. There are 12 clean
cases, 8 known-defect observations, and 4 affected executions; 0 unexpected
failures and 0 unexpected defect resolutions. Current verification totals
are 103 frontend tests, 224 server tests, 326 evaluation tests, and 653 total
tests. SR-P3A-001 remains unfixed. No live evaluation or OpenAI request has
occurred, and Phase 3B remains unstarted.

## Decision

### 1. The harness is repository-native and local-first

Phase 3A builds the evaluation system inside this repository, under `evals/`,
executing the real production pipeline directly. The hosted OpenAI Evals API
is deliberately **not** integrated in this phase.

Reasons, in order of weight:

1. **It must evaluate this application's real orchestration.** Most of what is
   worth checking in ScenarioRank is not the model's text — it is the
   deterministic layer around it: batch-identity validation, ranking, risk
   formulas, pair canonicalisation, logical-stage accounting. A hosted
   evaluation service sees prompts and completions. It cannot see whether
   `mapPairResultsByIdentity` rejected a reversed duplicate.
2. **It must work offline, with no API key and no cost.** The owner has a
   small real budget. An evaluation system that costs money every time it runs
   will not be run, and an unused benchmark measures nothing.
3. **It must be testable without spending anything.** The harness is itself
   code that can be wrong. It has 326 evaluation tests, none of which calls
   OpenAI.
4. **It must remain provider-portable.** ScenarioRank reaches its provider
   through a provider-neutral contract (ADR-0002/ADR-0004). Binding evaluation
   to one vendor's evaluation product would reintroduce, at the evaluation
   layer, exactly the coupling the provider contract removed.
5. **Benchmarks and schemas belong under version control with the code they
   describe.** A benchmark that lives in a vendor dashboard cannot be reviewed
   in a pull request, cannot be bisected, and cannot be pinned to a commit.

The boundaries are drawn so a hosted service could be added later without
rewriting the benchmark: the dataset is plain JSON with its own schema, the
runner takes a provider factory rather than constructing a provider, and
grading is separate from execution. Adding a hosted adapter in a later phase
is a new `createProvider` implementation plus a reporter, not a rewrite.

### 2. The benchmark is versioned, and its identity is immutable

`decision-benchmark-v1` is fixed. The rules, enforced by schema and test:

- `benchmark_id` never changes once published.
- A case ID never changes and is never reused.
- Changing what an existing case *means* requires a new `benchmark_version`.
- A change that cannot alter any result increments `metadata_revision` only.
- `schema_version` describes file shape; a runner **refuses** a version it does
  not support rather than attempting a best-effort read.
- Every report records the benchmark version and the git commit.
- The comparison command refuses to compare across benchmark versions, so a
  benchmark edit can never be mistaken for a pipeline improvement.

### 3. Deterministic invariants and qualitative judgment are kept apart

A case carries `deterministic_expectations` (objectively checkable: coverage,
pair completeness, stage accounting, whether the reported winner matches the
deterministic ranking) and `rubric_dimensions` (human judgment: grounding,
trade-off clarity, uncertainty handling).

No case hardcodes one "correct" natural-language answer. Where more than one
winner is defensible, `allowed_winner_ids` lists all of them; where the
evidence is too thin to justify any winner claim, the case makes none.

Phase 3A implements **no LLM-as-judge grading**. Qualitative dimensions are
scored only through a structured human-review format, and the report keeps
dimension-level scores even when it computes a convenience aggregate.

### 4. Production never imports the harness

`evals/` imports production code — the pipeline, the shared contracts, the
deterministic scoring functions. Production imports nothing from `evals/`, and
a repository-protection test enforces the direction. Evaluation-specific
schemas *wrap* production output with benchmark metadata; the decision output
itself continues to validate through the real public contract.

### 5. Live mode is gated, budgeted, and off by default

Live runs require `--live`, an API key, a positive explicit budget, and a
deliberate case selection (nothing runs by default; the whole benchmark needs
its own flag). CI is refused unless overridden. The worst-case cost is computed
and displayed before the first request, refused if it exceeds the budget, and
re-checked between executions. A model with no recorded pricing is refused
outright, because a budget that cannot be computed cannot be enforced.

No real OpenAI call was made at any point during Phase 3A implementation.

## Alternatives considered

**Integrate the hosted OpenAI Evals API now.** Rejected for this phase: it
cannot observe the deterministic layer that most of these checks target, it
requires network access and spend for every run, and it would couple the
benchmark to one vendor. Reasonable to revisit once there is a question that
genuinely needs it (large-scale prompt sweeps, for instance).

**Golden-output snapshot tests.** Rejected as the primary mechanism. Snapshots
of model text fail on any wording change, which trains people to re-bless them
without reading. Deterministic invariants plus an explicit human rubric say
what actually matters.

**LLM-as-judge grading.** Deferred. It is a reasonable Phase 3B question, but
adding a second, unvalidated model judgment on top of an unvalidated first one
would produce numbers nobody could defend. The human-review format exists so
that a future judge can be checked against something.

**A single quality score.** Rejected. Collapsing eight qualitative dimensions
into one number hides which dimension is weak, which is the only actionable
part.

**Python for the harness.** Rejected, consistent with ADR-0006. Introducing a
second language and toolchain for evaluation alone would duplicate working,
tested infrastructure for no product requirement.

## Consequences

**Positive.** ScenarioRank can now detect regressions in coverage, ranking
agreement, pair integrity, stage accounting, and unsupported claims before a
change ships. The harness runs offline, free, in CI, in well under a second.
The first run already found a real production defect (SR-P3A-001, below).

**Negative / accepted.** A fixture run says nothing about prompt quality — it
exercises orchestration with a scripted provider. Qualitative dimensions
require a human, and no human review has been performed yet. Sixteen synthetic
cases are a development benchmark, not evidence about real decisions. Every one
of these limits is recorded in `docs/evaluation/BENCHMARK_V1.md` and carried
inside the run artifacts themselves.

**A real defect was found and deliberately not fixed.** `SR-P3A-001`:
`computeRiskAdjustedScore` can return a negative value for a weak candidate,
while `completedPipelineResponseSchema` bounds `risk_adjusted_score` to 0-100,
so `server/http/routes.js` rejects its own response and returns a generic 500
*after* the model has been paid for. Phase 3A is explicitly forbidden from
changing scoring or contracts, so the benchmark records it as a documented
known defect on the four cases that reproduce it. Known defects do not gate the
exit status, but a case-level check raises a **required** failure if a known
defect stops reproducing — so the record cannot outlive the defect, and a fix
cannot land silently. See `docs/architecture/KNOWN_LIMITATIONS.md` (P0.7).

## What this decision does not claim

The benchmark is not scientifically validated, not representative of real
hiring decisions, not evidence of fairness or demographic neutrality, not a
legal-compliance test, not a calibrated-confidence benchmark, and not a
production service-level objective. Nothing in the harness, the documentation,
or the UI may imply otherwise.
# 2026-08-03 hardening addendum

Known-defect suppression requires complete exact structured findings: an expected finding plus any unrelated finding remains a failure. Live budgeting derives from the frozen production cost/retry policy and verifies the plan before provider construction and before each execution. The released corpus is cross-checked against a repository-level integrity registry; only `eval:update-integrity -- --reason "..."` may add a provenance-bearing release record after reviewer confirmation.
