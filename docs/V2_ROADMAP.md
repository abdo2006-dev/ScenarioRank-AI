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

Planned work:

1. select actual top-ranked candidates for pair simulation;
2. replace hardcoded cross-scenario consistency with real scenario evaluation or remove the claim temporarily;
3. rename “Bias & Confidence Review” to “Confidence & Evidence Review” until a real bias methodology exists;
4. replace misleading opportunity-cost terminology or implement a real comparative metric;
5. define strict request and model-output schemas;
6. validate criterion names, types, ranges, IDs, and decision modes;
7. make backend URL, provider, and model configurable;
8. remove false or unsupported product claims;
9. add unit tests for every deterministic formula and sorting mode;
10. add regression tests for the known correctness bugs.

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
