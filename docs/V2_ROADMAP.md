# V2 roadmap

## Phase 2B-1 — validation and accessibility

**Goal:** constrain public inputs consistently and make the controlled React
workflow usable with keyboards and assistive technology. Shared contracts own
technical text/count ceilings, while `AI_MAX_CANDIDATES` remains the resolved
per-run backend budget cap exposed safely through `/health`. This phase does not
start Phase 2B-2 or Phase 3.

## Phase 0 — preserve and understand

**Goal:** establish a trustworthy baseline before changing behavior.

- preserve the original competition commit as a tag and archive branch;
- make `main` the public V2 line;
- document architecture, data flow, technologies, formulas, assumptions, and limitations;
- map active and legacy files;
- record honest baseline verification results;
- standardize public V2 naming.

## Phase 1 — correctness and honesty

**Goal:** fix misleading or incorrect behavior without changing the core product concept.

Phase 1 is split into four subphases so the provider swap, the correctness
fixes, and the test/documentation work stay independently reviewable and
revertable. See `docs/decisions/ADR-0002-provider-abstraction.md` for the
provider-architecture reasoning.

- **Phase 1A — provider abstraction and test foundation. Done, merged to
  `main`** (PR #1, squash commit `f6d3058`). Added a real backend test
  runner, characterization-tested and moved deterministic scoring to
  `server/domain/scoring.js`, built the provider-neutral contract with
  tested Groq and Gemini adapters. The active pipeline still called
  Anthropic directly at the end of this subphase.
- **Phase 1B — structured-outputs cutover. Done.** All six former
  `callClaudeJSON()` call sites (role analysis, scenario analysis,
  candidate scoring, decision explanation, pairing, scenario generation)
  now go through `provider.generateStructured()` with production Zod
  schemas (`server/ai/schemas/`) and extracted prompts
  (`server/ai/prompts/`). One provider instance is resolved once at
  process startup and reused for the process's entire lifetime — a
  stronger guarantee than "once per run." The Anthropic-specific request
  path, its manual JSON repair, and its environment variable have all been
  removed (see `docs/decisions/ADR-0003-runtime-provider-configuration.md`).
  Run metadata (provider, model, prompt/schema versions, attempts,
  timestamps) is included in every response.
- **Phase 1C — correctness fixes. Done.**
  1. pairing selects the actual top four ranked candidates, with a
     regression test proving submission order no longer matters;
  2. the hardcoded `cross_scenario_consistency: 75` was removed (not
     replaced by another constant) — the adaptability formula now uses
     only real model-derived criteria, and the concept is honestly exposed
     as `"not_measured"` in the API. Real multi-scenario measurement is
     still Phase 3;
  3. "Bias & Confidence Review" renamed to "Confidence & Evidence Review"
     everywhere (stage label, SSE, frontend, `agent_outputs`, docs);
  4. UI confidence labels now read "Model conf." with a tooltip clarifying
     it is not a calibrated probability;
  5. the frontend backend URL is now `VITE_BACKEND_URL`-configurable.
- **Phase 1D — tests, cleanup, documentation. Done.** 159 backend tests
  (was 0 running at all before Phase 1A) and 11 frontend tests (was 1
  placeholder) including full mocked-pipeline, provider-contract, and
  SSE-route coverage; the pre-existing general lint baseline (3 errors, 7
  warnings) is now 0 problems; `npm audit` went from 22 to 9
  vulnerabilities via safe in-range fixes only (no `--force`, no major
  version bumps); the backend was split into `server/{config,ai,domain,
  pipeline,http}` module boundaries; this full documentation pass.
- **Phase 1 post-review corrections — Done, on the same PR #2 (not yet
  merged; not a new phase number).** A review of the completed Phase
  1B/1C/1D work (PR #2) found remaining behavior/terminology that still
  contradicted the honesty and technical-defensibility goals above.
  Corrected on `v2/phase-1-completion`, still awaiting explicit approval
  to merge:
  1. candidate-scoring concurrency is now a configurable, validated
     `AI_CANDIDATE_CONCURRENCY` env var (default 1) instead of a hardcoded
     `2`, resolved once by `server.mjs` and passed down explicitly —
     `server/pipeline/runPipeline.js` never reads `process.env` itself;
  2. the pairing stage's remaining fabricated "Default pair" fallback (P0.5
     above described this as narrowed, not fully resolved — it is now
     fully resolved) was removed; an all-pairs-failed run now returns an
     honest `{"status":"unavailable", ...}` result instead of an invented
     pair;
  3. `adaptability_profiles[].best_scenario`/`.worst_scenario` no longer
     claim a candidate performs best in the current scenario or would
     struggle in a "Rapid crisis/pivot scenario" — both are always
     `"not_measured"` until real multi-scenario execution exists (Phase 3);
  4. `bias_confidence_reviews`/`bias_flags` were renamed to
     `confidence_evidence_reviews`/`confidence_evidence_flags` (no
     compatibility alias kept — this is still pre-production);
  5. `agent_outputs`/`agent_name`/`agent_role` and every "X Agent" stage
     display name were renamed to `pipeline_stage_outputs`/`stage_name`/
     `stage_role`/"X ... Stage" (backend, frontend rendering, and the
     live-progress "Decision Pipeline" heading, previously "Agent
     Pipeline") — ScenarioRank is a fixed orchestrated pipeline, not a
     multi-agent architecture (P1.6);
  6. stale header comments on `server/ai/providers/groqProvider.js` and
     `geminiProvider.js` claiming they were "not wired into the active
     pipeline" (true in Phase 1A, false since Phase 1B) were corrected.

  See `docs/PROJECT_STATUS.md` for the exact test counts, verification
  results, and the real Groq/Gemini end-to-end retest at concurrency 1
  (both failed to complete — see the next entry).
- **Phase 1 single-OpenAI-provider simplification — Done, on the same PR
  #2 (not yet merged; not a new phase number).** The real Groq/Gemini
  retest above showed neither provider could reliably complete a full run
  on its free tier. Rather than keep chasing quota/token-budget fixes for
  two providers with no actual product requirement to run more than one,
  ScenarioRank simplified to a single provider and reduced request count:
  Groq and Gemini adapters, tests, and dependencies removed entirely;
  `server/ai/providers/openaiProvider.js` added as the only `AIProvider`
  implementation (OpenAI Responses API + Structured Outputs, model
  `gpt-5-mini` verified live against the project's own account); a normal
  run reduced from six-to-nine provider requests to at most 4 by combining
  role+scenario analysis into one request and batching candidate scoring
  and pairing analysis (previously one request per candidate/pair) into
  one request each, with real-world-identity validation (never array
  position) and an honest failure/partial-success policy per stage;
  `AI_MAX_CANDIDATES`/`AI_MAX_PROVIDER_REQUESTS_PER_RUN` safety nets added;
  full cost/usage visibility (`run_metadata.estimatedCostUsd` and token
  counts) added via a small versioned pricing table. See
  `docs/decisions/ADR-0004-single-openai-provider.md` for the full
  reasoning and `docs/PROJECT_STATUS.md` for the real OpenAI smoke test
  result (reached `complete` successfully, ~1 cent). **Superseded in part
  by the metadata/pairing-completeness correction round below** —
  `AI_MAX_PROVIDER_REQUESTS_PER_RUN` and `providerRequestCount` were later
  renamed/removed in favor of `logicalProviderStageCount`/
  `providerAttemptCount`, and pairing's "partial success" tolerance was
  later removed in favor of requiring complete pair coverage.
- **Phase 1 metadata/pairing-completeness correction round — Done, on the
  same PR #2 (not yet merged; not a new phase number).** A further review
  found the request-count terminology from the round above still
  conflated a fixed architectural count with the real, variable number of
  OpenAI attempts, and found the pairing stage's "tolerate a missing pair
  as partial success" design (deliberately built in the round above)
  overstated what was actually evaluated. Corrected on the same branch,
  `v2/phase-1-completion`, still awaiting explicit approval to merge:
  1. `run_metadata` now reports `logicalProviderStageCount` (the fixed,
     non-configurable architectural count of model-backed stages, at most
     4) separately from `providerAttemptCount` (the real, aggregated count
     of OpenAI attempts across every stage, including retries and
     batch-integrity corrective calls, which can exceed 4).
     `AI_MAX_PROVIDER_REQUESTS_PER_RUN`/`providerRequestCount` are removed
     entirely; `LogicalStageLimitExceededError` (renamed from
     `ProviderRequestBudgetExceededError`) is the safety net, backed by a
     fixed internal constant rather than an environment setting;
  2. `callBatchWithIntegrityRetry` (`server/pipeline/runPipeline.js`) now
     aggregates attempts and token usage across every call in its retry
     loop, including a rejected first attempt whose result was later
     superseded — real API spend is never silently discarded from
     `run_metadata` just because the call's output wasn't used;
  3. `mapPairResultsByIdentity()` now requires complete coverage of every
     expected top-four pair — a missing pair is rejected exactly like a
     duplicate or unknown one, with one corrective retry, then an honest
     `{"status":"unavailable","reason":"Complete pair analysis was
     unavailable.","best_pair":null,"top_pairs":[]}` result. A successful
     pairing result now always means every expected pair was evaluated,
     never a subset;
  4. `estimatedCostUsd`'s known limitation — that usage is only available
     from attempts with a completed response, so a hard-failed attempt's
     real spend is excluded from the displayed total even though it still
     counts toward `providerAttemptCount` — is now documented explicitly
     in `server/ai/pricing/openaiPricing.js` rather than left implicit;
  5. stale comments in `server/ai/retry.js` describing the old
     Groq/Gemini-era retry setup were corrected to describe the current
     single-retry-owner reality.

  See `docs/PROJECT_STATUS.md` for the exact test counts and verification
  results for this round.

Deferred out of Phase 1 entirely, unchanged (see `docs/architecture/KNOWN_LIMITATIONS.md`):
replacing misleading opportunity-cost terminology with a real comparative
metric, and a defensible bias-detection methodology — both need design
work beyond a correctness fix.

## Phase 2 — architecture and maintainability

**Goal:** create explicit boundaries without unnecessary complexity.

- split API transport, orchestration, AI integration, domain formulas, and response assembly;
- split the frontend into feature components, API client, schemas, and hooks;
- use one source of truth for contracts;
- remove confirmed dead code and backup files;
- introduce model-provider abstraction;
- version prompts and record prompt metadata;
- decide whether to retain Node/Express or migrate the backend to Python/FastAPI through an ADR.

## Phase 3 — reliability and evaluation

**Goal:** measure whether the AI behavior is stable and useful.

- create representative evaluation fixtures;
- mock provider calls for deterministic integration tests;
- add golden-output and prompt-regression checks;
- measure run-to-run score variance;
- record model, prompt version, latency, token usage, and cost;
- add structured error classes, retries, and cancellation;
- add CI for lint, unit tests, integration tests, and build.

## Phase 4 — evidence-grounded intelligence

**Goal:** add advanced AI only where it improves the decision process.

Potential capabilities:

- document upload and text extraction;
- evidence chunking and retrieval;
- embeddings and vector search for source-grounded scoring;
- citations from every criterion score to exact evidence;
- explicit “insufficient evidence” outcomes;
- real multi-scenario simulation;
- sensitivity analysis and rank stability;
- counterfactual tests that remove names or irrelevant attributes;
- human comparison and override workflows.

RAG, a vector database, or an agent framework should be introduced only with a written requirement and architecture decision record.

## Phase 5 — security, privacy, and deployment

**Goal:** make a safe public demonstration and document what production would require.

- authentication and role-based access where needed;
- rate limits, quotas, and budget controls;
- restricted CORS;
- secret management;
- data minimization, redaction, deletion, and retention controls;
- persisted audit records;
- structured logs, metrics, and traces;
- containerized deployment;
- environment-specific configuration;
- health/readiness checks and rollback documentation;
- explicit human oversight and responsible-use warnings.

## Definition of success

V2 is successful when the maintainer can:

- draw the architecture without looking at the repository;
- trace a request from user action to final result;
- identify every point where an LLM is used and why;
- explain which outputs are deterministic and which are probabilistic;
- justify the technology choices and alternatives;
- describe failure, security, privacy, cost, and scale limitations;
- run and interpret the test suite;
- defend the project honestly in a technical interview.

## Phase 2 — maintainability and application boundaries

### Phase 2A — contracts and frontend structure (done)

Shared Zod public HTTP/SSE contracts now live in `shared/contracts/`; provider
schemas remain internal. The active frontend uses a decision feature folder
with a dedicated API/SSE client and workflow hook. Dead frontend generations,
the stale types, dataset, and backup files were removed. ADR-0005 records the
contract choice and ADR-0006 retains Node/Express.

### Phase 2B — 2B-1 and 2B-2 done

Phase 2B-1 added application-level input validation and an
accessibility-oriented prototype review. **Phase 2B-2 (done, draft PR open,
not merged)** removed the unreachable generated shadcn/Radix template set
under `src/components/ui/` (55 files) and three dead helper files, simplified
`App.tsx` to only the root providers something active actually uses,
removed 45 now-unused npm dependencies, standardized on npm as the sole
package manager, reduced `npm audit` findings from 9 to 4 with safe in-range
fixes only, and added a reintroduction guard
(`npm run check:unused-template`). A narrow correction pass in the same
phase then removed the residual `src/lib/utils.ts`/`components.json`/
`src/App.css`/Playwright-stub template debt the first pass had left behind,
renamed the generated root package identity to `scenariorank-ai`, rewrote
the public static demo (`public/demo.html`) to describe the current
OpenAI/gpt-5-mini pipeline instead of the retired award-build architecture,
and corrected a documentation error about the Vite/esbuild remediation path
(see below). Full detail: `docs/PROJECT_STATUS.md` ("Phase 2B-2") and
`docs/security/DEPENDENCY_AUDIT.md`. This was not Phase 3 reliability or
model-evaluation work, and changed no scoring, prompt, or provider behavior.

The Phase 2A correction round completed component boundaries, API-client and
workflow-hook tests, safe SSE/scenario transport errors, and public numeric
contract bounds. Phase 3 remains future work. Two dependency major-version
migrations were deliberately deferred out of Phase 2B-2 — `react-router-dom`
(`6.x`→`7.x`) and `vite` (`5.x`→`6.x`, corrected during the Phase 2B-2
narrow correction pass from an earlier, incorrect `5.x`→`8.x` claim; the
real minimum patched Vite release is `6.4.3`, one major version up, not
two) — see `docs/security/DEPENDENCY_AUDIT.md` for why and the exact
remediation path; either can be scheduled independently of Phase 3.
