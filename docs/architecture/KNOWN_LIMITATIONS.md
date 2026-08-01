# Known limitations

This file records limitations before they are fixed, and records exactly
how each was resolved once it is. Numbering is stable across phases so
history and cross-references stay valid — a resolved item is marked
resolved in place, not deleted or renumbered.

## Phase 2B-1 validation and accessibility

Shared schema limits, safe direct-API validation errors, semantic form labels,
error-summary focus, live status, visible focus rings, and keyboard tabs are
implemented. This is an accessibility-oriented prototype review, not a WCAG
certification; manual checks remain in `docs/testing/ACCESSIBILITY_CHECKLIST.md`.

## Phase 2B-2 template/dependency cleanup — RESOLVED (unused template debt)

The repository carried a large generated shadcn/Radix component set
(55 files under the former `src/components/ui/`), several dead helper files,
45 npm dependencies with zero remaining importers, two unused root providers
(`QueryClientProvider`, `TooltipProvider`) and two toast systems that were
mounted but never invoked, and three lockfiles for two package managers. All
were removed with each deletion proven by an exhaustive import-graph search,
not assumed — see `docs/PROJECT_STATUS.md` ("Phase 2B-2") and
`docs/security/DEPENDENCY_AUDIT.md`. `npm audit` findings dropped from 9 to
4; the 4 remaining findings all require a major-version dependency migration
and are deliberately deferred as separate follow-ups, not silently left
unaddressed — full classification in `docs/security/DEPENDENCY_AUDIT.md`.
Phase 3 remains unstarted.

### Phase 2B-2 correction pass — RESOLVED (residual template debt, stale public demo, audit fact error)

A follow-up review found the cleanup above was incomplete and one of its
own claims was wrong. Fixed in the same phase's correction pass:
`src/lib/utils.ts` (and the `clsx`/`tailwind-merge` dependencies it alone
used) — deliberately left in place by the original pass because it fell
outside the explicitly scoped deletion directories — was confirmed to have
zero importers anywhere and deleted, along with `components.json` (stale
shadcn configuration pointing at the deleted component tree),
`src/App.css` (unused Vite starter CSS), and `playwright.config.ts` /
`playwright-fixture.ts` / `@playwright/test` (a broken, never-used
Playwright stub whose config imported a package that was never actually
installed). `tailwindcss-animate` and its unused accordion keyframes were
also removed — no active class used them; `animate-pulse` and
`motion-reduce:animate-none` are core Tailwind utilities and needed no
plugin. The generated root package name (`vite_react_shadcn_ts`) was
renamed to `scenariorank-ai`. `public/demo.html`, the publicly reachable
static demo, still described the retired award-build architecture
(Anthropic Claude, a seven-agent pipeline, "Bias Review") — it was rewritten
to describe the current OpenAI/gpt-5-mini, up-to-four-logical-stage
pipeline. Separately, this document and `docs/security/DEPENDENCY_AUDIT.md`
previously stated the `vite`/`esbuild` findings require `vite` `8.2.0`
(two major versions up) — that was `npm audit`'s own automated summary
taken at face value, not verified against the actual advisories. Corrected:
the real minimum patched release is `vite@6.4.3` (one major version up),
verified against the GHSA advisories directly and via a real isolated
install (`npm ls` showed `esbuild` resolving to `0.25.12`, above the
patched `0.25.0` threshold). The corrected, smaller migration is still
deferred as a separate follow-up rather than applied in this pass — see
"Migration decision" in `docs/security/DEPENDENCY_AUDIT.md`.

## Phase 2C Vite 6 security and toolchain migration — draft, not merged

