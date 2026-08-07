# decision-benchmark-v1

The first ScenarioRank development benchmark: **16 fully synthetic decision
cases**, 21 scenario executions, covering basic ranking, multi-scenario
behaviour, evidence quality, robustness to input permutation, and pairing.

## What this benchmark is not

Stated first, because it is the part most likely to be misread. This benchmark
is **not**:

- scientifically validated
- representative of real hiring decisions
- evidence of fairness
- evidence of demographic neutrality
- a legal-compliance test
- a calibrated-confidence benchmark
- a production service-level objective

It is a development benchmark. Its purpose is to make regressions visible
before a prompt, model, or scoring change is attempted. A passing run means the
pipeline still behaves the way this benchmark's authors specified — nothing
more. No documentation, report, or UI in this project may imply otherwise, and
the disclaimer is carried inside every run artifact so it cannot be separated
from the numbers.

## Synthetic-data policy

Every candidate, company, role, and record in this benchmark is invented. No
real person, employee, applicant, medical record, protected attribute, or user
data appears anywhere in it.

The policy is enforced, not just stated:

- every case declares `synthetic: true` and `data_policy: "synthetic-only"` as
  schema **literals**, not booleans a future case could quietly flip;
- the manifest declares `data_policy: "synthetic-only"`;
- a test scans every committed case for email addresses, phone numbers, URLs,
  absolute filesystem paths, and secret-shaped strings;
- a test asserts every case file describes its content as fictional, invented,
  or synthetic.

The irrelevant-text variant (`case-014`) appends deliberately mundane,
non-demographic sentences. It tests robustness to noise. It is **not** a
fairness test, and the benchmark makes no demographic claims of any kind.

## Versioning policy

`benchmark_id` is `decision-benchmark-v1` and never changes. The rules are
enforced by schema and by test:

| Change | Required action |
|---|---|
| Changing what an existing case means — its inputs, expectations, or what a pass implies | **New `benchmark_version`**, and by convention a new `benchmark_id` suffix (`decision-benchmark-v2`) |
| Fixing a typo or clarifying prose, with no possible effect on any result | Increment `metadata_revision` and deliberately refresh the reviewed content digest |
| Changing the case or manifest **file shape** | New `schema_version`; runners refuse a version they do not support |
| Adding a new case | New `benchmark_version`; case IDs are append-only |

Additional invariants:

- **A case ID never changes and is never reused after publication.** A result
  recorded against `case-007` must always mean the same case.
- **Every report records the benchmark version and the git commit.**
- **Runners refuse an unsupported `schema_version`** rather than attempting a
  best-effort read of an unknown format.
- **The comparison command refuses to compare across benchmark versions**, so a
  benchmark edit can never be mistaken for a pipeline improvement.
- **The released corpus is content-locked.** `release-integrity.json` binds
  the benchmark/version/schema/metadata revision to a canonical SHA-256 hash
  of the manifest, rubric, and every listed case. Object-key order and JSON
  whitespace do not affect it; array order does. Validation never rewrites the
  lock. A reviewer must deliberately regenerate the digest after confirming
  the appropriate versioning action.
- **Deterministic tests validate every committed case** on every test run.

The manifest also declares `required_pipeline_version`. Honest scope note:
production does not emit a pipeline version string, and Phase 3A deliberately
did not add one (no production behaviour changed). That field is a marker
maintained by the harness, backed by a real structural probe
(`assertPipelineCompatibility`) that asserts the facts the expectations
actually depend on — seven scoring criteria, at most four logical stages — so a
drift between marker and reality cannot pass unnoticed.

## Case categories

| Category | Cases |
|---|---|
| Basic ranking | 001 (dominant + weak), 002 (close call), 003 (different but valid strengths), 007 (strong specific evidence) |
| Multiple scenarios | 004 (two scenarios favouring different skills), 005 (three scenarios requiring trade-offs, including a consistently moderate candidate), 006 (strong in one scenario, weak in another) |
| Evidence quality | 007 (strong specific), 008 (vague unsupported claims), 009 (conflicting evidence), 010 (decision-critical evidence missing) |
| Robustness | 011 (candidate-order permutation), 012 (scenario-order permutation), 013 (semantically equivalent wording), 014 (one irrelevant sentence added) |
| Pairing | 015 (clear complementary pair + duplicate display names, distinct IDs), 016 (the two strongest individuals are not the best pair); pairing is disabled in 001-014 |
| Uncertainty | 008, 009, 010 |

Tag vocabulary is closed — an unknown tag is rejected, so "cases tagged X" can
never quietly mean "cases someone spelled X-ish": `basic-ranking`,
`multi-scenario`, `close-call`, `missing-evidence`, `conflicting-evidence`,
`permutation`, `duplicate-name`, `pairing`, `uncertainty`.

## Deterministic expectations versus qualitative opinion

No case hardcodes one "perfect" natural-language answer.

**Deterministic expectations** (objectively checkable):

```text
expected_candidate_ids            every candidate, exactly once
pairing_enabled                   must match the request options
expected_pair_count               fully determined by candidate count
expected_best_pair_ids            which pair the deterministic score must pick
required_stage_count              3 without pairing, 4 with it
required_scenario_coverage        every scenario, in order
allowed_winner_ids                every defensible winner, or null for no claim
forbidden_winner_ids              winners that would indicate a real problem
required_not_measured_fields      concepts that must report "not_measured"
maximum_provider_attempts         ceiling on real attempts per execution
expect_human_review_for_candidate_ids   who must be flagged for review
```

Three levels of winner claim are used deliberately:

