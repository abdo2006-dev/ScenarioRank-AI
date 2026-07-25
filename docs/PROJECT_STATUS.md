# ScenarioRank V2 — Project Status

**Read this document first.** It is the durable source of truth for what
ScenarioRank V2 is, what has actually been done, what was decided (and
why), and what happens next. It is written so that a new AI coding session
or a new human contributor can reconstruct the project's intended scope
and current state without re-reading every commit. It intentionally does
not duplicate the detailed architecture documents — it summarizes and
links to them.

## Project objective

ScenarioRank AI V2 is a post-award engineering refinement of the BMW
competition project. The long-term objective is to transform the original
AI-assisted prototype into a system that is technically defensible,
testable, secure, explainable, and documented — one the owner genuinely
understands and can confidently present to recruiters, engineers,
professors, and interviewers.

The objective is **not** to add newer technology for its own sake. Every
change should improve at least one of:

- correctness
- explainability
- testability
- maintainability
- security
- reliability
- architectural clarity
- educational value

If a proposed change doesn't clearly improve one of these, it doesn't
belong in V2 yet, regardless of how technically interesting it is.

## Preserved original version

The original BMW award-winning implementation is preserved exactly, and
permanently, as:

- tag `bmw-award-original`
- branch `archive/bmw-award-original`

`main` is the public ScenarioRank V2 development line — the version
recruiters and visitors see by default. The archive is never modified;
fixes and improvements belong on `main`, not the archive. See
[`decisions/ADR-0001-main-is-v2.md`](decisions/ADR-0001-main-is-v2.md).

## Non-negotiable architectural principle

This boundary is the single most important design decision in the
project and must survive every future phase:

- LLMs interpret qualitative evidence.
- Deterministic code calculates scores, risks, rankings, and pair results.
- LLMs may explain deterministic results.
- LLM output must never silently override a deterministic ranking.
- All LLM-generated structured data must be validated before it enters
  deterministic calculations.

Any change that blurs this boundary (for example, letting a model's
narrative text influence which candidate is ranked first) is a regression,
not an improvement, regardless of what else it accomplishes. This is now
enforced structurally, not just by convention: `runPipeline()` always
computes the ranking before calling the provider for an explanation, and a
boundary test in `server/pipeline/runPipeline.test.js` proves the winner
cannot change based on explanation wording.

## Current architecture

- React + Vite frontend, Express/Node backend, no persistence layer.
- **The live pipeline calls a configurable AI provider — Groq by default,
  Gemini as an optional alternative — through a provider-neutral contract.
  The Anthropic-specific integration has been fully removed** (no runtime
  code, dependency, or environment variable for it remains; it survives
  only in git history and the preserved `archive/bmw-award-original`
  branch).
- One provider instance is resolved once at process startup
  (`server.mjs`) and reused for the process's entire lifetime — every
  request and every pipeline stage uses the same provider/model. No code
  path constructs a second provider or falls back silently to the other
  one.
- Every one of the six LLM operations (role analysis, scenario analysis,
  candidate scoring, decision explanation, pairing analysis, scenario
  generation) is schema-validated (`server/ai/schemas/`) before its output
  reaches deterministic code.
- Deterministic scoring lives in
  [`server/domain/scoring.js`](../server/domain/scoring.js). One formula
  changed intentionally (adaptability — see "Decisions already made"
  below); everything else is unchanged from the original implementation.
- The backend is split into clear module boundaries:
  `server/config` (env loading), `server/ai` (provider contract, adapters,
  schemas, prompts), `server/domain` (pure formulas), `server/pipeline`
  (orchestration), `server/http` (Express transport). `server.mjs` is a
  thin composition root.
- 159 backend tests and 11 frontend tests now run (was 0 backend, 1
  frontend placeholder before Phase 1A).

Details: [`architecture/CURRENT_ARCHITECTURE.md`](architecture/CURRENT_ARCHITECTURE.md),
[`architecture/TECHNOLOGY_INVENTORY.md`](architecture/TECHNOLOGY_INVENTORY.md),
[`decisions/ADR-0002-provider-abstraction.md`](decisions/ADR-0002-provider-abstraction.md),
[`decisions/ADR-0003-runtime-provider-configuration.md`](decisions/ADR-0003-runtime-provider-configuration.md).

