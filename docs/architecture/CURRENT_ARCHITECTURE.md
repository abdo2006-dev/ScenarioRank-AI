# Current architecture

## Architecture type

The baseline is a small two-process web application:

- a client-rendered React single-page application;
- a Node.js/Express API process;
- a single externally hosted LLM provider — OpenAI (`gpt-5-mini`);
- no persistence layer.

It is best described as an **LLM-assisted sequential decision pipeline with deterministic scoring**, not as a fully autonomous multi-agent system, and (since Phase 1B) as **provider-neutral** — the pipeline calls an `AIProvider` interface, never a specific vendor's SDK directly, even though there is currently exactly one supported provider. Groq and Gemini were real, tested integrations from an earlier phase, removed after a live end-to-end test showed neither could reliably complete a full run on its free tier — see [`docs/decisions/ADR-0004-single-openai-provider.md`](../decisions/ADR-0004-single-openai-provider.md).

## Component diagram

```mermaid
flowchart TB
    subgraph Browser
        UI[Decision feature components]
        STATE[useDecisionEvaluation]
        SSE[Validated API client\nstateful SSE parser]
    end

    subgraph Backend[Node.js process]
        ENTRY[server.mjs\ncomposition root]
        HTTP[server/http\nExpress routes]
        PIPE[server/pipeline\nrunPipeline orchestrator]
        AI[server/ai\nprovider contract + adapters + schemas + prompts]
        MATH[server/domain/scoring.js\ndeterministic formulas]
    end

    PROVIDER[OpenAI: gpt-5-mini]

    UI --> STATE
    STATE --> HTTP
    ENTRY --> HTTP
    ENTRY --> AI
    HTTP --> PIPE
    PIPE --> AI
    AI --> PROVIDER
    PROVIDER --> AI
    PIPE --> MATH
    MATH --> PIPE
    PIPE --> HTTP
    HTTP --> SSE
    SSE --> STATE
```

## Frontend

### Entry path

```text
index.html
  -> src/main.tsx
  -> src/App.tsx
  -> src/pages/Index.tsx
```

### Phase 2A feature boundary

`src/pages/Index.tsx` only renders `DecisionScreen`. The active feature lives
under `src/features/decision/`:

- `api/` validates HTTP data, incrementally parses SSE, owns timeouts, and
  converts unsafe runtime failures into stable client errors;
- `hooks/useDecisionEvaluation.ts` owns editable workflow state and phase
  transitions;
- `components/DecisionScreen.tsx` composes the shell, phases, error banner, and
  result ref;
- `components/evaluation/` separates role, scenario, candidate, and decision
  option editing behind a small `EvaluationForm`;
- `components/results/` separates every result tab, criterion detail, and
  run-metadata footer behind a small `DecisionResults`;
- `contracts.ts` derives browser types from the shared runtime schemas.

ESLint and `scripts/check-decision-source-readability.mjs` enforce a
180-character maximum line length for active decision TypeScript/TSX.

### State model

The page uses local React state for:

- current phase: `landing`, `eval`, `running`, or `results`;
- role and scenario inputs;
- candidate profiles;
- selected decision mode;
- pair-simulation option;
- pipeline stages;
- final response and error state;
- backend AI availability.

No state is persisted across page refreshes.

## Backend

### Runtime

- Node.js using ECMAScript modules;
- Express 5;
- permissive CORS configuration;
- JSON request bodies up to 10 MB;
- calls OpenAI through `server/ai/`, never the `openai` package directly from route or pipeline code;
- environment loaded from `.env`/`.env.local` with real-process-env taking priority (`server/config/env.js`; see `docs/decisions/ADR-0003-runtime-provider-configuration.md`).

### Module boundaries (Phase 1D modularization; Phase 1 post-review simplification, ADR-0004)

