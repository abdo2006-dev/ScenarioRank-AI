# Evaluation architecture (Phase 3A)

How ScenarioRank measures itself, why it is built this way, and what a result
is and is not worth. The architectural decision itself is recorded in
[ADR-0009](../decisions/ADR-0009-local-first-evaluation-harness.md).

## Why evaluation comes before prompt optimisation

Phase 3A deliberately changes no prompt, no model, no schema, no scoring
formula, no ranking rule, and no pairing behaviour.

The reason is simple: without a measurement, "this prompt is better" is an
opinion. Optimising first and measuring afterwards produces a system whose
improvements cannot be demonstrated and whose regressions are invisible until a
user finds them. Building the benchmark first means every later change in
Phase 3B has a before-and-after that a reviewer can check.

There is a second reason specific to this project. ScenarioRank's central
architectural claim is that **LLMs interpret evidence and deterministic code
computes the ranking**. That claim is testable, and most of what the harness
checks is exactly it: does the reported winner match the deterministic score,
can every deterministic value be recomputed, does the narrative ever contradict
the structured result. Those checks needed to exist before anyone started
adjusting the parts of the system that could quietly break them.

## What the harness answers

1. Does the pipeline return structurally valid results?
2. Does deterministic ranking agree with the reported winner?
3. Are all scenarios and candidates covered?
4. Does pairing cover every expected candidate pair?
5. Are explanations grounded in the supplied evidence? *(human review)*
6. Does the output acknowledge uncertainty and missing evidence?
7. Does changing candidate order improperly change the result?
8. Does adding scenarios produce sensible scenario-sensitive behaviour?
9. How stable are repeated model runs? *(needs repetitions > 1)*
10. What do runs cost and how long do they take?
11. Did a proposed change improve or regress the benchmark?

Questions 1-4, 6-8, and 10-11 are answered deterministically. Question 5 is
human-only. Question 9 requires more than one repetition and reports
"not assessed" otherwise.

## Layout

```text
evals/
├── README.md                     entry point
├── datasets/
│   ├── loadBenchmark.js          strict, fail-closed loading and cross-checks
│   └── decision-benchmark-v1/
│       ├── manifest.json         immutable benchmark identity
│       ├── rubric.json           8 anchored human-review dimensions
│       └── cases/case-0NN.json   16 fully synthetic cases
├── schemas/
│   ├── benchmarkCase.js          case shape, expectations, known defects
│   ├── benchmarkManifest.js      manifest, rubric, compatibility probe
│   ├── evaluationRun.js          run manifest, case results, artifact policy
│   └── evaluationReport.js       human review, comparison report
├── fixtures/
│   └── fakeProviderProfiles.js   7 offline provider profiles
├── graders/
│   ├── deterministicGraders.js   11 graders + known-defect handling
│   ├── rubricTemplate.js         blank human-review template construction
│   └── humanReview.js            review parsing and aggregation
├── runners/
│   ├── runCase.js                one case: N scenarios x R repetitions
│   ├── runBenchmark.js           orchestration, stability, permutations
│   ├── compareRuns.js            four-verdict comparison
│   ├── caseVariants.js           controlled permutation utilities
│   ├── liveRunner.js             live gating and budget enforcement
│   └── observingProvider.js      records requested IDs only, never payloads
├── reporters/
│   ├── jsonReporter.js           run artifacts, policy-scanned before write
│   └── markdownReporter.js       summary.md, console output, comparison.md
└── cli/                          validate, fixtures, live, compare
```

## Boundaries

**One-way dependency.** `evals/` imports production — `server/pipeline`,
`server/domain/scoring.js`, `shared/contracts/`. Production imports nothing
from `evals/`. A repository-protection test enforces the direction across
`server/`, `src/`, `shared/`, `scripts/`, and `server.mjs`.

**No competing schema copies.** The decision output continues to validate
through the real `completedPipelineResponseSchema`. Evaluation schemas *wrap*
production output with benchmark metadata, grader results, and human review;
they never restate a production shape.