## Completed milestones

### Phase 0 — completed

- Original competition version preserved (`bmw-award-original` tag +
  `archive/bmw-award-original` branch).
- `main` established as the public V2 line.
- Architecture, repository map, formulas, limitations, branch strategy,
  and roadmap documented.

### Phase 1A — completed, merged to `main` (PR #1, squash commit `f6d3058`)

- Deterministic scoring extracted with no intended behavior change.
- Backend Node Vitest configuration added.
- Provider-neutral AI contract, error taxonomy, single retry owner, and
  Zod-to-JSON-Schema conversion introduced.
- Groq and Gemini adapters added, with a shared provider-contract test
  suite (dependency-injected fake SDK clients, no real network calls).
- Focused backend JavaScript linting added (`npm run lint:server`).
- Gemini unpaid-tier data-use limitation and JSON Schema portability
  limitations documented.
- The active pipeline still called Anthropic directly at the end of this
  subphase.

### Phase 1B — completed (structured-outputs cutover)

- Production Zod schemas authored for all 6 LLM operations
  (`server/ai/schemas/`), each with conversion, Groq-strict-mode
  structural, and real-adapter round-trip tests (48 tests).
- Prompts extracted into pure builder functions (`server/ai/prompts/`),
  each with a stable `promptId`/`promptVersion`; every prompt's inline
  JSON template was dropped (now the schema's job) while its substantive
  analytical instructions were preserved — documented per-file as a
  semantic change required for structured output.
- All 6 `callClaudeJSON()` call sites migrated to
  `provider.generateStructured()`.
- One provider instance resolved once at process startup, reused for the
  process's lifetime (`server.mjs` -> `server/http/app.js` ->
  `server/pipeline/runPipeline.js`).
- The Anthropic-specific request path, manual JSON repair
  (`sanitizeJSON`/`extractFirstJSON`), and `ANTHROPIC_API_KEY` were removed
  entirely after the migration was verified end-to-end.
- `run_metadata` (provider, model, prompt/schema versions, per-stage
  attempt counts, timestamps) added to every pipeline response.
- `.env`/`.env.local` precedence loader added (`server/config/env.js`),
  with dev-tolerant / production-strict startup validation
  (`docs/decisions/ADR-0003-runtime-provider-configuration.md`).

### Phase 1C — completed (correctness and honesty fixes)

- **Pairing top-four fix**: pairing now receives the top four candidates
  from the run's actual deterministic ranking, not the first four
  submitted. Regression test in `server/pipeline/runPipeline.test.js`.
- **Cross-scenario consistency**: the hardcoded `75` was removed, not
  replaced by another constant. `computeAdaptabilityScore()` now uses only
  the three real model-derived criteria (renormalized to sum to 1.0), and
  the concept is honestly exposed as `"not_measured"` in the API and UI.
- **"Bias & Confidence Review" renamed** to "Confidence & Evidence
  Review" everywhere (backend stage label, SSE, frontend, `agent_outputs`,
  docs, tests) — the stage was never a bias-detection method and no
  longer claims to be one.
- **Confidence language**: UI labels read "Model conf." with a tooltip
  clarifying it is not a calibrated probability.
- **Backend URL**: frontend now reads `VITE_BACKEND_URL`
  (`src/lib/backendUrl.ts`), with the old hardcoded value kept only as a
  dev fallback.

### Phase 1D — completed (tests, lint, audit, modularization, docs)

- 159 backend tests (schemas, providers, scoring, full mocked pipeline
  with P0.1/P0.2 regression coverage, SSE route ordering/error/no-hang)
  and 11 frontend tests (real rendering behavior, not just a placeholder).
- General frontend lint baseline resolved: **0 problems**, was 3 errors +
  7 warnings. Real fixes (split `cva`/hook exports into sibling files,
  removed empty interfaces, converted a `require()` to an ESM import) —
  nothing suppressed.
- `npm audit`: 22 -> 9 vulnerabilities via safe in-range fixes only (no
  `--force`, no major-version bumps). Remaining 9 all require a major
  bump (eslint 9->10, vite 5->8, or react-router-dom 6->7) to fix — see
  the classification table below.
