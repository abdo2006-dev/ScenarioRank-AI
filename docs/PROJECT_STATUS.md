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
not an improvement, regardless of what else it accomplishes.

## Current architecture

- React + Vite frontend, Express/Node backend, no persistence layer.
- **The live pipeline still uses the Anthropic-specific `callClaudeJSON()`
  path in `server.mjs`.** Nothing described below is connected to it yet.
- Phase 1A added, but did not connect, a provider-neutral AI layer
  (`server/ai/`). Groq is intended to become the default runtime provider;
  Gemini is an optional experimental/comparison provider. **The new
  adapters are not yet used by the active evaluation pipeline.**
- Deterministic scoring has been extracted to
  [`server/domain/scoring.js`](../server/domain/scoring.js) — same
  formulas, same coefficients, same behavior as before the extraction.
- Backend provider and scoring foundations now have automated tests
  (previously, no backend test ran at all).

Details: [`architecture/CURRENT_ARCHITECTURE.md`](architecture/CURRENT_ARCHITECTURE.md),
[`architecture/TECHNOLOGY_INVENTORY.md`](architecture/TECHNOLOGY_INVENTORY.md),
[`decisions/ADR-0002-provider-abstraction.md`](decisions/ADR-0002-provider-abstraction.md).

## Completed milestones

### Phase 0 — completed

- Original competition version preserved (`bmw-award-original` tag +
  `archive/bmw-award-original` branch).
- `main` established as the public V2 line.
- Architecture, repository map, formulas, limitations, branch strategy,
  and roadmap documented.

### Phase 1A — completed through PR #1

- Deterministic scoring extracted with no intended behavior change.
- Backend Node Vitest configuration added (`server/**/*.test.js` now
  actually runs).
- Provider-neutral AI contract introduced (`server/ai/types.js`).
- Groq and Gemini adapters added.
- Shared retry ownership and a provider-neutral error taxonomy added.
- Zod-to-JSON-Schema conversion added.
- Provider-contract tests added (dependency-injected fake SDK clients, no
  real network calls).
- Focused backend JavaScript linting added (`npm run lint:server`).
- Gemini unpaid-tier data-use limitation documented.
- JSON Schema portability limitations documented.
- **The active pipeline intentionally remains on Anthropic until Phase 1B.**

**Phase 1A verification status:**

- 1 frontend test, 73 backend tests — all passing.
- Backend lint (`lint:server`) passes clean.
- Frontend build passes.
- Backend syntax check (`node --check server.mjs`) passes.
- The existing general lint baseline still has 3 errors and 7 warnings —
  pre-existing, not introduced by Phase 1A.
- The existing `npm audit` baseline remains 22 vulnerabilities —
  pre-existing, not introduced by Phase 1A.

## Current known correctness issues

None of these are fixed yet — recorded here so they aren't rediscovered
or accidentally claimed as resolved:

1. Pair simulation selects the first four submitted candidates instead of
   the top four ranked candidates.
2. Adaptability uses a hardcoded cross-scenario consistency value of `75`.
3. The Bias Agent is mainly a confidence/evidence review and is
   inaccurately named.
4. LLM self-reported confidence is not calibrated probability.
5. The active Anthropic path still uses manual JSON extraction and repair.
6. The active server and frontend files remain oversized.
7. The current frontend test is still largely a placeholder.
8. The general frontend/config lint baseline is not clean.
9. Existing dependency vulnerabilities require classification.
10. Authentication, rate limiting, persistence, privacy controls, and
    production deployment are later-phase work.

Full detail: [`architecture/KNOWN_LIMITATIONS.md`](architecture/KNOWN_LIMITATIONS.md).

## Decisions already made

- `main` represents ScenarioRank V2.
- Temporary implementation branches are merged and deleted; they are not
  permanent project branches.
- Groq and Gemini will be supported through provider adapters.
- Groq is intended as the default runtime provider.
- Gemini unpaid usage is limited to synthetic or explicitly non-sensitive
  data.
- Google ADK is not currently justified because ScenarioRank follows a
  controlled sequential pipeline rather than autonomous agent planning.
- Zod is the canonical local validation layer.
- Provider-side structured-output guarantees are never trusted without
  local validation.
- A single evaluation run must use one provider and one model
  consistently.
- No silent per-candidate or mid-run provider switching.
- The backend remains JavaScript/Node during Phase 1; Python/FastAPI
  remains a later architectural decision rather than an assumed migration.

## Next planned milestone

**Phase 1B — live provider cutover. Not started.**

Planned to:

- create production Zod schemas for the six active LLM stages;
- load and validate backend environment configuration;
- support `.env` and ignored `.env.local` safely;
- resolve one provider instance per evaluation run;
- migrate each `callClaudeJSON()` call site through the provider interface;
- make Groq the default configured provider;
- keep Gemini selectable for synthetic comparisons;
- preserve the existing SSE and frontend result contracts;
- remove Anthropic-specific code only after every stage has been migrated
  and verified;
- add provider/run metadata;
- test both adapters against every production schema.

## Later roadmap

Not immutable — expect this sequence to be refined as each phase completes:

- Phase 1C: correctness and honesty fixes.
- Phase 1D: testing completion, lint cleanup, dependency classification,
  and documentation.
- Phase 2: deeper backend/frontend modularization.
- Phase 3: real multi-scenario robustness and AI evaluation.
- Later phases: evidence-backed retrieval, security/privacy, deployment,
  observability, and interview-ready documentation.

Full detail: [`V2_ROADMAP.md`](V2_ROADMAP.md).

## Branch and pull-request status

- Phase 1A was implemented in `v2/phase-1a-provider-abstraction`.
- It was reviewed through PR #1.
- The temporary branch is deleted after merging.
- New implementation branches should only be created when work begins.
- Prefer one active implementation branch at a time.

## Learning checkpoints

Concepts the owner should understand before starting Phase 1B:

- What an adapter is.
- Why the pipeline depends on an interface rather than Groq directly.
- Why Zod validation is still required even when a provider guarantees
  structured output.
- Where retries occur, and why there is exactly one retry owner.
- Why the providers' own SDK-level retries were disabled.
- Why one provider is used for an entire evaluation, never mixed mid-run.
- Why Google ADK is not currently being used.
- Why `.env.local` must remain backend-only and untracked.
- Why provider migration (Phase 1B) and scoring/correctness fixes
  (Phase 1C) are kept as separate changes.

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