| Directory | Responsibility |
|---|---|
| `server.mjs` | Composition root only: load env, resolve the OpenAI provider for the process's lifetime, build the app, listen |
| `server/config/` | `.env`/`.env.local` loading, provider-config validation, `AI_MAX_CANDIDATES` resolution (the fixed 4-logical-stage maximum is an internal `runPipeline.js` constant, not an environment setting resolved here) |
| `server/http/` | Express transport — CORS, JSON body parsing, the 4 routes, candidate-count rejection before the model is called. No orchestration or AI logic |
| `server/pipeline/` | `runPipeline()` orchestration, batch-identity validation (`mapBatchResultsById`/`mapPairResultsByIdentity`), the deterministic `confidenceEvidenceReview`/`outcomeModeling` stages, run-metadata assembly (including token usage and estimated cost) |
| `server/ai/` | `AIProvider` contract (`types.js`), error taxonomy (`errors.js`), the single retry owner (`retry.js`), `providerFactory.js`, `providers/openaiProvider.js` (the only adapter), `pricing/openaiPricing.js`, `schemas/`, `prompts/` |
| `server/domain/` | Pure deterministic scoring formulas (no I/O, no provider knowledge) |

This is a "reasonable boundary" split (explicit instruction in Phase 1D),
not a full rewrite: `server/pipeline/runPipeline.js` is still one file
covering every pipeline stage. The frontend monolith was resolved in Phase 2A.

### Public endpoints

| Method and path | Purpose |
|---|---|
| `GET /health` | Reports server liveness plus AI readiness (`ai_enabled`, `ai_provider`) — never a secret |
| `POST /api/scenarios` | Generates role-specific scenarios via the configured provider, or returns local regex-based fallbacks |
| `POST /api/decision` | Runs the full pipeline and returns one JSON response, including `run_metadata` |
| `POST /api/decision/stream` | Runs the same pipeline and streams stage updates using SSE |

## Pipeline stages

Every LLM-backed stage below calls `provider.generateStructured()` — the
one provider instance resolved at process startup (`server.mjs`) — with a
Zod schema from `server/ai/schemas/` and a prompt from
`server/ai/prompts/`. The response is parsed, retried at most once on
failure, and locally validated against that schema before any deterministic
code sees it (`server/ai/providers/openaiProvider.js`). No stage constructs
or selects a provider itself. A normal run uses **at most 4 logical
model-backed stages** (docs/decisions/ADR-0004-single-openai-provider.md)
— a fixed architectural fact, enforced internally by
`server/pipeline/runPipeline.js`'s `createStageBudget()` /
`MAX_LOGICAL_PROVIDER_STAGES` as a safety net against a future bug adding
a 5th call site. This is **not** the same claim as "at most 4 OpenAI API
requests": a logical stage's *real* attempt count (the adapter's own
retries, plus a batch-integrity corrective call for the two batch stages)
is tracked and reported separately as `run_metadata.providerAttemptCount`,
distinct from `run_metadata.logicalProviderStageCount`.

### 1. Input validation

The API checks that a role title and scenario exist, that at least two
candidates are supplied, and that the candidate count does not exceed
`AI_MAX_CANDIDATES` — rejected with a 400 before the model is ever called.
Validation is otherwise manual and incomplete; nested fields, string
lengths, allowed decision modes, duplicate IDs are not strictly enforced
at this layer — but the LLM *outputs* now are, via the production schemas.

### 2. Context analysis (1 logical stage)

Calls the provider with `contextAnalysisSchema` (`server/ai/schemas/contextAnalysis.schema.js`), which combines what used to be two separate requests — role analysis and scenario analysis — into one. The response has two clearly separated nested objects, `role_analysis` and `scenario_analysis`; the pipeline still records them as distinct `pipeline_stage_outputs` entries ("Role Analysis Stage", "Scenario Analysis Stage") and the frontend still displays them separately. A logical pipeline stage does not necessarily equal one network request. Application code applies weight deltas and normalizes the final weights to 100 (`server/domain/scoring.js`).

### 3. Batch candidate scoring (1 logical stage)