- Backend modularized into `server/{config,ai,domain,pipeline,http}`.
- This documentation pass (README, PROJECT_STATUS, V2_ROADMAP,
  CURRENT_ARCHITECTURE, KNOWN_LIMITATIONS, SCORING_AND_ASSUMPTIONS,
  TECHNOLOGY_INVENTORY, LEARNING_CHECKPOINTS, ADR-0002, new ADR-0003).

**Full Phase 1 verification status** (branch `v2/phase-1-completion`,
draft PR targeting `main`, not merged):

| Check | Result |
|---|---|
| `npm run lint` | 0 problems (was 3 errors, 7 warnings) |
| `npm run lint:server` | 0 problems |
| `npm test` (frontend + backend) | 170 tests passing (11 frontend + 159 backend) |
| `npm run build` | passes |
| `node --check server.mjs` | passes |
| `npm audit` | 9 vulnerabilities (0 critical, 0 low, 3 moderate, 6 high) — down from 22 |

### `npm audit` remaining-findings classification (Phase 1D)

All 9 remaining findings require a major-version bump to fix and were
deliberately not force-applied:

| Dependency | Direct/transitive | Prod/dev exposure | Severity | Exploitable in this project? | Recommended later action |
|---|---|---|---|---|---|
| `eslint` + its transitive chain (`@eslint/config-array`, `@eslint/eslintrc`, `brace-expansion`, `minimatch`) | `eslint` direct, rest transitive | dev-only (lint tooling, never shipped) | high | No — not reachable at runtime or in the built app | Deliberate eslint 9->10 upgrade later, with its own review of any rule/config changes |
| `vite`, `esbuild` | `vite` direct, `esbuild` transitive | dev-only (build tool + dev server; CVEs are about the dev server serving arbitrary files / accepting cross-origin requests) | high / moderate | Low — only matters if `npm run dev` is exposed on an untrusted network, which it isn't here | Deliberate vite 5->8 upgrade later, with a full frontend build/test pass since it's a major bump |
| `react-router`, `react-router-dom` | `react-router-dom` direct, `react-router` transitive | **production** — ships in the actual browser bundle | moderate | Low in this app's current usage — the CVEs involve untrusted dynamic `Link`/`useNavigate` targets or SSR; this app has one static route (`/`) plus a catch-all, no SSR, and no user-controlled route targets | Track for a deliberate react-router-dom 6->7 migration with real testing — this is the one production-facing item on this list and shouldn't be deferred indefinitely |

## Current known correctness issues

Fixed in Phase 1C: pairing top-four selection, fabricated
`cross_scenario_consistency`, "Bias Agent" naming, confidence-as-
probability UI wording, hardcoded frontend backend URL. Still open:

1. The pairing stage's outer fallback still returns a generic default pair
   when every pair call in a run fails, so a result can look complete
   even when pairing didn't actually succeed (narrowed in Phase 1B — the
   per-metric `?? default` fallbacks are gone, only the outer one
   remains).
2. Candidate scoring depends on very limited evidence (short free-text
   descriptions).
3. The active frontend page remains one large file (backend module
   boundaries were split in Phase 1D; the frontend split is Phase 2).
4. Duplicated contracts: pipeline types exist both inline in the frontend
   page and in `src/types/pipeline.ts`.
5. Backup files, an older dataset, and unused component families are
   still present (Phase 2 cleanup).
6. No model evaluation dataset, golden examples, or prompt-regression
   checks yet (Phase 3).
7. Opportunity-cost risk is still misnamed (averages risks rather than
   comparing forgone benefits) — deliberately deferred, needs design work.
8. Formula coefficients remain unvalidated heuristics (the P0.2 fix
   changed which inputs feed adaptability, not the general validation gap).
9. Authentication, rate limiting, persistence, real privacy controls, and
   production deployment are all later-phase work (Phase 5).
10. `react-router-dom` is on a version with known moderate-severity CVEs;
    fixing it needs a deliberate major-version migration (see the audit
    table above).

Full detail: [`architecture/KNOWN_LIMITATIONS.md`](architecture/KNOWN_LIMITATIONS.md).

## Decisions already made

- `main` represents ScenarioRank V2.
- Temporary implementation branches are merged and deleted; they are not
  permanent project branches.
- Groq and Gemini are supported through provider adapters; **Groq is the
  live default runtime provider** (no longer just "intended").