**Branch `v2/phase-2c-vite6-security`.** Of the 4 `npm audit` findings the
Phase 2B-2 correction pass deferred, the `vite`/`esbuild` pair is now
resolved: `vite` `5.4.21` → `6.4.3` (the minimum patched release),
transitively resolving `esbuild` to `0.25.12`. `react-router`/
`react-router-dom` remain open — see `docs/security/DEPENDENCY_AUDIT.md`
("Phase 2C update") for the full before/after classification. This phase
also fixed a pre-existing frontend test-teardown defect: an uncancelled
health-check effect in `useDecisionEvaluation.ts` could apply a late
`/health` response after the component unmounted, which — only when
Vitest had already torn down that test file's jsdom environment —
surfaced as an `Unhandled Rejection: window is not defined` warning
(previously recorded, unresolved, in `docs/PROJECT_STATUS.md`'s Phase
2B-2 correction-pass verification record). Fixed with a cancelled-flag
effect-cleanup guard; no user-visible behavior changed. Full detail:
`docs/PROJECT_STATUS.md` ("Phase 2C").

## Priority 0 — correctness and integrity

### P0.1 Pair simulation uses submission order — RESOLVED (Phase 1C)

~~The pair stage receives candidates in the original input order and then calls `slice(0, 4)`.~~ Fixed: pairing now receives the top four candidates from the run's actual deterministic ranking (sorted by the selected `decision_mode`), not the first four submitted. Regression test: `server/pipeline/runPipeline.test.js` ("pairing top-four regression"), constructed so submission order and ranking order are deliberately different.

### P0.2 Adaptability is partly hardcoded — RESOLVED (Phase 1C/1D)

~~`cross_scenario_consistency` is fixed at `75`.~~ The fabricated input was removed, not replaced with another constant or an invented formula (a real fix needs genuine multi-scenario execution, which is out of scope through Phase 1D — see Phase 3 in `docs/V2_ROADMAP.md`). `computeAdaptabilityScore()` (`server/domain/scoring.js`) now uses only the three real model-derived criteria, renormalized to sum to 1.0, and `cross_scenario_consistency` is honestly exposed as the literal string `"not_measured"` in `outcome_models`, `candidate_evaluations[].outcome_model`, and `adaptability_profiles`, instead of a silent internal-only fabricated number with zero API visibility. Post-review correction (Phase 1D): `adaptability_profiles[].best_scenario` and `.worst_scenario` previously used the current scenario as "best" and the fixed phrase "Rapid crisis/pivot scenario" as "worst," implying the system had observed how each candidate performs in other scenarios. Both fields are now always the literal string `"not_measured"`, and `resilience_note` describes adaptability only as a heuristic derived from the criteria observed in this one run — it no longer claims a candidate "may struggle under rapid pivots" or performs best/worst in any scenario. A regression test (`server/pipeline/runPipeline.test.js`, "never claims a candidate performs best...") scans the full pipeline response for these exact retired phrases. See `docs/architecture/SCORING_AND_ASSUMPTIONS.md` for the exact before/after formula.

### P0.3 "Bias review" is mislabeled — RESOLVED (Phase 1C/1D)

~~The current stage checks low confidence and short evidence... The name can create false confidence.~~ Renamed to "Confidence & Evidence Review" everywhere: the pipeline stage label, the SSE stage list, the `pipeline_stage_outputs` entry (`stage_role` now explicitly states "not a demographic or legal bias audit"), the frontend stage list and "Confidence & Evidence Flags" card, and this document. Post-review correction (Phase 1D): the response field names themselves were also renamed, since a field called `bias_confidence_reviews`/`bias_flags` was still misleading even with an accurate label elsewhere — they are now `confidence_evidence_reviews`/`confidence_evidence_flags` in both the backend response (`server/pipeline/runPipeline.js`) and the active frontend (`src/pages/Index.tsx`), with no compatibility alias kept (this is still a pre-production portfolio project). The underlying check (confidence + evidence length) is unchanged — only the names and description, which no longer overclaim.

### P0.4 Model outputs lack strict validation — RESOLVED (Phase 1B)

~~Prompts request JSON, and the server repairs common syntax errors.~~ All six LLM operations now have production Zod schemas (`server/ai/schemas/`) with required properties, enums, numeric ranges, array/object shapes, and text-length limits. Every response is parsed, validated against its schema, and rejected (with one controlled retry) before it can reach deterministic calculations (`server/ai/providerBase.js`). The manual JSON-repair code (`sanitizeJSON`/`extractFirstJSON`) was removed along with the rest of the Anthropic-specific request path.

