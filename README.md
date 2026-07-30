# ScenarioRank AI V2

**Scenario-aware decision support for comparing leadership candidates under different business conditions.**

> **Project status:** Phase 2B-1 is implemented on the unmerged
> `v2/phase-2b-validation-accessibility` branch. It adds shared input limits,
> accessible validation, focus management, and keyboard-operable result tabs
> without changing Phase 1 scoring or provider behavior.

ScenarioRank AI received **Best Implementation** in a BMW-related competition. The original award-winning snapshot is preserved separately as the [`bmw-award-original`](https://github.com/abdo2006-dev/ScenarioRank-AI/tree/bmw-award-original) tag and [`archive/bmw-award-original`](https://github.com/abdo2006-dev/ScenarioRank-AI/tree/archive/bmw-award-original) branch.

## Why V2 exists

The competition version demonstrated a strong product idea and a complete end-to-end user experience, but it also contains hackathon-era shortcuts. V2 is a deliberate post-award engineering effort to:

- make the architecture explicit and understandable;
- separate LLM interpretation from deterministic decision logic;
- remove hardcoded or misleading outputs;
- validate all model responses and API inputs;
- add meaningful automated tests and evaluation cases;
- improve security, observability, deployment, and documentation;
- make every important design choice explainable in an interview or technical review.

This repository documents both what currently exists and what will change. See [`docs/`](./docs/README.md) — start with [`docs/PROJECT_STATUS.md`](./docs/PROJECT_STATUS.md) for the current state, decisions made, and next planned step.

## Important scope statement

ScenarioRank is a **research and decision-support prototype**, not an autonomous hiring system. It must not make final employment decisions, automatically reject candidates, or replace qualified human review. Current scores are based on model interpretation and prototype heuristic formulas; they are not validated predictions of job performance.

## Current baseline architecture

```mermaid
flowchart LR
    U[User] --> F[React + TypeScript frontend]
    F -->|GET /health| B[Node.js + Express backend]
    F -->|POST /api/scenarios| B
    F -->|POST /api/decision/stream via SSE| B
    B --> O[Pipeline orchestrator: server/pipeline]
    O --> P[Provider-neutral AI contract: server/ai]
    P --> A[OpenAI: gpt-5-mini]
    O --> D[Deterministic scoring: server/domain]
    A --> P
    P --> O
    D --> O
    O -->|stage updates + final JSON + run metadata + cost estimate| F
```

The current implementation is a sequential **LLM-assisted pipeline**, not a collection of fully autonomous agents. Every LLM call goes through a provider-neutral contract (`server/ai/`) — never a vendor SDK directly from the pipeline — so `runPipeline.js` has no OpenAI-specific code in it, even though there is currently exactly one supported provider. See [`docs/decisions/ADR-0004-single-openai-provider.md`](./docs/decisions/ADR-0004-single-openai-provider.md) for why Groq and Gemini (both real, tested integrations from an earlier phase) were removed rather than kept as dormant alternatives, and [`docs/decisions/ADR-0002-provider-abstraction.md`](./docs/decisions/ADR-0002-provider-abstraction.md) for why the contract itself still exists with a single provider.

Phase 2A keeps the user flow but gives the browser a feature boundary:
`src/features/decision/api` owns validated HTTP/SSE transport,
`hooks/useDecisionEvaluation.ts` owns workflow state, and `components/`
separates the screen, landing, evaluation, progress, results, and display
primitives. Public payloads are Zod schemas in `shared/contracts/`; provider
schemas remain internal to `server/ai/schemas/`.

## Current request pipeline

A normal evaluation (up to `AI_MAX_CANDIDATES` candidates, pairing enabled) uses **at most 4 logical model-backed pipeline stages** — a fixed architectural fact, not the same claim as "at most 4 OpenAI API requests": each logical stage can take more than one real attempt (a schema-validation or truncation retry, or a batch-integrity corrective call), which is why the response separately reports `logicalProviderStageCount` (bounded at 4) and `providerAttemptCount` (the real, aggregated attempt total, which can be higher):

1. **Combined context analysis — LLM, one logical stage:** derives evaluation criteria, base weights, must-haves, complexity, and the scenario's weight adjustments together. The UI still shows "Role Analysis" and "Scenario Analysis" as separate pipeline stages — one provider call now produces both; a logical pipeline stage does not necessarily equal one network request.
2. **Batch candidate scoring — LLM, one logical stage:** scores every submitted candidate across seven criteria in a single request, returning confidence, evidence, and reasoning per candidate. Results are mapped back to candidates by a stable ID, never by array position; a duplicate, missing, or unknown result is rejected (with at most one corrective retry, whose real attempt is added to the total, never discarded), never silently defaulted.
3. **Deterministic scoring:** calculates weighted fit, risk dimensions, adaptability, expected outcome, risk-adjusted scores, and the top-four ranking.
4. **Confidence and evidence review — deterministic:** flags low confidence and weak evidence. Not a demographic or procedural bias audit.
5. **Batch pairing analysis — optional LLM, one logical stage:** evaluates every relevant pair among the top four *ranked* candidates in a single request. **A successful pairing result means every expected pair was returned and validated — a subset is never classified as a successful "best pair" analysis.** Any missing, duplicate, or unrequested pair is rejected (with one corrective retry); if the batch is still incomplete afterward, the response honestly reports `{"status":"unavailable","reason":"Complete pair analysis was unavailable.", ...}` — never a fabricated or partial pair.
6. **Decision explanation — deterministic ranking + LLM explanation:** code selects the ranking key and computes the winner before this call; the LLM only generates explanations and summaries from the already-computed result (optionally referencing the pairing result) and can never change the ranking.

Every LLM-backed stage is schema-validated (Zod) before its output is used. Every response includes `run_metadata`: provider, model, `logicalProviderStageCount`, `providerAttemptCount`, input/cached-input/output/reasoning/total token counts, an estimated cost (or `null` for an unrecognized model — never a guessed number), prompt/schema versions, attempts, and timestamps. Token/cost totals are only ever aggregated from attempts that returned a completed response with usage data — an attempt that fails before returning any response body has no usage to report, so the estimate can honestly under-report true spend in that case; see `server/ai/pricing/openaiPricing.js`. Detailed flow: [`docs/architecture/CURRENT_ARCHITECTURE.md`](./docs/architecture/CURRENT_ARCHITECTURE.md)

## Technology baseline

| Layer | Current technology | Current role |
|---|---|---|
| Frontend | React 18, TypeScript, Vite | Single-page interface and results rendering |
| Styling/UI | Tailwind CSS, selected Radix/shadcn components | Layout and interface primitives |
| Backend | Node.js, Express, ESM | API routes, orchestration, formulas, model calls |
| AI provider | OpenAI (`gpt-5-mini`) via a provider-neutral contract, Responses API + Structured Outputs | Role/scenario interpretation, batch candidate scoring, explanations, batch pair estimates |
| Streaming | Server-Sent Events | Sends pipeline stage updates and final results |
| Validation | Zod public HTTP/SSE contracts and provider schemas | `shared/contracts/` validates browser/server transport; `server/ai/schemas/` validates provider output before deterministic code runs |
| Persistence | None | Runs are not stored |
| Automated testing | 191 backend + 91 frontend tests | Schemas, the OpenAI adapter, full mocked pipeline (batching, logical-stage vs. attempt-count accounting, complete pair-coverage validation), SSE routes, and focused accessible component rendering |

Full inventory: [`docs/architecture/TECHNOLOGY_INVENTORY.md`](./docs/architecture/TECHNOLOGY_INVENTORY.md)

## Known baseline limitations

Fixed in Phase 1 (see [`docs/architecture/KNOWN_LIMITATIONS.md`](./docs/architecture/KNOWN_LIMITATIONS.md) for full before/after detail): pair simulation now selects the top four *ranked* candidates; the hardcoded cross-scenario-consistency value was removed and is now honestly reported as "not measured" rather than replaced with another invented number; the "bias" stage is renamed to "Confidence & Evidence Review"; model output is validated against strict Zod schemas; the frontend backend URL is environment-configurable; the pipeline runs on a single, real-account-verified OpenAI model instead of two providers neither of which could reliably complete a full run on its free tier (see ADR-0004).

Still open:

- "best" and "worst" adaptability scenarios are not genuinely simulated (needs real multi-scenario execution, Phase 3);
- Phase 2B-1 includes validation and an accessibility-oriented prototype review; it is not a WCAG certification and still needs the documented manual checks;
- there is no authentication, rate limiting, persistence, audit trail, or a hard dollar-budget enforcement (only a request-count safety net);
- the mathematical coefficients are prototype heuristics and have not been empirically calibrated;
- displayed cost is an estimate for the user's own awareness, not an invoice — OpenAI's own billing dashboard remains the source of truth.

See [`docs/architecture/KNOWN_LIMITATIONS.md`](./docs/architecture/KNOWN_LIMITATIONS.md).

## Local development

### Prerequisites

- Node.js 18 or newer
- An OpenAI API key for live AI evaluation

### Setup

```bash
npm install

cp .env.example .env
# Add your key to .env:
# OPENAI_API_KEY=your_key_here
# OPENAI_MODEL=gpt-5-mini
```

Prefer `.env.local` over editing `.env` directly for real credentials — it's git-ignored and takes precedence. See [`docs/decisions/ADR-0003-runtime-provider-configuration.md`](./docs/decisions/ADR-0003-runtime-provider-configuration.md).

Run the backend:

```bash
node server.mjs
```

Run the frontend in a second terminal:

```bash
npm run dev
```

Default local addresses:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Health check: `http://localhost:3001/health`

Never commit `.env` or API keys.

## V2 documentation

- [Phase 0 baseline audit](./docs/PHASE_0_BASELINE_AUDIT.md)
- [Current architecture](./docs/architecture/CURRENT_ARCHITECTURE.md)
- [Data flows](./docs/architecture/DATA_FLOW.md)
- [Technology inventory](./docs/architecture/TECHNOLOGY_INVENTORY.md)
- [Scoring model and assumptions](./docs/architecture/SCORING_AND_ASSUMPTIONS.md)
- [Known limitations](./docs/architecture/KNOWN_LIMITATIONS.md)
- [Repository map](./docs/REPOSITORY_MAP.md)
- [Branch strategy](./docs/BRANCH_STRATEGY.md)
- [V2 roadmap](./docs/V2_ROADMAP.md)
- [Learning checkpoints](./docs/LEARNING_CHECKPOINTS.md)
- [ADR-0001: main is the V2 line](./docs/decisions/ADR-0001-main-is-v2.md)
- [ADR-0002: provider abstraction (superseded by ADR-0004)](./docs/decisions/ADR-0002-provider-abstraction.md)
- [ADR-0003: runtime provider configuration](./docs/decisions/ADR-0003-runtime-provider-configuration.md)
- [ADR-0004: single OpenAI provider](./docs/decisions/ADR-0004-single-openai-provider.md)

## Branch model

- `main` — public V2 source of truth; the branch visitors and recruiters see first.
- `archive/bmw-award-original` — frozen branch containing the competition snapshot.
- `bmw-award-original` — immutable annotated tag for the same snapshot.
- `v2/<work-item>` — short-lived implementation branches merged into `main` through focused pull requests.

The original result is preserved without forcing visitors to land on legacy code.