There is one deliberate exception, and it matters: the artifact schema stores
the pipeline response **without** enforcing the public contract. The whole
purpose of the `contract-validity` grader is to detect a response that violates
that contract. If the artifact schema also enforced it, the harness would crash
while recording the very defect it exists to find. Contract validation happens
in exactly one place — the grader — which reports the violation instead of
destroying the evidence.

**Never in production paths.** No HTTP route, frontend component, or build step
touches the harness. It is invoked only through its four CLI commands.

## Execution model

A case declares one or more scenarios. The production request contract takes
exactly one scenario, so the harness executes **one pipeline run per scenario**
rather than inventing a multi-scenario request shape the server cannot serve.
A case with N scenarios at R repetitions produces N x R executions, which are
never collapsed — that separation is what makes per-scenario behaviour and
run-to-run stability visible at all.

The runner is provider-agnostic: it takes a `createProvider` factory. Fixture
mode supplies an offline fake; live mode supplies the single real provider
instance resolved once. Both go through the identical code path, so a fixture
run genuinely exercises the same orchestration a live run does.

## Deterministic grading versus qualitative judgment

**Deterministic graders** answer questions that are objectively true or false.
There are 11, all `required` except where noted:

| Grader | Checks |
|---|---|
| `contract-validity` | response, run metadata, and every stage event validate against the public contract; no non-finite number |
| `candidate-coverage` | every candidate exactly once, no unknown, contiguous ranks, duplicate names still distinct by ID, and the scoring stage requested the right set |
| `ranking-consistency` | winner is rank 1, order agrees with the deterministic sort field, ties follow documented submission-order behaviour |
| `score-integrity` | scores in range, and every recomputable deterministic value matches a fresh recomputation from `server/domain/scoring.js` |
| `pairing-integrity` | every expected pair evaluated exactly once, canonical IDs, no reversed duplicate, best pair in top pairs, names match IDs, nothing fabricated when disabled |
| `pipeline-accounting` | 3 logical stages without pairing and 4 with, attempts sum correctly, token and cost metadata internally coherent |
| `not-measured-fields` | unmeasured concepts report the literal `not_measured` |
| `winner-expectation` | winner is allowed and not forbidden; skips where a case makes no claim |
| `unsupported-claims` | no fairness, calibration, validation, cross-scenario, or stability overclaim; narrative does not contradict the structured result |
| `uncertainty-acknowledgement` | thin or conflicting evidence produces a human-review recommendation |
| `scenario-coverage` | *(case scope)* every scenario executed and correctly reflected; none silently ignored |

`score-integrity` cannot recompute `weighted_fit_score`: the normalised
criterion weights are not part of the public response. Everything derived from
it is recomputed, and this limit is stated rather than glossed over.

The unsupported-claim checks are deliberately conservative. Keyword matching is
not a reliable way to detect overclaiming, and treating it as authoritative
would be its own form of overclaiming. They target a short list of specific,
high-confidence phrases and are scoped to **model-authored narrative fields
only**, so the pipeline's own honest "has not been measured" wording can never
trip them. The narrative-contradiction check is name-based, and is therefore
skipped — with the reason reported — when the winner's display name is shared
by another candidate.

**Qualitative dimensions** are scored by a human, on an anchored 0-4 scale,
across eight dimensions. See
[`HUMAN_REVIEW_GUIDE.md`](HUMAN_REVIEW_GUIDE.md). Phase 3A implements no
LLM-as-judge grading.

## Known defects

A case may declare `known_defects`: graders it is currently expected to fail
because of a documented, pre-existing product defect rather than a problem with
the case. A matching failure becomes `expected_failure` and stops gating the
exit status, so one real finding does not leave the whole baseline red — which
would train everyone to ignore it.

Three rules keep this from becoming an ordinary suppression:

