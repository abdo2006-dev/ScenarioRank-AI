# Known limitations

This file records limitations before they are fixed. Removing an item requires a pull request containing implementation evidence and tests.

## Priority 0 — correctness and integrity

### P0.1 Pair simulation uses submission order

The pair stage receives candidates in the original input order and then calls `slice(0, 4)`. It therefore evaluates the first four submitted candidates, not the top four ranked candidates described by the UI and README.

### P0.2 Adaptability is partly hardcoded

`cross_scenario_consistency` is fixed at `75`. Adaptability profiles use the current scenario as “best” and a generic crisis/pivot phrase as “worst.” No multi-scenario execution occurs.

### P0.3 “Bias review” is mislabeled

The current stage checks low confidence and short evidence. It does not implement a defensible bias-detection method. The name can create false confidence.

### P0.4 Model outputs lack strict validation

Prompts request JSON, and the server repairs common syntax errors. Exact keys, types, ranges, missing fields, extra fields, and semantic contradictions are not enforced with runtime schemas.

### P0.5 Fallback values can hide failed model assessments

Pair metrics use default values when fields are missing, and the pair stage can return a generic default pair when all pair calls fail. A result can therefore appear valid even when evaluation failed.

### P0.6 Candidate scoring depends on very limited evidence

Short user-written descriptions are treated as sufficient evidence for detailed leadership judgments. The source, completeness, and reliability of those descriptions are unknown.

## Priority 1 — architecture and maintainability

### P1.1 Oversized active files

The active frontend and backend mix presentation, state, transport, validation, model calls, domain logic, and orchestration.

### P1.2 Duplicate and likely abandoned code

Backup files, an older dataset, multiple unused component families, and generated UI primitives make it difficult to identify the real system.

### P1.3 Duplicated contracts

Pipeline types exist inside the active page and in `src/types/pipeline.ts`. They can drift independently and do not validate runtime data.

### P1.4 Hardcoded deployment configuration

The frontend backend URL and backend model identifier are hardcoded. The application assumes localhost and one provider/model.

### P1.5 Provider integration is coupled to orchestration

Prompt creation, HTTP transport, retries, parsing, and domain execution are all called from the same file.

### P1.6 Current “agents” are functions, not autonomous agent boundaries

The functions have named responsibilities, but they do not independently select tools, plan, maintain durable memory, or control routing. This is not necessarily bad, but the architecture should be described accurately.

## Priority 2 — testing and AI evaluation

### P2.1 No meaningful unit tests

The existing Vitest test asserts that `true` is `true`. Formula edge cases, normalization, sorting modes, pair selection, and JSON parsing are untested.

### P2.2 No route or stream integration tests

Request validation, SSE event ordering, timeouts, and error propagation are untested.

### P2.3 No model evaluation dataset

There are no golden examples, expected score ranges, consistency checks, prompt regression tests, or human-labeled benchmarks.

### P2.4 No reproducibility controls

The response does not persist prompt version, model identifier returned by the provider, token usage, latency per model call, or model output snapshots.

## Priority 3 — security, privacy, and operations

### P3.1 No authentication or authorization

Any reachable client can invoke the model-backed endpoints.

### P3.2 No rate limiting or budget controls

A public deployment could be abused to consume API quota.

### P3.3 Broad CORS policy

The server accepts requests from arbitrary origins.

### P3.4 No persistent audit trail

There is no database record of who initiated an evaluation, what inputs were used, which model/prompt version ran, or how the decision was produced.

### P3.5 Candidate data is sent to an external provider

The system lacks consent, minimization, retention, redaction, deletion, and privacy documentation.

### P3.6 No observability

Console logs are not sufficient for production monitoring. There are no structured logs, metrics, traces, provider cost records, or alerting.

### P3.7 No deployment or rollback definition

The repository has no container, CI/CD workflow, environment matrix, health/readiness distinction, or rollback procedure.

## Priority 4 — methodological and ethical limitations

### P4.1 Formula coefficients are unvalidated heuristics

The coefficients may be useful for demonstration but are not established predictors of real hiring success.

### P4.2 Confidence is not calibrated

Model self-reported confidence should not be interpreted as probability of correctness.

### P4.3 Criteria may encode subjective or proxy judgments

Terms such as culture fit, executive presence, and stakeholder trust can reproduce subjective preferences unless carefully defined and reviewed.

### P4.4 Human oversight is not enforced

The UI can recommend a candidate, but there is no workflow requiring evidence review, disagreement handling, or final human sign-off.

### P4.5 Opportunity cost is currently misnamed

The formula averages selected risks rather than comparing the benefits forgone by choosing one candidate instead of another.
