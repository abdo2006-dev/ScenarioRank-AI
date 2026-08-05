# Human review guide

How to score a ScenarioRank evaluation run's qualitative dimensions, and what
those scores are worth.

## What these scores are

Structured human opinion. They are **not** measurements. They are not
calibrated, not inter-rater validated, and not evidence that ScenarioRank is
fair, accurate, or production-ready. One reviewer's scores describe one
reviewer's judgment of one run.

They exist because the deterministic graders genuinely cannot answer the
questions that matter most about an explanation: is this claim grounded in the
evidence supplied, is the trade-off real, would a decision-maker understand it.
Automating those with a second language model would produce numbers nobody
could defend, so Phase 3A does not.

## Getting a template

Every run writes `human-review-template.json` into its run directory:

```bash
npm run eval:fixtures
```

The template contains one entry per **completed** execution. Failed executions
are omitted deliberately — there is no explanation to review, and a blank entry
would invite scoring something that does not exist.

Each entry carries only the dimensions its case declares (`pairing_usefulness`
appears only for pairing cases), and each dimension carries its own anchors, so
you never have to hold the rubric open in another window.

To record a review, copy the template to `human-review.json` **in the same run
directory**, fill it in, and leave it there. `npm run eval:compare` looks for
that filename.

## The scale

| Score | Meaning |
|---|---|
| 0 | unacceptable |
| 1 | major problems |
| 2 | mixed |
| 3 | good |
| 4 | excellent |

Two non-scores are always available and are never coerced into numbers:

- `not_applicable` — the dimension genuinely does not apply to this case.
- `cannot_determine` — the output does not contain enough for you to judge.

**Do not split the difference with a 2.** A 2 means you judged the output and
found it mixed. `cannot_determine` means you did not judge it. Those are
different facts, and the aggregation keeps them apart: neither non-score
contributes to any mean, and both are counted separately.

Use `reviewer_notes` wherever a score would otherwise be unexplainable to
someone else, and `overall_notes` for anything that spans dimensions.

## The eight dimensions

Full anchors for every point are in
`evals/datasets/decision-benchmark-v1/rubric.json` and in the template itself.
Summarised:

| Dimension | What you are judging | Partial automation |
|---|---|---|
| `evidence_grounding` | Can each claim about a candidate be traced to something actually in that candidate's description? | none |
| `scenario_relevance` | Does the explanation engage with *this* role and *this* scenario, or would it read identically for any? | `scenario-coverage` (structural only) |
| `tradeoff_clarity` | Is what is genuinely given up stated concretely enough to act on? | none |
| `clarity` | Could a non-specialist read it once and correctly state who was recommended, why, and with what reservations? | none |
| `uncertainty_handling` | Are real evidence gaps acknowledged, and is manufactured confidence avoided? | `uncertainty-acknowledgement` (flagging only) |
| `recommendation_consistency` | Does every section support the same candidate the structured result selected? | `unsupported-claims` (name-based subset) |
| `pairing_usefulness` | Does the pair explanation say something about the *combination*, not two summaries side by side? | `pairing-integrity` (structural only) |
| `unsupported_claim_avoidance` | Are claims scoped to what was actually computed? | `unsupported-claims` (phrase-level subset) |

Where a deterministic grader is named, it covers a **conservative subset** of
that dimension and never replaces your judgment. `unsupported-claims`, for
example, catches a short list of specific phrases and a name-based
contradiction; it cannot tell you whether an argument is sound.

## How to review

1. **Read the inputs first.** Open the case file in
   `evals/datasets/decision-benchmark-v1/cases/`. Know what evidence actually
   existed before you read what the system said about it. Grounding is
   impossible to judge in the other order.
2. **Read the structured result before the prose.** Note the winner, the
   ranking, and the pairing result. Then read the explanation and judge it
   against what you already know the system computed.
3. **Score each dimension independently.** Resist letting a well-written
   explanation lift `evidence_grounding`, or a thin case depress `clarity`.
   These are separate questions, which is precisely why there are eight.
4. **Prefer a non-score over a guess.** An honest `cannot_determine` is more
   useful than an invented 2.
5. **Write the note while you still remember why.** A bare 1 six weeks later is
   not actionable.

## Cases that need extra care

- **`case-002` (close call).** Any of the three winning is acceptable. What you
  are judging is whether the output acknowledges how close it is. A confident
  single recommendation with no hedging should score low on
  `uncertainty_handling` even though the winner is allowed.
- **`case-008` / `case-009` (thin and conflicting evidence).** The benchmark
  makes no winner claim at all here. An output that manufactures specificity
  the inputs never contained should score low on `evidence_grounding`
  regardless of how confident or fluent it reads.
- **`case-010` (missing evidence).** The leading candidate has nothing on the
  criteria that matter most. The right behaviour is to name the gap, not fill
  it.
- **`case-015` (duplicate display names).** Two candidates are both called
  "Alex Moreau" with distinct IDs. Check the pair explanation refers to the
  right one. The automated contradiction check deliberately skips this case,
  because a name-based check genuinely cannot distinguish them — so here you
  are the only check.
- **`case-016` (pairing).** The two strongest individuals are the *worst*
  combination. A pair explanation that just praises the top two has missed the
  point.

## Aggregation

`aggregateHumanReview()` produces per-dimension statistics — scored count,
`not_applicable` count, `cannot_determine` count, mean, min, max — and these
are **always retained**.

It also produces a single `aggregate_mean` for convenience, with two
protections:

- it is `null` unless at least five dimensions were actually scored, because
  below that a single number is noise;
- it always carries a caveat stating it must never be reported without the
  per-dimension scores it came from.

Collapsing eight dimensions into one opaque number hides which dimension was
weak, which is the only actionable part of the review.

## Comparing reviews across runs

`npm run eval:compare` compares rubric dimensions **only when both runs carry a
completed review with at least one real score**. Two blank templates are never
reported as agreement, and a rubric change never alters the improved/regressed
verdict — that is reserved for deterministic invariants.

Two reviews by one reviewer are two data points, not a trend. No
inter-rater reliability work has been done in this project, and none should be
implied from these numbers.