- **A single allowed winner** (001, 007, 010) where one candidate genuinely
  dominates or is the only one with relevant evidence.
- **Several allowed winners** (002, 003, 004, 005, 006) where more than one
  outcome is legitimately defensible.
- **No winner claim at all** (008, 009) where the evidence is too thin or too
  contradictory to justify asserting any winner. Claiming one would be exactly
  the overclaiming this benchmark exists to detect. What *is* checked is that
  every candidate gets flagged for human review.

**Qualitative rubric** (human judgment, never automated in Phase 3A): eight
anchored dimensions in `rubric.json` — evidence grounding, scenario relevance,
trade-off clarity, clarity, uncertainty handling, recommendation consistency,
pairing usefulness, unsupported-claim avoidance. Each defines what is judged, a
0-4 scale, an anchor for every point, failure examples, whether human review is
required, and whether any deterministic automation is possible. Where a grader
covers part of a dimension, it covers a conservative subset only and is named
explicitly. See [`HUMAN_REVIEW_GUIDE.md`](HUMAN_REVIEW_GUIDE.md).

## Current baseline

`npm run eval:fixtures`, at benchmark version 1.1.0:

```text
cases: 16/16 passed   executions: 21   repetitions: 1
required failures: 0   advisory failures: 0   known defects: 0
stages: 65   attempts: 65   tokens: 0   cost: unavailable
fixture machinery: PASSED
production baseline: CLEAN PASS
known defect observations: 0 across 0 scoped executions
unexpected failures: 0
unexpected defect resolutions: 0
```

Scenario sensitivity is real, not assumed: `case-004` produces different
winners in its two scenarios, and `case-005` produces three different
specialist winners across its three scenarios while never ranking the
consistently moderate candidate first. `case-016` selects
`finnegan-adler::hollis-nakamura` as the best pair even though the two
strongest individuals are `finnegan-adler` and `giselle-varga`.

Tokens are zero and cost is `unavailable` because the fixture provider reports
no usage and its model name is not in the pricing table. That is correct
behaviour: `estimateCostUsd` returns `null` rather than guessing.

## Resolved defect found by this benchmark

`SR-P3A-001` exposed a negative risk-adjusted score that the old public
contract rejected after provider work completed. ADR-0010 adopted the signed
`-100…100` net-score contract. Before changing the benchmark, fixed production
code against v1.0.0 produced `baseline_change_required` with all eight expected
observations resolved and no unrelated failures. Version 1.1.0 removes only
those four case annotations and is the clean current baseline.

## Known limitations of this benchmark

1. **A fixture run says nothing about prompt or model quality.** The fake
   provider is scripted. It validates orchestration, deterministic computation,
   and the graders — not the product.
2. **Wording and irrelevant-text variants cannot fail under the fixture.** The
   fixture scores by candidate ID and never reads description text, so
   `case-013` and `case-014` are guaranteed to match their originals offline.
   They validate the linkage and comparison machinery. Only a live run can say
   whether wording actually moves a real model's scores.
3. **No human review has been performed.** Every qualitative dimension is
   currently unscored. The rubric and template exist; the judgments do not.
4. **Stability is unmeasured.** The baseline runs one repetition, and the
   harness reports `not assessed` rather than a meaningless 100%.
5. **`weighted_fit_score` cannot be recomputed** from the public response,
   because normalised criterion weights are not exposed. Everything derived
   from it is recomputed.
6. **Exact ties are resolved by submission order.** The production ranking is a
   stable sort over the submitted candidate array, so an exact tie keeps
   submission order — meaning a candidate-order permutation *could* legitimately
   change the winner on an exact tie. The benchmark avoids exact ties rather
   than baking that behaviour in as an expectation, and the grader checks the
   observed behaviour without claiming it is a designed guarantee.
7. **ScenarioRank has no near-tie uncertainty signal.** The deterministic
   confidence-and-evidence review keys only on reported confidence and evidence
   length, so a decision separated by noise is never flagged for human review.
   This is why `case-002` is a close-call case but is *not* tagged
   `uncertainty`. A real gap, and a Phase 3B candidate.
8. **Sixteen synthetic cases are a small sample**, written by the same author as
   the system. They encode that author's expectations, which is exactly why
   qualitative judgment is kept separate and human.
9. **No adversarial, prompt-injection, or malformed-input cases.** Deferred.
10. **No cross-scenario resilience measurement.** The pipeline reports
    `not_measured`, and the benchmark checks that it keeps saying so.

## Adding or changing a case

1. Decide whether the change alters meaning. If it does, it needs a new
   `benchmark_version` — not an edit in place.
2. Add the case file as `cases/case-0NN.json`, using the next unused ID.
3. Add the ID to `manifest.json` and bump `case_count`.
4. Run `npm run eval:validate`. It checks the schema, the manifest/disk
   agreement, the production request contract, rubric references, variant
   linkage, and pipeline compatibility.
5. Run `npm run eval:fixtures` and confirm the case behaves as designed —
   not just that it passes. A case that passes for the wrong reason is worse
   than no case.
6. Run `npm run test:evals`.
# Release integrity

Normal validation cross-checks each local `release-integrity.json` against `evals/datasets/released-benchmark-registry.json`. Formatting-only JSON changes do not change the canonical digest; array order and values do. To update a reviewed release deliberately, change `benchmark_version` for semantic changes or `metadata_revision` for cosmetic changes, confirm that classification with a reviewer, then run `npm run eval:update-integrity -- --benchmark decision-benchmark-v1 --reason "..."`. The command records previous/new digests, reason, timestamp, and version metadata; it never runs automatically, commits, or contacts a network.
