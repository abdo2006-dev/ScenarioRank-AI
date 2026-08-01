# ScenarioRank evaluation harness

Local-first, offline-capable evaluation for the ScenarioRank decision pipeline.
Added in **Phase 3A**, which built the measurement infrastructure and changed
no prompt, model, schema, scoring formula, ranking rule, or pairing behaviour.

## Quick start

```bash
npm run eval:validate
```

```bash
npm run eval:fixtures
```

Both are offline. Neither reads an API key or makes a network request.

## What lives here

| Path | Purpose |
|---|---|
| `datasets/` | `decision-benchmark-v1` (manifest, rubric, 16 synthetic cases) and the strict loader |
| `schemas/` | benchmark case, manifest/rubric, run artifacts, and report schemas |
| `fixtures/` | seven offline fake-provider profiles |
| `graders/` | 11 deterministic graders, the human-review template, and review aggregation |
| `runners/` | case and benchmark execution, comparison, variants, live gating |
| `reporters/` | JSON run artifacts and markdown summaries |
| `cli/` | `validate`, `fixtures`, `live`, `compare` |

## Rules this harness follows

- **Production never imports it.** `evals/` imports the pipeline, the shared
  contracts, and the deterministic scoring functions. Nothing under `server/`,
  `src/`, `shared/`, or `scripts/` imports `evals/`, and a test enforces it.
- **No competing schema copies.** Decision output validates through the real
  public contract. Evaluation schemas wrap it; they never restate it.
- **Fixture mode is offline and free.** No network, no API key, no cost.
- **Live mode is gated.** `--live`, an API key, an explicit budget, and a
  deliberate case selection are all required; CI is refused by default.
- **Artifacts are git-ignored** and scanned for secrets and absolute paths
  before they are written.
- **Nothing overclaims.** Every artifact carries the scope disclaimer.

## Documentation

- [`docs/evaluation/EVALUATION_ARCHITECTURE.md`](../docs/evaluation/EVALUATION_ARCHITECTURE.md)
  — design, boundaries, graders, what a run does and does not prove
- [`docs/evaluation/BENCHMARK_V1.md`](../docs/evaluation/BENCHMARK_V1.md)
  — cases, versioning policy, current baseline, known limitations
- [`docs/evaluation/HUMAN_REVIEW_GUIDE.md`](../docs/evaluation/HUMAN_REVIEW_GUIDE.md)
  — the 0-4 anchored rubric and how to score it
- [`docs/evaluation/RUNBOOK.md`](../docs/evaluation/RUNBOOK.md)
  — commands, safeguards, artifacts, troubleshooting
- [`docs/decisions/ADR-0009-local-first-evaluation-harness.md`](../docs/decisions/ADR-0009-local-first-evaluation-harness.md)
  — why local-first, and the benchmark-versioning policy

## Scope

`decision-benchmark-v1` is a **development benchmark**. It is not
scientifically validated, not representative of real hiring decisions, not
evidence of fairness or demographic neutrality, not a legal-compliance test,
not a calibrated-confidence benchmark, and not a production service-level
objective. Every candidate, company, and record in it is invented.

A passing fixture run means the orchestration, deterministic computation, and
graders behave as specified. It says nothing about prompt quality.