### P0.5 Fallback values can hide failed model assessments — RESOLVED (Phase 1B/1D)

~~The pairing stage's *outer* fallback — returning a generic default pair when every pair call in a run fails — means a result can look complete when the underlying evaluation didn't succeed for any pair.~~ The pairing stage's `?? default`-style fallbacks for individual metric fields were removed in Phase 1B (the production schema now requires all six pairing metrics, so a response missing one is rejected and retried rather than defaulted). Post-review correction (Phase 1D): the remaining *outer* fallback — a fabricated "Default pair" with invented scores (`pair_score: 7.0`, `scenario_coverage: 0.75`, etc.) — was removed entirely. When every pair evaluation in a run fails, `pairing_result` is now `{ "status": "unavailable", "reason": "All pair evaluations failed.", "best_pair": null, "top_pairs": [] }` instead of an invented pair, and the frontend's pairing tab shows a plain "Pairing Unavailable" message rather than a fake recommendation. Regression tests (`server/pipeline/runPipeline.test.js`, "pairing failure modes never fabricate a pair") cover full success, partial pair failure, and all-pairs-failed, and assert none of the old fabricated values appear anywhere in the response. **Post-review correction (ADR-0004):** pairing was later redesigned from one provider request per pair to a single batch request for every relevant pair; the same honesty guarantee carries over and was later tightened further: a duplicate, unrequested, *or merely-missing* pair in the batch is now rejected (one corrective retry, then the stage fails), because a successful pairing result must cover every expected pair — a subset is never classified as a successful "best pair" analysis. Only a batch that still fails to cover every expected pair after the retry falls back to the honest `{"status":"unavailable","reason":"Complete pair analysis was unavailable.","best_pair":null,"top_pairs":[]}` shape (reason text updated from the earlier "All pair evaluations failed.").

### P0.6 Candidate scoring depends on very limited evidence

Still open — unchanged. Short user-written descriptions are treated as sufficient evidence for detailed leadership judgments. The source, completeness, and reliability of those descriptions are unknown.

## Priority 1 — architecture and maintainability

### P1.1 Oversized active files — RESOLVED (Phase 2A)

The backend has explicit Phase 1D boundaries. Phase 2A moved the frontend into
`src/features/decision/`, decomposed results and evaluation editing into
cohesive modules, restored ordinary multiline formatting, and added an
enforced 180-character source-line guard.

### P1.2 Duplicate and likely abandoned code — RESOLVED (Phase 2A)

Import-graph review confirmed and removed the backup files, old dataset, stale
presentation families, `src/components/v3/`, and obsolete duplicate types.

### P1.3 Duplicated contracts — RESOLVED (Phase 2A)

`shared/contracts/decisionApi.js` is the runtime source of truth for public
HTTP/SSE data. The browser imports those schemas and derives types with
`z.infer`; the stale duplicate type file was removed.

### P1.4 Hardcoded deployment configuration — PARTIALLY RESOLVED (Phase 1C)

~~The frontend backend URL and backend model identifier are hardcoded.~~ The frontend backend URL is now `VITE_BACKEND_URL`-configurable (`src/lib/backendUrl.ts`), with the previous hardcoded value kept only as a development fallback. The backend model identifier is configurable via `OPENAI_MODEL` (Phase 1A/1B; single-provider since the Phase 1 post-review corrections — see `docs/decisions/ADR-0004-single-openai-provider.md`). The application still assumes a single backend origin per environment and exactly one configured provider — by design, not as an unaddressed gap (see `docs/decisions/ADR-0003-runtime-provider-configuration.md`).

### P1.5 Provider integration is coupled to orchestration — RESOLVED (Phase 1B)