- Gemini unpaid usage is limited to synthetic or explicitly non-sensitive
  data.
- Google ADK is not currently justified because ScenarioRank follows a
  controlled sequential pipeline rather than autonomous agent planning.
- Zod is the canonical local validation layer, and is now actually used by
  every production LLM call, not just installed.
- Provider-side structured-output guarantees are never trusted without
  local validation.
- A single evaluation run must use one provider and one model
  consistently — enforced by resolving exactly one provider instance for
  the process's entire lifetime, not just "per run."
- No silent per-candidate or mid-run provider switching, and no silent
  fallback from one provider to the other on failure.
- The backend remains JavaScript/Node during Phase 1; Python/FastAPI
  remains a later architectural decision rather than an assumed migration.
- **New in Phase 1C:** the fabricated `cross_scenario_consistency` input
  was removed rather than replaced by an invented formula — the
  deterministic adaptability formula now only reflects real signals, and
  the gap is reported honestly (`"not_measured"`) rather than hidden.
- **New in Phase 1D:** `npm audit fix` (no `--force`) is the standing
  policy for dependency vulnerabilities — apply what's safely in-range,
  document and defer what needs a major bump.

## Next planned milestone

**Phase 2 — architecture and maintainability. Not started.**

Per `docs/V2_ROADMAP.md`, planned to:

- split the frontend into feature components, an API client, schemas, and
  hooks (the backend side of this was done in Phase 1D);
- establish one source of truth for contracts (currently duplicated
  between the frontend page and `src/types/pipeline.ts`);
- remove confirmed dead code and backup files;
- decide, via ADR, whether to retain Node/Express or migrate the backend
  to Python/FastAPI.

## Later roadmap

Not immutable — expect this sequence to be refined as each phase completes:

- Phase 2: deeper backend/frontend modularization, dead-code removal, one
  contract source of truth.
- Phase 3: real multi-scenario robustness (genuine
  `cross_scenario_consistency` measurement belongs here) and AI
  evaluation infrastructure.
- Later phases: evidence-backed retrieval, security/privacy, deployment,
  observability, and interview-ready documentation.

Full detail: [`V2_ROADMAP.md`](V2_ROADMAP.md).

## Branch and pull-request status

- Phase 1A was implemented in `v2/phase-1a-provider-abstraction`, merged
  via PR #1 (squash commit `f6d3058`), branch deleted after merge.
- Phase 1B, 1C, and 1D were implemented together in one branch,
  `v2/phase-1-completion`, per explicit instruction to complete the rest
  of Phase 1 in one cycle. Reviewed through a draft PR targeting `main`,
  not yet merged.
- Temporary branches are merged and deleted; they are not permanent
  project branches.
- New implementation branches should only be created when work begins.
- Prefer one active implementation branch at a time.

## Learning checkpoints

Concepts the owner should understand now that Phase 1 is complete:

- What an adapter is, concretely, and what would change (and what
  wouldn't) if a third provider were added.
- Why the pipeline depends on an interface rather than Groq directly.
- Why Zod validation is still required even when a provider guarantees
  structured output.
- Where retries occur, and why there is exactly one retry owner.
- Why one provider instance is resolved once at process startup — not
  once per request — and why that's a stronger guarantee than "one per
  run."
- Why Google ADK is not currently being used.
- Why `.env.local` must remain backend-only and untracked, and the exact
  precedence between it, `.env`, and a real shell-exported variable.
- Why the cross-scenario-consistency fix removed an input instead of
  computing a "better" replacement number.
- Why the pairing fix and the provider migration were sequenced as
  separate, reviewable changes rather than combined.

Full detail: [`LEARNING_CHECKPOINTS.md`](LEARNING_CHECKPOINTS.md).

## Update protocol

**Every future serious implementation phase must update this document
before merge**, recording:

- what was completed;
- what changed architecturally;
- decisions made;
- limitations introduced or resolved;
- tests and verification status;
- current branch/PR;
- the exact next step;
- what remains explicitly out of scope.

This is what lets a future ChatGPT, Claude, Codex, DeepSeek, Qwen, or human
contributor reconstruct the project's intended scope and current state
directly from the repository, without depending on chat history from a
prior session.