- a known defect must name a documented reference;
- it must name the exact scenario indexes and a stable semantic finding code;
- if that grader/finding-code combination stops failing in a declared scenario,
  a **required** failure is raised demanding the record be removed. A
  known-defect record cannot outlive the defect it describes, and an unrelated
  grader failure cannot be suppressed by sharing its grader ID.

The reproduction check is evaluated per declared execution, because a defect
can legitimately reproduce in one scenario and not another — `case-006` is
exactly that shape.

One known defect exists today: `SR-P3A-001`, found by the very first fixture
run. See [`BENCHMARK_V1.md`](BENCHMARK_V1.md) and
`docs/architecture/KNOWN_LIMITATIONS.md` (P0.7).

## Fixture mode

`npm run eval:fixtures` runs the real pipeline against offline fake providers.
No network access, no API key, no cost, and deterministic decision content.
Seven profiles exist; three are valid and may be declared by a committed case,
and four are deliberately invalid and exist so the graders can be *proven* to
catch real defects rather than only ever observed passing.

| Profile | Valid | Purpose |
|---|---|---|
| `valid-standard` | yes | complete, well-formed responses |
| `valid-close-call` | yes | compresses scores so ranking margins are small |
| `valid-pairing` | yes | full, valid coverage of every expected pair |
| `malformed-once-then-success` | no | one incomplete batch, then a correct corrective retry — proves attempts rise while logical stages do not |
| `missing-pair` | no | pairing must report itself unavailable, never a partial best pair |
| `unknown-candidate` | no | scoring must fail rather than accept an unsubmitted candidate |
| `contradictory-explanation` | no | narrative recommends the runner-up; must be caught |

Fixture scores are looked up **by candidate ID, never by array position**. A
candidate-order permutation therefore receives byte-identical scoring input,
which is what makes the permutation check a test of the pipeline rather than of
the fixture.

## What a fixture run does and does not prove

**Does prove:** the orchestration runs end to end; the deterministic scoring,
ranking, and pair computation behave as specified; batch-identity validation
rejects what it should; stage and attempt accounting are coherent; the public
contract holds (or, where it does not, the harness says so); the graders
themselves work.

**Does not prove:** anything about prompt quality, model behaviour, real-world
accuracy, fairness, or stability under a real model. The fake provider is
scripted. A green fixture run means the machinery is sound, not that the
product is good.

## Live mode

Live mode exists to answer the questions a scripted provider cannot. It is
gated hard — see [`RUNBOOK.md`](RUNBOOK.md) for the full list. No real OpenAI
call was made at any point during Phase 3A implementation, and no automated
test in this repository calls OpenAI.

## Comparison

`npm run eval:compare` produces one of four verdicts: `improved`, `regressed`,
`unchanged`, `inconclusive`.

Only required-grader invariants can produce `improved` or `regressed` — they
are the only measure in the report that is objectively better or worse. Cost,
token, and duration deltas are reported raw and explicitly marked
`significance: "not_assessed"`, because two runs cannot support a significance
claim. An output change with no invariant change is `inconclusive`, not
`unchanged`: if a candidate run picks a different winner while failing exactly
as many invariants, the honest answer is that the benchmark cannot tell you
which is better.

The command refuses to compare different benchmarks or benchmark versions, so a
benchmark edit can never be mistaken for a pipeline change.

## Artifacts

Runs write to `.eval-runs/<run-id>/`, which is git-ignored. Every artifact is
schema-validated and scanned for secrets and absolute paths **before** it
touches the filesystem — writing first and checking later would leave a leaked
value on disk even if the command then failed. See
[`RUNBOOK.md`](RUNBOOK.md#artifacts-and-privacy).

## Extending to a hosted evaluation service later

The seams are already in place. A hosted service would be a new provider
factory plus a reporter. The dataset, the schemas, the graders, the comparison
logic, and the versioning policy are all independent of where execution
happens. This is why Phase 3A did not adopt one: nothing about doing it later
is harder than doing it now, and doing it now would have coupled the benchmark
to a vendor before it had proven itself locally.