~~Prompt creation, HTTP transport, retries, parsing, and domain execution are all called from the same file.~~ Fixed: `server/ai/prompts/` (prompt creation), `server/ai/providers/` (transport + retries, via `server/ai/retry.js`), `server/ai/providerBase.js` (parsing + validation), and `server/domain/scoring.js` (domain execution) are now separate modules, composed by `server/pipeline/runPipeline.js`, which itself no longer performs any of those four responsibilities directly.

### P1.6 Current "agents" are functions, not autonomous agent boundaries — RESOLVED (Phase 1D, naming)

~~Called "agents" (Agent Pipeline, Role Agent, Scenario Agent, Candidate Scoring Agent, Outcome Modeling Agent, Decision Agent, Pairing Agent) despite not independently selecting tools, planning, maintaining durable memory, or controlling routing.~~ Post-review correction (Phase 1D): renamed throughout the active backend and frontend to accurate pipeline-stage terminology — `agent_outputs` → `pipeline_stage_outputs`, each entry's `agent_name`/`agent_role` → `stage_name`/`stage_role`, and every stage's display name from "X Agent" to "X ... Stage" (e.g. "Role Analysis Stage", "Candidate Scoring Stage", "Pairing Analysis Stage"). The frontend tab and live-progress heading previously labeled "agents"/"Agent Pipeline" are now "pipeline"/"Decision Pipeline". The underlying architectural fact this item describes is unchanged and intentional (see `docs/decisions/ADR-0002-provider-abstraction.md`, "why Google ADK was not selected") — the functions still have named responsibilities but do not independently select tools, plan, maintain durable memory, or control routing; the rename makes the naming match that reality instead of overclaiming it. The dead-code files `src/types/pipeline.ts` and `src/components/v3/*`/`src/components/AgentFlowSection.tsx` (unreachable from the app entrypoint, see P1.2/P1.3) still use the old "agent" naming — left untouched as Phase 2 cleanup, not part of this correction's scope (tracked active source).

## Priority 2 — testing and AI evaluation

### P2.1 No meaningful unit tests — RESOLVED (Phase 1A/1D)

~~The existing Vitest test asserts that `true` is `true`.~~ The current suite has 191 backend and 91 frontend tests, covering deterministic formulas (with characterization tests pinning exact behavior before/after the P0.2 fix), normalization, public/provider contracts, mocked pipeline execution, routes, and focused rendered frontend behavior.

### P2.2 No route or stream integration tests — RESOLVED (Phase 1D)

~~Request validation, SSE event ordering, timeouts, and error propagation are untested.~~ `server/http/routes.test.js` (8 tests) exercises the real Express app on an ephemeral port: SSE stage ordering through to `complete`, error events for invalid input and for a failing pipeline stage (asserted to resolve within 5s — no hang), AI-unavailable handling, `/health` secret-safety, and both `/api/decision` success and 503 paths.

### P2.3 No model evaluation dataset

Still open — unchanged. There are no golden examples, expected score ranges, consistency checks, prompt regression tests, or human-labeled benchmarks. Deferred to Phase 3 (`docs/V2_ROADMAP.md`).

### P2.4 No reproducibility controls — RESOLVED (Phase 1B)

