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
- Candidate-scoring concurrency is configurable via `AI_CANDIDATE_CONCURRENCY`
  (default 1, integer 1-4, validated with a safe-default fallback), resolved
  once by `server.mjs` and passed down explicitly — `server/pipeline` and
  `server/http` never read `process.env` themselves. All other LLM calls in
  a run (role analysis, scenario analysis, decision explanation, and each
  pairing evaluation) already execute strictly one at a time regardless of
  this setting; it only controls how many candidates are scored at once.
- 175 backend tests and 15 frontend tests now run (was 0 backend, 1
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

### Phase 1 post-review corrections — completed, same PR #2, not yet merged

A review of the completed Phase 1B/1C/1D work (draft PR #2) found remaining
behavior and terminology that still contradicted V2's honesty and
technical-defensibility goals. All corrected on the same branch,
`v2/phase-1-completion`, updating the same draft PR — **no new branch, no
merge**:

1. **Candidate-scoring concurrency is now configurable.** `AI_CANDIDATE_CONCURRENCY`
   (default 1, validated integer 1-4, safe-default fallback with a startup
   warning on invalid input) replaces the previous hardcoded `2`. Resolved
   once in `server.mjs`, threaded explicitly through `server/http/app.js` →
   `server/http/routes.js` → `server/pipeline/runPipeline.js`; the pipeline
   never reads `process.env` itself. Recorded in `run_metadata.candidateConcurrency`
   for reproducibility. 7 new tests in `server/config/env.test.js`
   (default, override, boundaries, invalid inputs) and 5 in
   `server/pipeline/runPipeline.test.js` (default=1 behavior, explicit 1,
   explicit higher value actually observed via a concurrency-tracking fake
   provider, metadata recording, no second provider construction).
2. **Fabricated pairing fallback removed.** When every pair evaluation in a
   run fails, `pairing_result` is now
   `{"status":"unavailable","reason":"All pair evaluations failed.","best_pair":null,"top_pairs":[]}`
   instead of an invented "Default pair" with made-up scores (`pair_score:
   7.0`, `scenario_coverage: 0.75`, etc.). The frontend's pairing tab shows
   a plain "Pairing Unavailable" message in that case instead of a fake
   recommendation. 4 new backend tests cover full success, partial pair
   failure (some pairs succeed, others fail), all-pairs-failed, and a
   direct assertion that none of the old fabricated values appear anywhere
   in the response; 3 new frontend tests cover the "ok" rendering state,
   the "unavailable" rendering state, and the pairing tab being absent
   entirely when `pairing_result` isn't present.
3. **Unsupported best/worst-scenario claims removed.** `adaptability_profiles[].best_scenario`
   and `.worst_scenario` previously reported the current scenario as "best"
   and the fixed phrase "Rapid crisis/pivot scenario" as "worst" — implying
   the system had observed cross-scenario performance it never measured.
   Both fields are now always the literal string `"not_measured"`, and
   `resilience_note` states plainly that the adaptability score is a
   heuristic from this run's criteria only and that cross-scenario
   resilience has not been measured. A full-response regression test scans
   the serialized pipeline output for the retired phrases ("Rapid
   crisis/pivot scenario", "may struggle under rapid pivots", "best
   scenario", "worst scenario") and for the frontend equivalent.
4. **Bias-naming fields renamed cleanly, no alias.** `bias_confidence_reviews`/`bias_flags`
   → `confidence_evidence_reviews`/`confidence_evidence_flags`, in the
   backend response, the active frontend (`src/pages/Index.tsx`), and all
   tests. No compatibility alias was kept — this is still a pre-production
   portfolio project, so a clean contract was preferred over preserving
   inaccurate naming. (`src/types/pipeline.ts` and `src/components/v3/*`
   still use the old names — confirmed dead code, unreachable from the app
   entrypoint per P1.2/P1.3, deliberately left for Phase 2 cleanup rather
   than touched here.)
5. **Pipeline-stage terminology, not agent terminology.** `agent_outputs` →
   `pipeline_stage_outputs`, each entry's `agent_name`/`agent_role` →
   `stage_name`/`stage_role`, and every stage's display name from "X Agent"
   to "X ... Stage" (Role Analysis Stage, Scenario Analysis Stage,
   Candidate Scoring Stage, Confidence & Evidence Review, Outcome Modeling
   Stage, Decision Explanation Stage, Pairing Analysis Stage) — in the
   backend, the active frontend's types and rendering, the frontend tab
   (`agents` → `pipeline`), and the live-progress heading (`src/pages/Index.tsx`,
   "Agent Pipeline" → "Decision Pipeline"). ScenarioRank is a fixed
   orchestrated pipeline, not a multi-agent architecture — no stage
   independently plans, selects tools, delegates, or controls its own
   routing (see P1.6). Backend schema doc-comments referencing "X Agent
   output" were corrected to match.
6. **Stale provider-adapter comments fixed.** `server/ai/providers/groqProvider.js`
   and `geminiProvider.js` no longer claim to be "not wired into the active
   pipeline" (true only in Phase 1A; false since Phase 1B). A repo-wide
   search found no other stale "not wired" / "Anthropic active" / "Phase 1A
   only" statements in tracked source or documentation.
7. This document, `docs/architecture/KNOWN_LIMITATIONS.md`,
   `docs/architecture/SCORING_AND_ASSUMPTIONS.md`, and `docs/V2_ROADMAP.md`
   were updated to record all of the above and the real-provider retest
   result below.

Test totals after this round: **175 backend tests** (was 159 at the end of
Phase 1D: +7 concurrency tests in `server/config/env.test.js`, +5
concurrency-behavior tests and +4 pairing-fabrication/cross-scenario-regression
tests in `server/pipeline/runPipeline.test.js`) and **15 frontend tests**
(was 11: +4 covering both pairing-result states and the cross-scenario-phrase
regression). One pre-existing pairing-failure test in
`runPipeline.test.js` was also updated in place (same test, corrected
assertions) to match the new honest-unavailable behavior instead of the
old fabricated-fallback behavior it previously asserted.

#### Real-provider retest (honest result)

Per explicit instruction, a real synthetic end-to-end request (3
candidates, pairing enabled, no mocks) was run against the live Groq API
with `AI_CANDIDATE_CONCURRENCY=1`, and — because Groq did not complete —
against Gemini as a comparison. **Neither provider completed the full
pipeline in this test session:**

- **Groq (`openai/gpt-oss-120b`), concurrency 1**: Role Analysis (the
  *first* sequential LLM call) succeeded in ~2.6s. Scenario Analysis (the
  very next sequential call, no concurrency involved) failed both
  attempts with HTTP 429 ("Groq rate-limited the request"), confirmed
  across four separate runs several seconds to a minute apart. This is a
  *stronger* finding than the one that motivated the default of 1: the
  account's rate limit is tight enough to reject the second sequential
  call, not just simultaneous ones. **Groq cannot currently be claimed a
  reliably working default for a full evaluation run** on this account
  tier, independent of the concurrency setting.
- **Gemini (`gemini-3.6-flash`), concurrency 1, as a comparison**: also
  failed to complete (twice, at different stages — once at
  `candidate-scoring`, once at `scenario-analysis`), both times with
  "response ... was not valid JSON" after the one controlled retry. A
  targeted diagnostic (calling the adapter's exact prompt/schema for
  `scenario-analysis` directly) showed the *real* cause: the response was
  truncated mid-string, valid JSON syntax cut off partway through a field
  value — the model's configured `maxOutputTokens` (1500 for scenario
  analysis) is being spent partly on internal reasoning tokens before the
  JSON body completes, so the response is cut off before it's
  syntactically valid.

**Recommendation**: do not switch the default to Gemini right now — it did
not demonstrate a complete run either, and its failure mode (output
truncation from an under-sized token budget for a reasoning-capable model)
is a distinct, likely-fixable issue (raising `maxOutputTokens` for the
affected stages, or disabling/budgeting Gemini's internal reasoning
tokens) rather than a proven-reliable alternative today. Groq remains the
architecturally-preferred default (see ADR-0002), but its live reliability
on the free/on-demand tier is now a documented, open limitation rather
than an assumption — a paid tier or a higher rate limit should be verified
before presenting either provider as a dependable live demo. This is
recorded as a new, explicit gap below rather than silently left implied by
passing mocked tests.

**Full Phase 1 verification status** (branch `v2/phase-1-completion`,
draft PR #2 targeting `main`, not merged):

| Check | Result |
|---|---|
| `npm ci` | passes, 9 vulnerabilities (unchanged) |
| `npm run lint` | 0 problems (was 3 errors, 7 warnings) |
| `npm run lint:server` | 0 problems |
| `npm test` (frontend + backend) | 190 tests passing (15 frontend + 175 backend) |
| `npm run build` | passes |
| `node --check server.mjs` | passes |
| `npm audit` | 9 vulnerabilities (0 critical, 0 low, 3 moderate, 6 high) — unchanged, no new dependencies added |
| `.env.local` untracked/ignored | confirmed (`.gitignore` matches `.env.*`; only `.env.example` is tracked) |
| Secret scan (tracked files) | no API-key-shaped strings found |
| Real Groq end-to-end smoke test (concurrency 1) | **did not complete** — see above |
| Real Gemini end-to-end smoke test (comparison) | **did not complete** — see above |

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
probability UI wording, hardcoded frontend backend URL. Fixed in the
Phase 1 post-review corrections above: the pairing stage's fabricated
outer fallback, the unsupported best/worst-scenario claims, the
`bias_confidence_reviews`/`bias_flags` field names, and the "agent"
terminology throughout the active pipeline. Still open:

1. **New, from the real-provider retest above**: neither Groq (rate
   limiting, even at concurrency 1) nor Gemini (response truncation from
   an under-sized `maxOutputTokens` for a reasoning-capable model)
   demonstrably completed a full live pipeline run in this session. The
   mocked test suite (175 backend + 15 frontend tests) still passes and
   proves the pipeline's own logic is correct, but a real end-to-end demo
   currently needs either a higher-tier API key or a fix to Gemini's
   token budgeting before it can be presented as reliably working live.
2. Candidate scoring depends on very limited evidence (short free-text
   descriptions).
3. The active frontend page remains one large file (backend module
   boundaries were split in Phase 1D; the frontend split is Phase 2).
4. Duplicated contracts: pipeline types exist both inline in the frontend
   page and in `src/types/pipeline.ts` (the latter, plus
   `src/components/v3/*`, are confirmed dead code still using the
   retired "bias"/"agent" naming — Phase 2 cleanup).
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
- **New in the Phase 1 post-review corrections:** a tuning knob (like
  candidate-scoring concurrency) may fall back to a safe default with a
  warning on invalid input; a correctness-critical setting (like provider
  configuration) must still fail startup in production rather than fall
  back silently — these are deliberately different failure policies, not
  an inconsistency.
- **New in the Phase 1 post-review corrections:** when every attempt at an
  optional sub-result fails (e.g. every pairing evaluation), the correct
  behavior is an honest "unavailable" status, never a fabricated
  placeholder value — this applies to any future optional stage, not just
  pairing.
- **New in the Phase 1 post-review corrections:** field and stage names
  must describe what the code actually does (`confidence_evidence_*`, not
  `bias_*`; pipeline stages, not agents) with no compatibility alias kept
  for a pre-production project — accuracy takes priority over naming
  stability at this stage.
- **New in the Phase 1 post-review corrections:** a real end-to-end
  provider smoke test can fail for reasons unrelated to application code
  (account-tier rate limits, a reasoning model's token-budget behavior);
  when that happens, the honest response is to document the failure and
  its cause, not to claim success based on mocked tests alone.

## Next planned milestone

**Immediate next step: get explicit approval on the corrected draft PR
#2.** Phase 1 (including this post-review correction round) is complete
and awaiting the owner's explicit review and merge approval — the owner
has stated not to merge until they explicitly approve. No further Phase 1
work is planned unless another review round requests changes.

**After PR #2 is merged: Phase 2 — architecture and maintainability. Not
started.**

Per `docs/V2_ROADMAP.md`, planned to:

- split the frontend into feature components, an API client, schemas, and
  hooks (the backend side of this was done in Phase 1D);
- establish one source of truth for contracts (currently duplicated
  between the frontend page and `src/types/pipeline.ts`, the latter
  confirmed dead code);
- remove confirmed dead code and backup files (including
  `src/types/pipeline.ts`, `src/components/v3/*`, and
  `src/components/AgentFlowSection.tsx`, which still use the retired
  "bias"/"agent" naming);
- decide, via ADR, whether to retain Node/Express or migrate the backend
  to Python/FastAPI;
- separately: investigate and fix the Gemini `maxOutputTokens` truncation
  found during this round's real-provider retest, and/or verify a
  higher-tier Groq key, so a real end-to-end demo can be shown reliably
  live rather than only via the mocked test suite.

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
  of Phase 1 in one cycle. Reviewed through a draft PR (**PR #2**)
  targeting `main`.
- A review of that draft PR requested 7 specific corrections (concurrency
  configurability, pairing fabrication, cross-scenario claims, bias
  naming, agent terminology, stale comments, this documentation pass),
  all completed **on the same branch, updating the same draft PR #2** —
  no new branch was created, per explicit instruction.
- **PR #2 is still a draft, still not merged, awaiting explicit owner
  approval of this corrected version before merge.**
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
