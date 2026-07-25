# Data flows

## 1. Application startup and health check

```mermaid
sequenceDiagram
    participant U as User browser
    participant F as React frontend
    participant B as Express backend

    U->>F: Open application
    F->>B: GET /health
    B-->>F: { status, ai_enabled }
    F-->>U: Show whether live AI evaluation is available
```

The health endpoint checks whether the configured provider (Groq or Gemini, `server/config/env.js`) has its required key/model present. It does not confirm the key is valid, the model is reachable, or the provider account has quota.

## 2. Scenario generation

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant P as server/ai (provider contract)
    participant A as Configured AI Provider (Groq/Gemini)

    F->>B: POST /api/scenarios { title, description }
    alt AI enabled
        B->>P: generateStructured(scenarioGenerationSchema)
        P->>A: Structured-output request
        A-->>P: Schema-conforming JSON (validated locally)
        alt Valid non-empty scenarios
            B-->>F: { scenarios, source: "ai" }
        else Invalid/failed result
            B->>B: Generate regex-based fallback scenarios
            B-->>F: { scenarios, source: "fallback" }
        end
    else AI unavailable
        B->>B: Generate regex-based fallback scenarios
        B-->>F: { scenarios, source: "fallback" }
    end
```

## 3. Decision pipeline

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Express/SSE route (server/http)
    participant P as runPipeline (server/pipeline)
    participant AI as server/ai (provider contract)
    participant A as Configured AI Provider (Groq/Gemini)
    participant M as Deterministic math (server/domain)

    F->>B: POST /api/decision/stream
    B-->>F: SSE headers
    B->>P: Validated request (partial validation) + the one resolved provider
    P-->>F: stage_update: input

    P->>AI: generateStructured(roleAnalysisSchema)
    AI->>A: Structured-output request
    A-->>AI: Response (validated locally against the schema)
    AI-->>P: Criteria and base weights
    P-->>F: stage_update: role complete

    P->>AI: generateStructured(scenarioAnalysisSchema)
    AI->>A: Structured-output request
    A-->>AI: Response (validated)
    AI-->>P: Weight deltas and pressures
    P->>M: Apply deltas and normalize weights
    P-->>F: stage_update: scenario complete

    loop Each candidate, max concurrency 2
        P->>AI: generateStructured(candidateScoringSchema)
        AI->>A: Structured-output request
        A-->>AI: Response (validated)
        AI-->>P: Scores, confidence, evidence, reasoning
    end
    P-->>F: stage_update: scoring complete

    P->>M: Weighted fit and confidence
    P->>M: Confidence/evidence flags (Confidence & Evidence Review)
    P->>M: Risk and outcome formulas (cross_scenario_consistency: "not_measured")
    P-->>F: stage_update: deterministic stages complete

    P->>M: Sort candidates by selected decision mode (ranking is final here)
    P->>AI: generateStructured(decisionExplanationSchema) using sorted metrics
    AI->>A: Structured-output request
    A-->>AI: Response (validated)
    AI-->>P: Explanations, trade-offs, executive summary
    P-->>F: stage_update: decision complete

    opt Pair simulation enabled
        loop Every pair among the top four RANKED candidates
            P->>AI: generateStructured(pairingAnalysisSchema)
            AI->>A: Structured-output request
            A-->>AI: Response (validated)
            AI-->>P: Pair metric estimates
            P->>M: Pair score formula
        end
        P-->>F: stage_update: pairing complete
    end

    P-->>B: Final response object + run_metadata
    B-->>F: complete event
    F-->>F: Render results
```

## Trust boundaries

### Browser to backend

The browser is untrusted. Candidate names, descriptions, scenario text, option values, and IDs can be manipulated before reaching the backend. Current validation does not sufficiently constrain them.

### Backend to model provider

Candidate and role text leave the application boundary and are sent to an external model provider. V2 documentation must explain this data transfer and avoid sending unnecessary personal data.

### Model output to deterministic code

Model output is untrusted structured data. Every LLM operation's response is now validated against a production Zod schema (`server/ai/schemas/`) — exact keys, enums, numeric ranges, and array/object shapes are enforced, with one controlled retry on failure — before any deterministic formula sees it (`server/ai/providerBase.js`). Semantic consistency (e.g., "is this evidence actually about this candidate") is still not validated — schemas check shape and range, not meaning.

### Deterministic code to explanation model

The explanation prompt includes computed metrics. The LLM should explain them without modifying the ranking, but the final narrative can still contradict or overstate the numbers unless validated.

## Failure paths

- missing/invalid provider configuration: in development, scenario generation falls back and decision endpoints reject live evaluation (503); in production, the process fails to start at all (`docs/decisions/ADR-0003-runtime-provider-configuration.md`);
- schema-invalid or malformed model output: one controlled retry with a sanitized validation summary (never raw output), then the stage fails;
- provider timeout, rate limit, or transient server error: one controlled retry, then the stage fails;
- total pipeline timeout: the route emits an error after 150 seconds;
- pair-call failures: failed pairs are skipped and a default pair may be returned;
- frontend timeout: the request is aborted after three minutes;
- page refresh: all current input and result state is lost;
- no silent provider fallback: a failing Groq call is never silently retried against Gemini, or vice versa.
