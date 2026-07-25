# V2 roadmap

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