Calls the provider once with `buildBatchCandidateScoringSchema(maxCandidates)`, scoring every submitted candidate in a single request (previously one request per candidate, with concurrency limited to two). Each result carries the candidate's stable ID; `mapBatchResultsById()` (`server/pipeline/runPipeline.js`) maps results back to candidates by that ID — never by array position — and rejects the whole batch (with at most one corrective retry) if any ID is duplicated, missing, or unrecognized. Candidate scoring must be complete: unlike pairing (below), a missing result is never silently dropped or defaulted. Both the discarded first attempt and the corrective retry's real attempt/usage are aggregated into `run_metadata`, never discarded (`callBatchWithIntegrityRetry`).

### 4. Metric calculation

Normal JavaScript functions (`server/domain/scoring.js`) compute:

- weighted fit score;
- weighted confidence;
- execution risk;
- culture risk;
- time risk;
- adaptability score (Phase 1C: no longer includes a fabricated cross-scenario-consistency input — see `docs/architecture/SCORING_AND_ASSUMPTIONS.md`);
- expected outcome score;
- risk-adjusted score.

These formulas are deterministic given the LLM-produced criterion values and weights.

### 5. Confidence and evidence review

`confidenceEvidenceReview()` (`server/pipeline/runPipeline.js`; renamed from "Bias & Confidence Review" in Phase 1C — see `docs/architecture/KNOWN_LIMITATIONS.md` P0.3) checks:

- criterion confidence below `0.65`;
- overall confidence below `0.60` or `0.65` depending on the decision;
- evidence text shorter than 15 characters;
- the number of low-confidence criteria.

It does not test protected characteristics, proxy variables, disparate treatment, consistency across demographic variants, or historical outcome bias, and its name no longer implies that it does.

### 6. Outcome modeling

`outcomeModeling()` is a deterministic pipeline stage, not an LLM call. It derives risk and outcome labels. **Phase 1C fix:** `cross_scenario_consistency` is no longer a fabricated `75` — it is honestly returned as the literal string `"not_measured"`, and the adaptability-score formula no longer uses that input at all (see `docs/architecture/SCORING_AND_ASSUMPTIONS.md`).

### 7. Batch pairing analysis (1 logical stage, optional)

When pairing is enabled, the pipeline derives the top four candidates from this run's actual deterministic ranking (sorted by whichever `decision_mode` was selected — Phase 1C fix, P0.1), builds every relevant pair (up to C(4,2) = 6), and evaluates them all in a single request via `batchPairingAnalysisSchema` (previously one request per pair). **A successful pairing result means every expected pair was returned and validated — `mapPairResultsByIdentity()` rejects a missing, duplicate, or unrequested pair alike; a subset is never classified as a successful "best pair" analysis.** A batch missing coverage gets one corrective retry; if the batch is still incomplete afterward, `pairing_result` is honestly `{"status":"unavailable", "reason": "Complete pair analysis was unavailable.", "best_pair": null, "top_pairs": []}` — never a fabricated or partial pair (docs/architecture/KNOWN_LIMITATIONS.md P0.5). The attempts and any usage genuinely consumed while trying — even when the stage ultimately fails — are still recorded in `run_metadata`, never silently dropped. Valid pairs are converted into a deterministic pair score (`server/domain/scoring.js`'s `computePairScore`).

### 8. Decision generation (1 logical stage)

Application code first sorts candidates deterministically:

- `weighted_fit_score` for `best_fit`;
- `risk_adjusted_score` for `lowest_risk`;
- `expected_outcome_score` for `best_outcome`.

The provider then calls `decisionExplanationSchema` to write explanations, trade-offs, and an executive summary from the already-computed ranking (and, when pairing succeeded or was attempted, an already-known pairing summary the model may reference but never invent or contradict). This ranking-then-explanation order — enforced structurally, not just by convention — is the project's core non-negotiable boundary (`docs/PROJECT_STATUS.md`), and `server/pipeline/runPipeline.test.js` includes a boundary test proving the winner cannot change based on explanation wording.

## Communication model

The frontend normally uses `POST /api/decision/stream`. The backend sends:

- `stage_update` events containing the current stage list;
- one `complete` event containing the final response, including `run_metadata`;
- an `error` event when the pipeline fails;
- comment heartbeats every 15 seconds to keep the connection open.

