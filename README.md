# ScenarioRank AI V2

**Scenario-aware decision support for comparing leadership candidates under different business conditions.**

> **Project status:** V2 engineering refinement in progress. The `main` branch is the public source of truth and is intentionally being upgraded from the BMW hackathon implementation into a better-tested, better-documented, and more defensible system.

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
    P --> A[Configured provider: Groq default, Gemini optional]
    O --> D[Deterministic scoring: server/domain]
    A --> P
    P --> O
    D --> O
    O -->|stage updates + final JSON + run metadata| F
```

The current implementation is a sequential **LLM-assisted pipeline**, not a collection of fully autonomous agents. Several functions are named "agents," but orchestration, routing, and control remain in normal application code. Every LLM call goes through a provider-neutral contract (`server/ai/`) — never a vendor SDK directly — so the pipeline itself has no Groq- or Gemini-specific code in it. See [`docs/decisions/ADR-0002-provider-abstraction.md`](./docs/decisions/ADR-0002-provider-abstraction.md).

## Current request pipeline

1. **Role analysis — LLM:** derives evaluation criteria, base weights, must-haves, and complexity.
2. **Scenario analysis — LLM:** adjusts and normalizes weights for the selected business scenario.
3. **Candidate scoring — LLM:** scores each candidate across seven criteria and returns confidence, evidence, and reasoning.
4. **Deterministic scoring:** calculates weighted fit, risk dimensions, adaptability, expected outcome, and risk-adjusted scores.
5. **Confidence and evidence review — deterministic:** flags low confidence and weak evidence. Renamed from "Bias & Confidence Review" — it checks response confidence and evidence length, and is not a demographic or procedural bias audit.
6. **Decision explanation — deterministic ranking + LLM explanation:** code selects the ranking key and computes the winner before any LLM call; the LLM only generates explanations and summaries from the already-computed result and can never change it.
7. **Pair simulation — optional LLM + deterministic formula:** estimates pair-level metrics for the top four *ranked* candidates and computes a pair score.

Every LLM-backed stage is schema-validated (Zod) before its output is used, and every response includes `run_metadata` (provider, model, prompt/schema versions, attempts, timestamps). Detailed flow: [`docs/architecture/CURRENT_ARCHITECTURE.md`](./docs/architecture/CURRENT_ARCHITECTURE.md)

## Technology baseline

| Layer | Current technology | Current role |
|---|---|---|
| Frontend | React 18, TypeScript, Vite | Single-page interface and results rendering |
| Styling/UI | Tailwind CSS, selected Radix/shadcn components | Layout and interface primitives |
| Backend | Node.js, Express, ESM | API routes, orchestration, formulas, model calls |
| AI provider | Groq (default), Gemini (optional) via a provider-neutral contract | Role/scenario interpretation, candidate scoring, explanations, pair estimates |
| Streaming | Server-Sent Events | Sends pipeline stage updates and final results |
| Validation | Zod schemas for every LLM operation | All 6 production schemas validated locally before deterministic code runs |
| Persistence | None | Runs are not stored |
| Automated testing | 159 backend + 11 frontend tests | Schemas, providers, full mocked pipeline, SSE routes, and real component rendering |

Full inventory: [`docs/architecture/TECHNOLOGY_INVENTORY.md`](./docs/architecture/TECHNOLOGY_INVENTORY.md)

## Known baseline limitations

Fixed in Phase 1 (see [`docs/architecture/KNOWN_LIMITATIONS.md`](./docs/architecture/KNOWN_LIMITATIONS.md) for full before/after detail): pair simulation now selects the top four *ranked* candidates; the hardcoded cross-scenario-consistency value was removed and is now honestly reported as "not measured" rather than replaced with another invented number; the "bias" stage is renamed to "Confidence & Evidence Review"; model output is validated against strict Zod schemas; the frontend backend URL is environment-configurable.

Still open:

- "best" and "worst" adaptability scenarios are not genuinely simulated (needs real multi-scenario execution, Phase 3);
- the main frontend page is still oversized (backend module boundaries were split in Phase 1; frontend split is Phase 2);
- there is no authentication, rate limiting, persistence, audit trail, or cost tracking;
- the mathematical coefficients are prototype heuristics and have not been empirically calibrated.

See [`docs/architecture/KNOWN_LIMITATIONS.md`](./docs/architecture/KNOWN_LIMITATIONS.md).

## Local development

### Prerequisites

- Node.js 18 or newer
- A Groq API key for live AI evaluation (default provider), or a Gemini API key if you set `AI_PROVIDER=gemini`

### Setup

```bash
npm install

cp .env.example .env
# Add your key to .env:
# AI_PROVIDER=groq
# GROQ_API_KEY=your_key_here
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
- [ADR-0002: provider abstraction](./docs/decisions/ADR-0002-provider-abstraction.md)
- [ADR-0003: runtime provider configuration](./docs/decisions/ADR-0003-runtime-provider-configuration.md)

## Branch model

- `main` — public V2 source of truth; the branch visitors and recruiters see first.
- `archive/bmw-award-original` — frozen branch containing the competition snapshot.
- `bmw-award-original` — immutable annotated tag for the same snapshot.
- `v2/<work-item>` — short-lived implementation branches merged into `main` through focused pull requests.

The original result is preserved without forcing visitors to land on legacy code.
