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

The health endpoint only checks whether an API key string exists. It does not confirm that the key is valid, the model is reachable, or the provider account has quota.

## 2. Scenario generation

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Backend
    participant A as Anthropic API

    F->>B: POST /api/scenarios { title, description }
    alt API key configured
        B->>A: Prompt requesting 3-5 scenario labels
        A-->>B: Model response text
        B->>B: Repair and parse JSON
        alt Valid non-empty scenarios
            B-->>F: { scenarios, source: "ai" }
        else Invalid result
            B->>B: Generate regex-based fallback scenarios
            B-->>F: { scenarios, source: "fallback" }
        end
    else No API key
        B->>B: Generate regex-based fallback scenarios
        B-->>F: { scenarios, source: "fallback" }
    end
```

## 3. Decision pipeline

```mermaid
sequenceDiagram
    participant F as Frontend
    participant B as Express/SSE route
    participant P as runPipeline
    participant A as Anthropic API
    participant M as Deterministic math

    F->>B: POST /api/decision/stream
    B-->>F: SSE headers
    B->>P: Validated request (partial validation)
    P-->>F: stage_update: input

    P->>A: Role analysis prompt
    A-->>P: Criteria and base weights
    P-->>F: stage_update: role complete

    P->>A: Scenario analysis prompt
    A-->>P: Weight deltas and pressures
    P->>M: Apply deltas and normalize weights
    P-->>F: stage_update: scenario complete

    loop Each candidate, max concurrency 2
        P->>A: Candidate scoring prompt
        A-->>P: Scores, confidence, evidence, reasoning
    end
    P-->>F: stage_update: scoring complete

    P->>M: Weighted fit and confidence
    P->>M: Confidence/evidence flags
    P->>M: Risk and outcome formulas
    P-->>F: stage_update: deterministic stages complete

    P->>M: Sort candidates by selected decision mode
    P->>A: Explanation prompt using sorted metrics
    A-->>P: Explanations, trade-offs, executive summary
    P-->>F: stage_update: decision complete

    opt Pair simulation enabled
        loop Every pair among first four input candidates
            P->>A: Pair assessment prompt
            A-->>P: Pair metric estimates
            P->>M: Pair score formula
        end
        P-->>F: stage_update: pairing complete
    end

    P-->>B: Final response object
    B-->>F: complete event
    F-->>F: Render results
```

## Trust boundaries

### Browser to backend

The browser is untrusted. Candidate names, descriptions, scenario text, option values, and IDs can be manipulated before reaching the backend. Current validation does not sufficiently constrain them.

### Backend to model provider

Candidate and role text leave the application boundary and are sent to an external model provider. V2 documentation must explain this data transfer and avoid sending unnecessary personal data.

### Model output to deterministic code

Model output is untrusted structured data. The baseline repairs JSON syntax and supplies some fallback values, but it does not validate exact keys, ranges, types, or semantic consistency before formulas use the output.

### Deterministic code to explanation model

The explanation prompt includes computed metrics. The LLM should explain them without modifying the ranking, but the final narrative can still contradict or overstate the numbers unless validated.

## Failure paths

- missing API key: scenario generation falls back; decision endpoints reject live evaluation;
- invalid model JSON: manual repair is attempted, then the pipeline fails;
- provider timeout or overload: selected calls receive one retry;
- total pipeline timeout: the route emits an error after 150 seconds;
- pair-call failures: failed pairs are skipped and a default pair may be returned;
- frontend timeout: the request is aborted after three minutes;
- page refresh: all current input and result state is lost.