~~The response does not persist prompt version, model identifier returned by the provider, token usage, latency per model call, or model output snapshots.~~ Every response now includes `run_metadata`: provider, model, per-stage prompt/schema versions, per-stage attempt counts, and start/completion timestamps (`server/pipeline/runPipeline.js`). **Post-review correction (ADR-0004):** token usage is now fully surfaced too — `logicalProviderStageCount` (the fixed architectural count of model-backed stages, at most 4), `providerAttemptCount` (the real, aggregated count of OpenAI attempts including retries and corrective calls, which can exceed 4), `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens`, and an `estimatedCostUsd` computed from a small versioned pricing table (`server/ai/pricing/openaiPricing.js`), `null` rather than guessed for any unrecognized model. Token/cost totals are only ever aggregated from attempts that returned a completed response with usage data — an attempt failing before any response body is excluded from the totals even though it still counts toward `providerAttemptCount` (`server/ai/pricing/openaiPricing.js`'s file header). This is still a per-response value, not a persistence layer (still no database, by design).

## Priority 3 — security, privacy, and operations

### P3.1 No authentication or authorization

Still open — unchanged and explicitly out of scope through Phase 1D.

### P3.2 No rate limiting or budget controls — PARTIALLY RESOLVED (Phase 1 post-review, ADR-0004)

~~No rate limiting or budget controls.~~ Two safety nets exist now, but neither is a rate limiter or a real dollar-budget enforcement: `AI_MAX_CANDIDATES` rejects an oversized request before the model is ever called (protects per-run cost/output size), and a fixed internal `MAX_LOGICAL_PROVIDER_STAGES` constant (not an environment setting) fails safely with a non-retryable `LogicalStageLimitExceededError` if a bug ever made the pipeline enter more than this architecture's fixed 4 logical stages (protects against a future code defect adding an unplanned call site, not against a malicious high-volume client, and not against ordinary retries/corrective calls within those 4 stages, which are expected and unbounded by this constant). There is still no per-client rate limiting, no authenticated quota, and no hard dollar cap enforced server-side — a public deployment without a reverse-proxy rate limiter in front of it could still be used to run many evaluations back-to-back.

### P3.3 Broad CORS policy

Still open — unchanged.

### P3.4 No persistent audit trail

Still open. `run_metadata` (P2.4) is a step toward reproducibility but is per-response only — there is still no database record of who initiated an evaluation or a durable log across runs.

### P3.5 Candidate data is sent to an external provider

Still open. The OpenAI adapter sets `store: false` on every request (`server/ai/providers/openaiProvider.js`) so responses are not retained by OpenAI for later retrieval by default — a data-minimization step, not a full solution. `docs/decisions/ADR-0002-provider-abstraction.md`'s Gemini-specific unpaid-tier data-use restriction is now historical (Gemini was removed, ADR-0004) but the underlying gap it described is unchanged for OpenAI too: no consent flow, minimization beyond `store: false`, retention policy, redaction, or deletion workflow exists in this codebase. Real candidate data sent to any external LLM provider still requires its own privacy/consent/terms review before any production or public use.

### P3.6 No observability

Still open — unchanged. Console logs are not sufficient for production monitoring.

### P3.7 No deployment or rollback definition

Still open — unchanged.

## Priority 4 — methodological and ethical limitations

### P4.1 Formula coefficients are unvalidated heuristics

Still open — unchanged, except that the P0.2 fix changed the adaptability formula's specific coefficients (see `docs/architecture/SCORING_AND_ASSUMPTIONS.md`). The coefficients remain unvalidated heuristics, just no longer ones that include a fabricated input.

### P4.2 Confidence is not calibrated — PARTIALLY RESOLVED (Phase 1C)

~~Model self-reported confidence should not be interpreted as probability of correctness.~~ UI copy no longer labels this "Confidence" alone — it reads "Model conf." / "Model Conf." with a tooltip stating it is not a calibrated probability of correctness (`src/pages/Index.tsx`). The underlying methodological gap — confidence is still uncalibrated model self-report, not validated against real outcomes — is unchanged; this is a language fix, not a calibration fix.

### P4.3 Criteria may encode subjective or proxy judgments

Still open — unchanged.

### P4.4 Human oversight is not enforced

Still open — unchanged.

### P4.5 Opportunity cost is currently misnamed

Still open — unchanged. Deliberately deferred (see `docs/V2_ROADMAP.md`, Phase 1 constraints): replacing the terminology or implementing a real comparative metric needs design work beyond a Phase 1 correctness fix.

## Phase 2A resolved maintenance debt

The oversized page, duplicate stale frontend contracts, and unreachable legacy
component/data/backup trees were removed or split in Phase 2A. Remaining Phase
2 work is application input-validation UX, accessibility review, and focused
maintainability cleanup; Phase 3 evaluation/reliability work has not begun.

This cleanup does not add persistence, rate limiting, calibration, evaluation
datasets, or production-readiness guarantees.
