# Known limitations

This file records limitations before they are fixed, and records exactly
how each was resolved once it is. Numbering is stable across phases so
history and cross-references stay valid — a resolved item is marked
resolved in place, not deleted or renumbered.

## Priority 0 — correctness and integrity

### P0.1 Pair simulation uses submission order — RESOLVED (Phase 1C)

~~The pair stage receives candidates in the original input order and then calls `slice(0, 4)`.~~ Fixed: pairing now receives the top four candidates from the run's actual deterministic ranking (sorted by the selected `decision_mode`), not the first four submitted. Regression test: `server/pipeline/runPipeline.test.js` ("pairing top-four regression"), constructed so submission order and ranking order are deliberately different.

### P0.2 Adaptability is partly hardcoded — RESOLVED (Phase 1C, differently than expected)

~~`cross_scenario_consistency` is fixed at `75`.~~ The fabricated input was removed, not replaced with another constant or an invented formula (a real fix needs genuine multi-scenario execution, which is out of scope through Phase 1D — see Phase 3 in `docs/V2_ROADMAP.md`). `computeAdaptabilityScore()` (`server/domain/scoring.js`) now uses only the three real model-derived criteria, renormalized to sum to 1.0, and `cross_scenario_consistency` is honestly exposed as the literal string `"not_measured"` in `outcome_models`, `candidate_evaluations[].outcome_model`, and `adaptability_profiles`, instead of a silent internal-only fabricated number with zero API visibility. Adaptability profiles still use the current scenario as "best" and a generic crisis/pivot phrase as "worst" — that part is unchanged and still requires real multi-scenario execution to fix. See `docs/architecture/SCORING_AND_ASSUMPTIONS.md` for the exact before/after formula.

### P0.3 "Bias review" is mislabeled — RESOLVED (Phase 1C)

~~The current stage checks low confidence and short evidence... The name can create false confidence.~~ Renamed to "Confidence & Evidence Review" everywhere: the pipeline stage label, the SSE stage list, the `agent_outputs` entry (`agent_role` now explicitly states "not a demographic or legal bias audit"), the frontend stage list and "Confidence & Evidence Flags" card, and this document. The underlying check (confidence + evidence length) is unchanged — only the name and description, which no longer overclaim.

### P0.4 Model outputs lack strict validation — RESOLVED (Phase 1B)

~~Prompts request JSON, and the server repairs common syntax errors.~~ All six LLM operations now have production Zod schemas (`server/ai/schemas/`) with required properties, enums, numeric ranges, array/object shapes, and text-length limits. Every response is parsed, validated against its schema, and rejected (with one controlled retry) before it can reach deterministic calculations (`server/ai/providerBase.js`). The manual JSON-repair code (`sanitizeJSON`/`extractFirstJSON`) was removed along with the rest of the Anthropic-specific request path.

### P0.5 Fallback values can hide failed model assessments

Still open, though narrowed: the pairing stage's `?? default`-style fallbacks for individual metric fields were removed (the production schema now requires all six pairing metrics, so a response missing one is rejected and retried rather than defaulted). The pairing stage's *outer* fallback — returning a generic default pair when every pair call in a run fails — is unchanged and still means a result can look complete when the underlying evaluation didn't succeed for any pair.

### P0.6 Candidate scoring depends on very limited evidence

Still open — unchanged. Short user-written descriptions are treated as sufficient evidence for detailed leadership judgments. The source, completeness, and reliability of those descriptions are unknown.

## Priority 1 — architecture and maintainability

### P1.1 Oversized active files

Narrowed, not closed. The backend was split into clear module boundaries in Phase 1D (`server/config`, `server/ai`, `server/domain`, `server/pipeline`, `server/http`) — see `docs/architecture/CURRENT_ARCHITECTURE.md`. `server.mjs` itself is now a thin composition root. The frontend page is still one large file; Phase 1D only extracted `Results`/`EvalForm` as independently-exported components and moved `BACKEND_URL` out — a full feature-folder split remains Phase 2.

### P1.2 Duplicate and likely abandoned code

