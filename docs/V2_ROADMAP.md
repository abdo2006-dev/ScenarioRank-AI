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

- **Phase 1A — provider abstraction and test foundation (done, on
  `v2/phase-1a-provider-abstraction`, not yet merged to `main`).** Added a
  real backend test runner (`server/**/*.test.js` under a Node-environment
  Vitest config, previously not executed at all); characterization-tested
  and verbatim-moved the deterministic scoring formulas to
  `server/domain/scoring.js`; built a provider-neutral contract
  (`server/ai/types.js`, `errors.js`, `providerFactory.js`) with tested Groq
  and Gemini adapters. **The active pipeline still calls Anthropic directly
  through `server.mjs`'s `callClaudeJSON()` — nothing in this subphase is
  wired into a real request yet.**
- **Phase 1B — structured-outputs cutover (not started).** Migrate the six
  `callClaudeJSON()` call sites onto the Phase 1A provider abstraction, one
  stage at a time, each verified end-to-end before the next; author the six
  production Zod schemas; retire the Anthropic-specific request/JSON-repair
  code once every stage is migrated.
- **Phase 1C — correctness fixes (not started).**
  1. select actual top-ranked candidates for pair simulation;
  2. relabel (not reformulate) hardcoded cross-scenario consistency — a
     real fix needs multi-scenario execution, deferred to Phase 3;
  3. rename “Bias & Confidence Review” to “Confidence & Evidence Review”;
  4. caveat LLM self-reported confidence as uncalibrated in copy.
- **Phase 1D — tests, cleanup, documentation (not started).** Route/SSE
  integration tests, pre-existing lint-error cleanup, dependency-audit
  classification, environment-safe backend URL configuration for the
  frontend, final documentation pass.

Deferred out of Phase 1 entirely (see `docs/architecture/KNOWN_LIMITATIONS.md`):
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
