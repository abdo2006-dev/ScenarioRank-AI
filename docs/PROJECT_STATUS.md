# ScenarioRank V2 — Project Status

**Read this document first.** It is the durable source of truth for what
ScenarioRank V2 is, what has actually been done, what was decided (and
why), and what happens next. It is written so that a new AI coding session
or a new human contributor can reconstruct the project's intended scope
and current state without re-reading every commit. It intentionally does
not duplicate the detailed architecture documents — it summarizes and
links to them.

## Current status (read this first)

**Phase 1 is complete and merged.** PR #2 was approved by the owner and
squash-merged into `main` as commit `8f19bb7` ("feat: complete
ScenarioRank V2 Phase 1"). The temporary implementation branch
`v2/phase-1-completion` has been deleted, both locally and on the remote
— `main` is now the sole active public V2 line, with no outstanding Phase
1 branch or PR. The preserved award snapshot (`archive/bmw-award-original`
branch and `bmw-award-original` tag) is untouched.

The active AI provider is OpenAI (`gpt-5-mini`), reached only through the
provider-neutral contract (`server/ai/types.js`) — never a vendor SDK
directly from the pipeline. A normal evaluation uses 3 logical
model-backed pipeline stages without pairing, or 4 with pairing enabled;
real OpenAI attempts (including retries and batch-integrity corrective
calls) are tracked separately via `run_metadata.providerAttemptCount`,
never conflated with the fixed logical-stage count. A successful pairing
result requires complete coverage of every expected top-four pair — a
subset is never reported as successful. A real, synthetic, end-to-end
OpenAI smoke test completed successfully (reached `complete`, 6,438
total tokens, ~$0.01 estimated cost) — see "Real OpenAI smoke test"
below. Current status: 175 tests passing (159 backend + 16 frontend), 0
lint problems, clean build, 9 known `npm audit` findings (all requiring a
deliberate major-version bump, none force-applied).

**Phase 2 has not started — no Phase 2 code exists.** The exact next
milestone is Phase 2 planning and understanding (architecture and
maintainability: frontend feature-folder split, one contract source of
truth, dead-code removal, a Node-vs-Python ADR) before any
implementation begins. See "Next planned milestone" below.

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
- **The live pipeline calls exactly one AI provider — OpenAI (`gpt-5-mini`)
  — through a provider-neutral contract.** Groq and Gemini were real,
  tested integrations from an earlier phase, removed after a live
  end-to-end test showed neither could reliably complete a full pipeline
  run on its free tier; the Anthropic-specific integration from an even
  earlier phase was fully removed before that. None of the three survive
  as runtime code, a dependency, or an environment variable — only in git
  history, the preserved `archive/bmw-award-original` branch, and (for
  Groq/Gemini) [`decisions/ADR-0002-provider-abstraction.md`](decisions/ADR-0002-provider-abstraction.md)
  and [`decisions/ADR-0004-single-openai-provider.md`](decisions/ADR-0004-single-openai-provider.md).
- One provider instance is resolved once at process startup
  (`server.mjs`) and reused for the process's entire lifetime — every
  request and every pipeline stage uses the same provider/model. No code
  path constructs a second provider.
- A normal evaluation (up to `AI_MAX_CANDIDATES` candidates) uses **3
  logical model-backed pipeline stages without pairing, or 4 with pairing
  enabled**: one combined role+scenario context-analysis stage, one batch
  stage scoring every candidate, one optional batch stage evaluating
  every relevant top-four pair, and one decision-explanation stage — down
  from the six-to-nine real calls the pre-batching architecture made per
  candidate/pair. This is a fixed count of *logical stages*, not the same
  claim as "at most 4 real OpenAI API requests": a stage's own retry or a
  batch-integrity
  corrective call adds real attempts without adding a stage, which is why
  `run_metadata` separately reports `logicalProviderStageCount` (bounded
  at 4, `server/pipeline/runPipeline.js`'s fixed `MAX_LOGICAL_PROVIDER_STAGES`
  constant, not an environment setting) and `providerAttemptCount` (the
  real, aggregated attempt total, which can exceed 4).
  `LogicalStageLimitExceededError` is a safety net (not a normal-path
  limiter) against a future bug entering a 5th logical stage — it never
  fires from ordinary retries or corrective calls within the existing 4.
- Every LLM operation is schema-validated (`server/ai/schemas/`) before
  its output reaches deterministic code — the OpenAI adapter validates
  twice (once via the SDK's own `zodTextFormat()` helper, once explicitly)
  and never trusts the provider-side guarantee alone.
- Batch responses (candidate scoring, pairing) are mapped back to their
  real-world identity (candidate ID, pair identity) by the pipeline, never
  by array position. Both candidate scoring and pairing must now be
  **complete** — a duplicate, missing, or unknown candidate/pair result
  fails the stage (with one corrective retry, whose real attempt is added
  to `providerAttemptCount` rather than discarded) rather than being
  silently dropped, defaulted, or classified as a successful result from a
  subset. A successful pairing result means every expected top-four pair
  was returned and validated; if the batch is still incomplete after the
  corrective retry, the response honestly reports
  `{"status":"unavailable","reason":"Complete pair analysis was
  unavailable.","best_pair":null,"top_pairs":[]}` — never a fabricated or
  partial "best pair." (An earlier round of this project tolerated a
  merely-missing pair as a partial success; that tolerance was later
  judged to overstate what was actually evaluated and was removed.)
- Deterministic scoring lives in
  [`server/domain/scoring.js`](../server/domain/scoring.js). One formula
  changed intentionally (adaptability — see "Decisions already made"
  below); everything else is unchanged from the original implementation.
- The backend is split into clear module boundaries:
  `server/config` (env loading), `server/ai` (provider contract, the one
  OpenAI adapter, pricing, schemas, prompts), `server/domain` (pure
  formulas), `server/pipeline` (orchestration), `server/http` (Express
  transport). `server.mjs` is a thin composition root.
- Every completed response includes `run_metadata` with
  `logicalProviderStageCount`, `providerAttemptCount`,
  input/cached-input/output/reasoning/total token counts, and an
  estimated cost (`server/ai/pricing/openaiPricing.js`, `null` — never
  guessed — for any model without recorded pricing). Token/cost totals
  are only ever aggregated from attempts that returned a completed
  response with usage data — an attempt that fails before returning any
  response body has no usage to report, so the estimate can honestly
  under-report true spend in that case; this is a displayed estimate for
  the user's own budget awareness, not an invoice.
- 159 backend tests and 16 frontend tests now run (was 0 backend, 1
  frontend placeholder before Phase 1A).

Details: [`architecture/CURRENT_ARCHITECTURE.md`](architecture/CURRENT_ARCHITECTURE.md),
[`architecture/TECHNOLOGY_INVENTORY.md`](architecture/TECHNOLOGY_INVENTORY.md),
[`decisions/ADR-0002-provider-abstraction.md`](decisions/ADR-0002-provider-abstraction.md) (superseded by ADR-0004),
[`decisions/ADR-0003-runtime-provider-configuration.md`](decisions/ADR-0003-runtime-provider-configuration.md),
[`decisions/ADR-0004-single-openai-provider.md`](decisions/ADR-0004-single-openai-provider.md).

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

### Phase 1 post-review corrections — completed, merged via PR #2 (squash commit `8f19bb7`)

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

### Phase 1 single-OpenAI-provider simplification — completed, merged via PR #2 (squash commit `8f19bb7`)

Following the post-review corrections above, a further instruction asked
for a **final architectural decision**: simplify ScenarioRank to exactly
one AI provider (OpenAI) and reduce the number of provider requests a
normal run makes, since Groq and Gemini had *both* failed to complete a
real end-to-end run on their free tiers (see the real-provider retest
above) and the owner has only a small real OpenAI budget (~$3) to work
with. Implemented entirely on the same branch, `v2/phase-1-completion`,
updating the same draft PR #2:

1. **Removed Groq and Gemini completely.** `groqProvider.js`,
   `geminiProvider.js`, `providerContract.shared.js`, their fake-SDK-client
   test support, `providerBase.js` (the JSON-string-based generic runner
   they shared — no longer fits the Responses API's own parse-and-validate
   flow), and `schemaConversion.js` (the standalone Zod→JSON-Schema
   converter — the `openai` package vendors its own via
   `openai/helpers/zod`) were all deleted, not archived in the active
   tree. `groq-sdk`, `@google/genai`, and `zod-to-json-schema` were
   uninstalled. `AI_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL`,
   `GEMINI_API_KEY`, `GEMINI_MODEL`, and `AI_CANDIDATE_CONCURRENCY` (no
   longer meaningful once candidate scoring became one batch request, not
   N concurrent ones) were all removed from `server/config/env.js`,
   `.env.example`, and every runtime code path. See
   [`decisions/ADR-0004-single-openai-provider.md`](decisions/ADR-0004-single-openai-provider.md)
   for the full reasoning, including why the provider-neutral contract,
   error taxonomy, and single retry owner were all *kept* — this is a
   provider-count reduction, not an abstraction rollback.
2. **Added `server/ai/providers/openaiProvider.js`** as the only
   `AIProvider` implementation, using the official `openai` npm package
   (v6.49.0) and the Responses API's Structured Outputs via the SDK's own
   `zodTextFormat()` helper. Every response is still re-validated against
   the canonical Zod schema a second time, explicitly, in this codebase —
   never trusting the provider-side guarantee alone (same principle as
   ADR-0002's Groq strict-mode caveat). Refusal (`RefusalError`, never
   retried), truncation (`IncompleteOutputError`, retried once with a
   1.5× larger output-token budget, never the same insufficient one
   twice), and a distinct "policy content-filter" incomplete reason
   (treated like a refusal) are all handled as separate response states,
   not folded into a generic parse failure. A safe, capped
   (2-second-max) Retry-After delay is honored on a rate limit when the
   API reports one. `store: false` is set on every request (no
   unnecessary response retention).
3. **Model choice: `gpt-5-mini`, verified live against this project's own
   OpenAI account**, not assumed from documentation or training data — see
   ADR-0004 for the exact probe: a minimal real API call confirmed
   `gpt-5-mini` is available to this account, returns a correctly
   schema-validated result, and accepts `reasoning: { effort: "minimal" }`
   (`gpt-5.4-mini`, tried as a comparison, rejected `"minimal"` with a real
   `400` listing its own supported subset — a genuine, observed example of
   "not every reasoning model supports every effort value"). Since all
   three stated conditions (available, Structured-Outputs-capable,
   SDK-compatible) were met on a real probe, no fallback to a different or
   more expensive model was needed.
4. **Reduced a normal run from six-to-nine provider requests down to at
   most 4**, by combining and batching what used to be N separate calls:
   - **Combined context analysis** (was 2 requests: role analysis,
     scenario analysis) — `contextAnalysisSchema`
     (`server/ai/schemas/contextAnalysis.schema.js`) returns both as
     clearly separated nested objects in one response. The pipeline still
     records "Role Analysis Stage" and "Scenario Analysis Stage" as
     distinct `pipeline_stage_outputs` entries and the frontend still
     displays them separately — a logical pipeline stage does not
     necessarily equal one network request.
   - **Batch candidate scoring** (was 1 request per candidate) —
     `buildBatchCandidateScoringSchema(maxCandidates)`
     (`server/ai/schemas/batchCandidateScoring.schema.js`) scores every
     submitted candidate in one request. `mapBatchResultsById()`
     (`server/pipeline/runPipeline.js`) maps results back to candidates by
     their stable ID — never by array position — and rejects the whole
     batch (with one corrective retry, then an honest failure, never a
     default score) if any ID is duplicated, missing, or unrecognized.
   - **Batch pairing analysis** (was 1 request per pair, up to 6) —
     `batchPairingAnalysisSchema`
     (`server/ai/schemas/batchPairingAnalysis.schema.js`) evaluates every
     relevant top-four pair in one request. `mapPairResultsByIdentity()`
     rejects a duplicate or unrequested pair outright, but tolerates a
     merely-*missing* expected pair as a legitimate partial result —
     pairing already has an honest `"unavailable"` fallback for total
     failure, so a real partial result is more useful than discarding it.
   - **Decision explanation** (unchanged, 1 request) now runs *after*
     pairing (previously pairing ran after decision) so its prompt can
     optionally reference an already-known, already-deterministic pairing
     summary — prompt context only, not a new schema field, since pairing
     is fully computed before this call and the model is never asked to
     invent anything about it.
   - Output-token budgets for the batch stages scale with the actual
     candidate/pair count plus a fixed overhead (`server/pipeline/runPipeline.js`),
     not a single hardcoded constant, so they stay justified as
     `AI_MAX_CANDIDATES` changes.
5. **`AI_MAX_CANDIDATES`** (default 5, validated integer 2-10) rejects an
   oversized request with a clear 400/SSE-error **before** the model is
   ever called (`server/http/routes.js`), never silently truncating the
   candidate list. **`AI_MAX_PROVIDER_REQUESTS_PER_RUN`** (default 4,
   validated integer 1-4) is a safety net, not a normal-path limiter — the
   pipeline's own fixed architecture never needs more than 4 requests, so
   this cap only ever fires if a future bug adds a 5th call site
   (`server/pipeline/runPipeline.js`'s `createRequestBudget`).
6. **Cost and usage visibility.** Every response's `run_metadata` now
   includes `providerRequestCount`, `inputTokens`, `cachedInputTokens`,
   `outputTokens`, `reasoningTokens` (a labeled subset of `outputTokens`,
   never billed or summed again on top of it), `totalTokens`, and
   `estimatedCostUsd`. The estimate comes from a small versioned pricing
   table, `server/ai/pricing/openaiPricing.js` — `gpt-5-mini: $0.25/1M
   input, $0.025/1M cached input, $2.00/1M output`, retrieved directly
   from OpenAI's own model-specific documentation page on 2026-07-26 (it
   no longer appears in OpenAI's primary "Standard pricing" comparison
   table, which now leads with the newer `gpt-5.6`/`gpt-5.4` families, but
   its own page was live and not marked deprecated). `estimateCostUsd()`
   returns `null` — never a guessed number — for any model this table
   doesn't explicitly recognize. This is a displayed *estimate* for the
   user's own budget awareness, not an invoice; OpenAI's own billing
   dashboard remains the source of truth. The frontend footer now shows
   provider, model, request count, total tokens, and the estimated cost
   (or "unavailable" when null) alongside the existing pairing/cross-scenario/
   confidence-evidence displays, which were otherwise left alone — no
   visual redesign.
7. **`/health`** now also reports `ai_model` alongside `ai_enabled`/`ai_provider`,
   still never a secret. `AI_PROVIDER` provider-selection was removed
   entirely (not just defaulted) — `createProvider()` takes no
   provider-name argument, since there is no other branch to select
   (`docs/decisions/ADR-0003-runtime-provider-configuration.md`, updated).
8. **Node over Python, reaffirmed, not re-litigated.** The backend stays
   JavaScript/Node: it is already modularized and tested
   (`server/{config,ai,domain,pipeline,http}`), and rewriting Express,
   Zod, Vitest, SSE, retries, schemas, and orchestration in Python/FastAPI
   would duplicate completed, working, tested code for no product
   requirement this project currently has. Python becomes justified later
   only if ScenarioRank adopts Python-first ML/data libraries, custom
   model inference, PyTorch/Hugging Face Transformers, or similar —
   stack diversity should be learned through a separate project, not by
   rewriting working code for its own sake. No new ADR was created for
   this — it is the same reasoning already recorded in
   `docs/architecture/TECHNOLOGY_INVENTORY.md` and `docs/V2_ROADMAP.md`,
   reaffirmed rather than revisited.

**Test totals after this round: 155 backend tests (was 175; net change
reflects deleting the Groq/Gemini-specific adapter/schema-conversion test
suites — `groqProvider.test.js`, `geminiProvider.test.js`,
`providerContract.shared.js`, `schemaConversion.test.js` — and replacing
them with `openaiProvider.test.js` (28 tests covering valid responses,
refusal, truncation-with-larger-retry-budget, malformed/missing content,
schema-invalid re-validation, the full provider-neutral error-mapping
taxonomy including a real Retry-After delay, no secret/raw-payload
leakage, reasoning/token-budget configuration, and usage extraction) and
substantially rewriting `runPipeline.test.js` and `productionSchemas.test.js`
for the new batched schemas/architecture) and 16 frontend tests (was 15:
+1 covering the new cost-unavailable display state).** All 171 tests
pass; `npm run lint` and `npm run lint:server` are both 0 problems;
`npm run build` passes; `node --check server.mjs` passes; `npm audit`
remains at 9 vulnerabilities (unchanged — no new vulnerable dependencies;
removing `groq-sdk`/`@google/genai`/`zod-to-json-schema` and adding
`openai` was net-neutral for the audit).

#### Real OpenAI smoke test (honest result)

A real, complete, synthetic end-to-end evaluation was run against the
live OpenAI API — 3 fictional candidates (no real people, no CVs), pair
simulation enabled, all normal pipeline stages, default `AI_MAX_CANDIDATES`
(5) and `AI_MAX_PROVIDER_REQUESTS_PER_RUN` (4) both active. **Unlike the
Groq/Gemini retest earlier in this document, this run reached the final
completion response successfully:**

| Field | Result |
|---|---|
| Provider / model | `openai` / `gpt-5-mini` |
| Provider requests made | **4** (exactly the target: context, batch scoring, batch pairing, decision) |
| Stages completed | `input, context, scoring, confidence_review, outcome, pairing, decision, complete` — all `"completed"`, none `"failed"` |
| Duration | ~130 seconds total across all stages |
| Attempts per stage | context: 1; scoring: 1; **pairing: 2** (one schema/identity corrective retry, then succeeded); **decision: 2** (one retry, then succeeded) |
| Input tokens | 1,646 |
| Cached input tokens | 0 |
| Output tokens | 4,792 (includes 2,624 reasoning tokens — not billed separately, already a subset) |
| Total tokens | 6,438 |
| Estimated cost | **$0.009996** (~1 cent) |
| Schema validation | succeeded for every stage (with 2 of 4 stages needing their one allowed retry) |
| Deterministic winner produced | yes |
| Pairing status | **`"ok"`** — a real best pair was produced, not an invented one |

This is the first real end-to-end smoke test in this project's history to
actually reach `complete` without falling back to a mocked or partial
result. Total real API spend across this round's verification (one tiny
model-availability probe, one context-analysis-sized probe, and this one
full smoke test) was under 2 cents — well inside the ~$0.20 implementation-testing
budget and the owner's ~$3 total budget. **This smoke test also caught a
real bug**: `run_metadata.attempts.scoring` was silently missing because
the orchestrator destructured the wrong field from `runBatchCandidateScoring()`'s
return value (`const { scorings } = ...` instead of `const { scorings, meta } = ...`,
then read the non-existent `scorings.meta`). Fixed in
`server/pipeline/runPipeline.js`, with a new regression assertion in
`server/pipeline/runPipeline.test.js` asserting `meta.attempts.scoring`
and `meta.attempts.decision` are present — the mocked test suite alone
had not caught this because no test asserted on that specific field.

**Recommendation**: OpenAI (`gpt-5-mini`) can now be presented as a
genuinely reliable default for a live demo — this is a demonstrated
result, not an assumption, and the request-count reduction plus batch
integrity validation both worked exactly as designed on live traffic
(two stages needed their one allowed retry and recovered cleanly, and
none of the three earlier providers' era-specific failure modes recurred).

### Phase 1 metadata/pairing-completeness correction round — completed, merged via PR #2 (squash commit `8f19bb7`)

A further review of the single-OpenAI-provider simplification above found
two remaining issues: the request-count terminology still conflated a
fixed architectural count with the real, variable number of OpenAI
attempts, and the pairing stage's "tolerate a missing pair as partial
success" design (deliberately built in the round above) overstated what
was actually evaluated whenever a pairing result was presented as
successful. Both were corrected on the same branch,
`v2/phase-1-completion`, updating the same draft PR #2 — **no new branch,
no merge, and no new real OpenAI smoke test** (this round changes metadata
aggregation and validation logic, not the OpenAI request format, so the
previously successful full smoke test above remains sufficient evidence
that the request shape works):

1. **`run_metadata` now separates logical stages from real provider
   attempts.** `logicalProviderStageCount` is the fixed, non-configurable
   architectural count of model-backed pipeline stages a run used (context,
   batch scoring, batch pairing, decision — at most 4,
   `server/pipeline/runPipeline.js`'s `MAX_LOGICAL_PROVIDER_STAGES`
   constant). `providerAttemptCount` is the real, aggregated count of
   every actual OpenAI attempt across every stage — initial calls,
   provider-level retries, truncation retries, schema/malformed-response
   retries, and batch-integrity corrective calls — and can legitimately
   exceed 4. The previous `AI_MAX_PROVIDER_REQUESTS_PER_RUN` environment
   setting and `providerRequestCount` field (which conflated these two
   concepts) are removed entirely.
   `LogicalStageLimitExceededError` (renamed from
   `ProviderRequestBudgetExceededError`) is the safety net that fires only
   if a future bug ever adds a 5th call site — it is backed by a fixed
   internal constant, not a configurable setting, since the architecture
   itself defines the stage count, and it never trips from ordinary
   retries or corrective calls within the existing 4 stages.
2. **A batch-integrity corrective retry's real attempt and token usage are
   now aggregated, never discarded.** `callBatchWithIntegrityRetry()`
   (`server/pipeline/runPipeline.js`) previously returned only the last
   successful call's metadata when a corrective retry succeeded, silently
   dropping the first (rejected) call's real attempt/usage from
   `run_metadata` even though real API spend occurred on it. It now sums
   `attempts` and token `usage` across every call in its retry loop,
   including a rejected first attempt whose result was superseded by a
   later, validated call. This aggregation happens whether the stage
   ultimately succeeds or fails entirely — a thrown error is annotated
   with `attemptsConsumed`/`usageConsumed` so callers can still honestly
   record real spend even when a stage produces no usable result.
3. **Batch pairing analysis now requires complete coverage of every
   expected top-four pair.** An earlier round deliberately tolerated a
   merely-missing pair as a partial pairing success; that tolerance
   overstated what was actually evaluated and has been removed.
   `mapPairResultsByIdentity()` now rejects a batch missing any expected
   pair, exactly like it already rejected a duplicate (including a
   reversed-order duplicate) or an unrequested pair, with one corrective
   retry. If the batch is still incomplete afterward, the response
   honestly reports
   `{"status":"unavailable","reason":"Complete pair analysis was
   unavailable.","best_pair":null,"top_pairs":[]}` — the reason text
   changed from the previous round's "All pair evaluations failed." to
   reflect that an *incomplete* batch, not only a *totally failed* one,
   now produces this result. `runBatchPairingAnalysis()` was redesigned to
   never throw — a total pairing failure is caught internally so the
   stage's real attempts/usage are still recorded in `run_metadata` even
   when the pairing result itself ends up unavailable.
4. **`estimatedCostUsd`'s known limitation is now documented explicitly,**
   not left implicit: token/cost totals are only ever aggregated from
   attempts that returned a completed response with usage data. An attempt
   that fails before returning any response body (an authentication error,
   a connection failure) has no usage to report and is silently excluded
   from the token/cost totals, even though it still counts toward
   `providerAttemptCount`. This means the displayed estimate can honestly
   under-report true spend when a stage fails hard, as distinct from
   succeeding-but-discarded (a batch-integrity corrective retry, which
   does have usage and is included). Documented in the file header of
   `server/ai/pricing/openaiPricing.js`.
5. **Stale provider comments corrected.** `server/ai/retry.js`'s file
   header, which still described a Groq/Gemini-era retry setup, now
   describes the current reality: OpenAI is the only active provider, the
   OpenAI SDK's own automatic retries are disabled (`maxRetries: 0`), and
   this module is the sole retry owner. A repo-wide search confirmed no
   other active source comment still describes Groq, Gemini, or Phase 1A
   as if it were current.
6. **Frontend updated to match.** `RunMetadata`'s `providerRequestCount`
   field was replaced with `logicalProviderStageCount`/
   `providerAttemptCount`, and the results footer now reads "N stage(s) ·
   M OpenAI call(s)" instead of "N request(s)".

**Test totals after this round: 159 backend tests** (was 155 at the end
of the single-OpenAI-provider simplification round: net +4 from removing
the now-invalid "tolerates a partial pairing result" tests and adding new
tests for complete-coverage validation, corrective-retry attempt
aggregation, and the logical-stage/attempt-count split — see
`server/pipeline/runPipeline.test.js`, `server/config/env.test.js`,
`server/http/routes.test.js`) **and 16 frontend tests** (unchanged count;
`src/pages/Index.test.tsx` assertions updated for the new metadata field
names and footer text). New/rewritten tests specifically cover: a normal
run without pairing uses exactly 3 logical stages, a normal run with
pairing uses exactly 4; a provider retry increases `providerAttemptCount`
without increasing `logicalProviderStageCount`; a batch-integrity
corrective call likewise increases `providerAttemptCount` without adding a
stage; all six pairs returned for four candidates is accepted as complete;
a batch missing one pair, missing several pairs, containing a reversed
duplicate, containing an unknown pair, or empty are all rejected; a
corrective retry that returns the complete set succeeds; a corrective
retry still incomplete produces the honest unavailable result with the
exact new reason text; and attempts/usage are still recorded in
`run_metadata` for a pairing stage that ultimately failed.

**Full verification status for this round** (branch
`v2/phase-1-completion`, draft PR #2 targeting `main`, not merged):

| Check | Result |
|---|---|
| `npm ci` | passes |
| `npm run lint` | 0 problems |
| `npm run lint:server` | 0 problems |
| `npm test` (frontend + backend) | 175 tests passing (16 frontend + 159 backend) |
| `npm run build` | passes |
| `node --check server.mjs` | passes |
| `npm audit` | 9 vulnerabilities (0 critical, 0 low, 3 moderate, 6 high) — unchanged, no new dependencies added |
| `.env.local` untracked/ignored | confirmed (`.gitignore` matches `.env.*`; only `.env.example` is tracked); contents not inspected beyond confirming ignore/untracked status |
| Secret scan (tracked files) | no API-key-shaped strings found |
| Stale Groq/Gemini/Anthropic/Phase-1A comments | none found in active source outside historical ADRs |
| Real OpenAI smoke test | **not re-run this round, per explicit instruction** — this round changes metadata aggregation and pair-completeness validation, not the OpenAI request format, so the previously successful full smoke test (above) remains the relevant evidence |

## Current known correctness issues

Fixed in Phase 1C: pairing top-four selection, fabricated
`cross_scenario_consistency`, "Bias Agent" naming, confidence-as-
probability UI wording, hardcoded frontend backend URL. Fixed in the
Phase 1 post-review corrections: the pairing stage's fabricated outer
fallback, the unsupported best/worst-scenario claims, the
`bias_confidence_reviews`/`bias_flags` field names, and the "agent"
terminology throughout the active pipeline. **Fixed in the Phase 1
single-OpenAI-provider simplification**: neither Groq nor Gemini
could reliably complete a live run on their free tiers (documented as
open in the previous round) — resolved by removing both and running on
OpenAI (`gpt-5-mini`) instead, with a real smoke test that reached
`complete` successfully. **Fixed in the Phase 1 metadata/pairing-
completeness correction round above**: the request-count terminology
conflated a fixed architectural count with the real, variable OpenAI
attempt count (resolved by `logicalProviderStageCount`/
`providerAttemptCount`), and the pairing stage's "tolerate a missing pair
as partial success" design overstated what was actually evaluated
(resolved by requiring complete pair coverage). Still open:

1. Candidate scoring depends on very limited evidence (short free-text
   descriptions).
2. The active frontend page remains one large file (backend module
   boundaries were split in Phase 1D; the frontend split is Phase 2).
3. Duplicated contracts: pipeline types exist both inline in the frontend
   page and in `src/types/pipeline.ts` (the latter, plus
   `src/components/v3/*` and `src/components/AgentFlowSection.tsx`, are
   confirmed dead code still using the retired "bias"/"agent" naming —
   Phase 2 cleanup).
4. Backup files, an older dataset, and unused component families are
   still present (Phase 2 cleanup).
5. No model evaluation dataset, golden examples, or prompt-regression
   checks yet (Phase 3).
6. Opportunity-cost risk is still misnamed (averages risks rather than
   comparing forgone benefits) — deliberately deferred, needs design work.
7. Formula coefficients remain unvalidated heuristics (the P0.2 fix
   changed which inputs feed adaptability, not the general validation gap).
8. Authentication, persistence, real privacy controls, and production
   deployment are all later-phase work (Phase 5). `AI_MAX_CANDIDATES` and
   the fixed `MAX_LOGICAL_PROVIDER_STAGES` safety net are cost/bug safety
   nets, not a real rate limiter or a per-client quota — a public
   deployment still needs a
   reverse-proxy rate limiter in front of it (`docs/architecture/KNOWN_LIMITATIONS.md` P3.2).
9. `react-router-dom` is on a version with known moderate-severity CVEs;
   fixing it needs a deliberate major-version migration (see the audit
   table above).

Full detail: [`architecture/KNOWN_LIMITATIONS.md`](architecture/KNOWN_LIMITATIONS.md).

## Decisions already made

- `main` represents ScenarioRank V2.
- Temporary implementation branches are merged and deleted; they are not
  permanent project branches.
- **OpenAI (`gpt-5-mini`) is the only supported provider** (superseded:
  Groq and Gemini were both real, tested integrations, removed after
  neither could reliably complete a live run on its free tier — see
  `docs/decisions/ADR-0004-single-openai-provider.md`).
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
- **New in the Phase 1 single-OpenAI-provider simplification:** keeping an
  unused provider adapter "for later" is not free — each one carries its
  own SDK dependency, environment variables, tests, and failure modes to
  reason about. A provider is removed, not left dormant, once nothing
  actually depends on it; re-adding one later means writing a real new
  adapter deliberately, with its own ADR, not un-commenting something
  dormant (docs/decisions/ADR-0004-single-openai-provider.md).
- **New in the Phase 1 single-OpenAI-provider simplification:** a
  provider-neutral contract is worth keeping even with exactly one
  provider — it isolates SDK-specific plumbing (request shape,
  refusal/truncation detection, error mapping, usage extraction) from the
  orchestrator, and that separation's value doesn't depend on provider
  count.
- **New in the Phase 1 single-OpenAI-provider simplification:** batch
  responses must be validated by real-world identity (candidate ID, pair
  identity), never by array position or count alone. (**Superseded by the
  metadata/pairing-completeness correction round below**: "missing" was
  briefly treated as a tolerated partial result for pairing specifically;
  that tolerance overstated what was actually evaluated and was removed —
  both candidate scoring and pairing now require complete coverage.)
- **New in the Phase 1 single-OpenAI-provider simplification:** an
  estimated cost must come from actual token usage against a table of
  models this codebase has actually verified pricing for, and must return
  `null` — never an extrapolated guess — for anything outside that table.
- **New in the Phase 1 metadata/pairing-completeness correction round:** a
  fixed architectural count (how many logical model-backed stages a
  pipeline design uses) and a real, variable operational count (how many
  actual provider attempts occurred, including retries) are different
  concepts and must be reported as two separate fields, never conflated
  into one — the fixed count belongs in code as a constant, not as an
  environment setting, since there is nothing for an operator to
  meaningfully configure about an architectural fact.
- **New in the Phase 1 metadata/pairing-completeness correction round:** a
  successful result for a "must cover N things" batch operation (candidate
  scoring, pairing) means all N were validated — there is no such thing as
  a partial success for this kind of operation; presenting a subset as
  successful would overstate what was actually checked, even if the
  subset itself is individually accurate.
- **New in the Phase 1 metadata/pairing-completeness correction round:**
  real API spend (attempts and token usage) must be recorded in
  `run_metadata` even when the stage that spent it ultimately fails or is
  discarded (a rejected first attempt before a corrective retry succeeds,
  or a pairing stage that ends up totally unavailable) — honest cost
  accounting does not get to skip the calls whose results weren't used.

## Next planned milestone

**Phase 1 is complete and merged.** PR #2 (including all three
post-review rounds — the correctness/naming corrections, the
single-OpenAI-provider simplification, and the metadata/pairing-
completeness correction round) was approved by the owner and squash-
merged into `main` as commit `8f19bb7`. No further Phase 1 work is
planned.

**The exact next milestone is Phase 2 planning and understanding, before
any implementation** — architecture and maintainability work. **Phase 2
has not started; no Phase 2 code has been written.**

Per `docs/V2_ROADMAP.md`, Phase 2 is planned to:

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
  to Python/FastAPI (reaffirmed as Node for now — see the Phase 1
  single-OpenAI-provider simplification milestone above);
- the real end-to-end demo concern from the earlier Groq/Gemini retest is
  now resolved — the real OpenAI smoke test (above) reached `complete`
  successfully, so this is no longer an open follow-up.

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
  naming, agent terminology, stale comments, a documentation pass), all
  completed on the same branch, updating the same draft PR #2 — no new
  branch was created, per explicit instruction.
- A further instruction then asked for a final architectural
  simplification — one AI provider (OpenAI) instead of two, and a
  request-count reduction — again completed on the same branch, updating
  the same draft PR #2.
- A further review then requested the metadata/pairing-completeness
  correction round documented above (logical-stage vs. real-attempt
  accounting, complete pair coverage, stale comment cleanup) — again
  completed on the same branch, updating the same draft PR #2, without
  re-running the real OpenAI smoke test since that round's changes didn't
  affect the request format.
- **The owner reviewed and explicitly approved this final version. PR #2
  was marked ready for review and squash-merged into `main` as commit
  `8f19bb7` (title: "feat: complete ScenarioRank V2 Phase 1").** The
  temporary branch `v2/phase-1-completion` was deleted both locally and
  on the remote after the merge (a force-delete of the local branch is
  expected and safe after a squash merge, since the original branch's
  individual commits are not — and were never meant to be — direct
  ancestors of the squash commit; the full history is preserved in the
  merged PR itself).
- `main` is now the sole active line for this work — there is no
  outstanding Phase 1 branch or PR.
- `archive/bmw-award-original` (branch) and `bmw-award-original` (tag)
  are untouched and permanent — they are never merged, rebased, or
  deleted.
- Temporary branches are merged and deleted; they are not permanent
  project branches.
- New implementation branches should only be created when work begins —
  no Phase 2 branch exists yet, since Phase 2 has not started.
- Prefer one active implementation branch at a time.

## Learning checkpoints

Concepts the owner should understand now that Phase 1 is complete:

- What an adapter is, concretely, and what would change (and what
  wouldn't) if a second provider were added back.
- Why the pipeline depends on an interface rather than the `openai`
  package directly, even with exactly one provider.
- Why Zod validation is still required even though the OpenAI SDK's own
  `zodTextFormat()` helper already re-validates once internally.
- Where retries occur, and why there is exactly one retry owner.
- Why one provider instance is resolved once at process startup — not
  once per request — and why that's a stronger guarantee than "one per
  run."
- Why Google ADK is not currently being used.
- Why `.env.local` must remain backend-only and untracked, and the exact
  precedence between it, `.env`, and a real shell-exported variable.
- Why the cross-scenario-consistency fix removed an input instead of
  computing a "better" replacement number.
- Why Groq and Gemini were removed rather than kept as unused
  alternatives, and what real test result drove that decision.
- Why a missing candidate in a batch scoring response and a missing pair
  in a batch pairing response are both a hard failure — and why an
  earlier round of this project briefly treated a missing pair as a
  tolerated partial result before that was judged to overstate what was
  actually evaluated.
- Why `estimatedCostUsd` is `null` for an unrecognized model instead of an
  extrapolated guess.
- Why `logicalProviderStageCount` (a fixed architectural constant) and
  `providerAttemptCount` (a real, variable operational count) are
  reported as two separate `run_metadata` fields instead of one, and a
  concrete scenario where they'd differ.
- Why a batch-integrity corrective retry's real attempt and token usage
  must still be added to `run_metadata` even though its result was
  superseded by a later call.
- Why `estimatedCostUsd` can honestly under-report true spend when an
  attempt fails before returning any response body, and why that's a
  documented SDK limitation rather than an implementation gap.

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

## Phase 2A — completed on its feature branch (2026-07-29)

Phase 2A added `shared/contracts/decisionApi.js` as the runtime Zod source of
truth for public HTTP/SSE payloads, while retaining provider-only schemas in
`server/ai/schemas/`. The frontend is now `src/features/decision/`: a small
page composition, API/SSE client, workflow hook, contracts derived with
`z.infer`, constants, and presentation views. Verified legacy presentation
trees, the static dataset, stale duplicate types, and backup files were
removed. `npm run typecheck` is available. Node/Express is retained by
ADR-0006; Phase 3 reliability/evaluation work has not started. The next
milestone is **Phase 2B: application-level input validation, frontend
accessibility review, and remaining maintainability cleanup**.

Phase 2A correction round: the former `DecisionViews.tsx` monolith was split
into `DecisionScreen`, `Landing`, `EvaluationForm`, `PipelineProgress`,
`DecisionResults`, and shared display primitives. The feature now has focused
API and hook tests; malformed SSE JSON and scenario-provider errors become
safe public messages. Public response schemas enforce documented score,
confidence, metadata, and cost ranges. Phase 2B and Phase 3 remain unstarted.

Latest correction verification: 26 frontend tests and 165 backend tests pass
(191 total), with lint, server lint, typecheck, build, and syntax checks. A
fresh `npm ci` and `npm audit` could not be re-run because registry egress was
denied; the correction round did not change dependencies or the lockfile.