Still open — unchanged. Backup files, an older dataset, multiple unused component families, and generated UI primitives make it difficult to identify the real system. Deliberately not deleted in Phase 1 (out of scope per the phase's constraints); Phase 2 cleanup.

### P1.3 Duplicated contracts

Still open — unchanged. Pipeline types exist inside the active page and in `src/types/pipeline.ts`. They can drift independently and do not validate runtime data.

### P1.4 Hardcoded deployment configuration — PARTIALLY RESOLVED (Phase 1C)

~~The frontend backend URL and backend model identifier are hardcoded.~~ The frontend backend URL is now `VITE_BACKEND_URL`-configurable (`src/lib/backendUrl.ts`), with the previous hardcoded value kept only as a development fallback. The backend model identifier is configurable via `GROQ_MODEL`/`GEMINI_MODEL` (Phase 1A/1B). The application still assumes a single backend origin per environment and one configured provider at a time — by design, not as an unaddressed gap (see `docs/decisions/ADR-0003-runtime-provider-configuration.md`).

### P1.5 Provider integration is coupled to orchestration — RESOLVED (Phase 1B)

~~Prompt creation, HTTP transport, retries, parsing, and domain execution are all called from the same file.~~ Fixed: `server/ai/prompts/` (prompt creation), `server/ai/providers/` (transport + retries, via `server/ai/retry.js`), `server/ai/providerBase.js` (parsing + validation), and `server/domain/scoring.js` (domain execution) are now separate modules, composed by `server/pipeline/runPipeline.js`, which itself no longer performs any of those four responsibilities directly.

### P1.6 Current "agents" are functions, not autonomous agent boundaries

Still open — unchanged, and intentionally so (see `docs/decisions/ADR-0002-provider-abstraction.md`, "why Google ADK was not selected"). The functions have named responsibilities, but they do not independently select tools, plan, maintain durable memory, or control routing.

## Priority 2 — testing and AI evaluation

### P2.1 No meaningful unit tests — RESOLVED (Phase 1A/1D)

~~The existing Vitest test asserts that `true` is `true`.~~ 159 backend tests now cover deterministic formulas (with characterization tests pinning exact behavior before/after the P0.2 fix), normalization, all 6 production schemas' conversion and adapter round-trips, provider-contract behavior for both adapters, and full mocked pipeline execution including the P0.1/P0.2 regressions. The frontend placeholder test is supplemented (not fully replaced) by 10 tests covering real rendering behavior (`src/pages/Index.test.tsx`).

### P2.2 No route or stream integration tests — RESOLVED (Phase 1D)

~~Request validation, SSE event ordering, timeouts, and error propagation are untested.~~ `server/http/routes.test.js` (8 tests) exercises the real Express app on an ephemeral port: SSE stage ordering through to `complete`, error events for invalid input and for a failing pipeline stage (asserted to resolve within 5s — no hang), AI-unavailable handling, `/health` secret-safety, and both `/api/decision` success and 503 paths.

### P2.3 No model evaluation dataset

Still open — unchanged. There are no golden examples, expected score ranges, consistency checks, prompt regression tests, or human-labeled benchmarks. Deferred to Phase 3 (`docs/V2_ROADMAP.md`).

### P2.4 No reproducibility controls — RESOLVED (Phase 1B)

~~The response does not persist prompt version, model identifier returned by the provider, token usage, latency per model call, or model output snapshots.~~ Every response now includes `run_metadata`: provider, model, per-stage prompt/schema versions, per-stage attempt counts, and start/completion timestamps (`server/pipeline/runPipeline.js`). Token usage is captured by the adapters when the provider reports it but is not yet surfaced in `run_metadata` — a small follow-up, not a full persistence layer (still no database, by design).

## Priority 3 — security, privacy, and operations

### P3.1 No authentication or authorization

Still open — unchanged and explicitly out of scope through Phase 1D.

### P3.2 No rate limiting or budget controls

Still open — unchanged and explicitly out of scope through Phase 1D.

### P3.3 Broad CORS policy

Still open — unchanged.

### P3.4 No persistent audit trail

Still open. `run_metadata` (P2.4) is a step toward reproducibility but is per-response only — there is still no database record of who initiated an evaluation or a durable log across runs.

### P3.5 Candidate data is sent to an external provider

Still open, with one addition: `docs/decisions/ADR-0002-provider-abstraction.md` now documents a specific data-use restriction for unpaid Gemini use (synthetic/non-sensitive data only; real candidate data needs a separate privacy/consent/paid-service review). This is documentation and configuration guidance, not an enforced technical control — the underlying gap (no consent, minimization, retention, redaction, or deletion workflow) remains.

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