This SSE contract is unchanged from the pre-migration implementation — the provider swap was designed to be invisible to the frontend. The frontend manually parses the SSE stream from a `fetch()` response rather than using `EventSource`, because the request requires a POST body.

## Run metadata

Every completed pipeline response includes:

```json
{
  "provider": "openai",
  "model": "gpt-5-mini",
  "logicalProviderStageCount": 4,
  "providerAttemptCount": 5,
  "inputTokens": 3200,
  "cachedInputTokens": 0,
  "outputTokens": 1800,
  "reasoningTokens": 0,
  "totalTokens": 5000,
  "estimatedCostUsd": 0.0044,
  "promptVersions": { "context": "v1", "scoring": "v1", "...": "..." },
  "schemaVersions": { "context": "v1", "scoring": "v1", "...": "..." },
  "attempts": { "context": 1, "scoring": 2, "...": 1 },
  "startedAt": "2026-...",
  "completedAt": "2026-..."
}
```

`logicalProviderStageCount` is the number of logical model-backed pipeline stages used (a fixed architectural fact, bounded at 4 — see "Pipeline stages" above); `providerAttemptCount` is the real, aggregated number of OpenAI attempts actually made, including every retry and batch-integrity corrective call, whether or not that call's result was ultimately used — the two numbers can differ (in the example above, the scoring stage needed one corrective retry, so `providerAttemptCount` is 5 even though there are only 4 logical stages). `estimatedCostUsd` is computed from actual token usage against a small versioned pricing table (`server/ai/pricing/openaiPricing.js`) and is `null`, never a guessed number, for any model that table doesn't explicitly recognize. Token/cost totals are only aggregated from attempts that returned a completed response with usage data — an attempt that fails before returning any response body (e.g. an auth or connection error) has no usage to report, so the estimate can honestly under-report true spend in that case; it is a displayed estimate for the user's own budget awareness, not an invoice — OpenAI's own billing dashboard remains the source of truth. No secrets. Supports later debugging and reproducibility without adding a database.

## Data and persistence

The baseline has no database. Inputs and outputs exist only in browser memory and the current HTTP request. There is no run history, audit log, evaluation dataset, user account, or retention/deletion workflow.

## Deployment architecture

The repository does not define a production deployment topology. It assumes:

- frontend development server on port 5173;
- backend server on port 3001 (configurable via `PORT`);
- frontend code calling a configurable backend URL (`VITE_BACKEND_URL`, default `http://localhost:3001`).

V2 has replaced the hardcoded-URL assumption with environment-specific configuration (Phase 1C/1D); a documented production deployment model remains later-phase work (`docs/V2_ROADMAP.md`).

## Phase 2A transport boundary

Public browser/server data is validated by shared ESM Zod contracts in
`shared/contracts/decisionApi.js`. `server/http/routes.js` parses requests and
validates health, SSE events, and successful final responses. The browser API
client validates health, scenario generation, progress, error, and complete
events before feature state consumes them. These contracts are deliberately
separate from the LLM provider schemas in `server/ai/schemas/`.

Malformed SSE JSON becomes a fixed safe transport error in the browser.
Scenario-generation provider failures still return valid local fallback
scenarios, but provider and SDK error text never cross the HTTP boundary.
The parser retains a trailing carriage return between network chunks, so a
split CRLF is consumed as one newline and cannot create an accidental blank
line or premature event dispatch. It dispatches only on a complete blank-line
terminator and discards an unterminated event at end of stream.

The health response is a discriminated union: enabled responses require
non-empty provider/model strings, while disabled responses require both values
to be `null`. Decision confidence is 0–1, stage durations are nonnegative
integers, and successful public pairing results require distinct candidate IDs,
non-empty unique `top_pairs`, and the complete `best_pair` entry in that list.
Candidate IDs are the canonical pair identity; names are display labels, so two
different candidates may share a name. Each completed pair reference is checked
against `candidate_evaluations` for both ID existence and ordered name/ID
agreement. Pairing-enabled SSE and JSON route integrations exercise this final
transport check.
