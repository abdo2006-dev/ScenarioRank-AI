# Learning checkpoints

These questions are not documentation decoration. The maintainer should answer them verbally and, where appropriate, point to the relevant code.

## Phase 2B-1 understanding

1. Why are technical candidate ceilings in shared contracts while `AI_MAX_CANDIDATES` is resolved by the server?
2. How does `validateEvaluationDraft` turn shared-schema issues into stable candidate-ID field errors?
3. Why does the form validate before transitioning the workflow to `running`?
4. How do the error summary, live regions, and result focus preserve useful keyboard context?
5. Which WAI-ARIA tab attributes and keys make the result sections keyboard operable?

## Phase 0 understanding

1. Why is the current system better described as an LLM pipeline than a fully autonomous multi-agent system?
2. Why does deterministic ranking not make the whole system deterministic?
3. How does the frontend receive progress updates from a POST request?
4. Why is SSE more appropriate than WebSockets for the current progress stream?
5. What data leaves the application and is sent to the model provider?
6. Where is runtime validation missing even though TypeScript types exist?
7. Which files are definitely part of the active application path?
8. Why can unused dependencies and generated components mislead a recruiter about the real architecture?
9. Why should the original competition version be a tag and archive branch instead of remaining the default branch?
10. What is the difference between preserving historical code and maintaining two active product versions?

## Phase 1 understanding (provider migration and correctness fixes)

1. What is an adapter, concretely, in `server/ai/providers/`? What would change (and what wouldn't) if a second provider were added back?
2. Why does `runPipeline` depend on the `AIProvider` interface rather than importing the `openai` package directly, even though there is currently only one provider?
3. Why is Zod validation still required even though the OpenAI SDK's own `zodTextFormat()` helper already re-parses the result through the same Zod schema internally? Where in the code does the adapter's own second validation actually happen?
4. Where do retries occur, and why is there exactly one retry owner? What would go wrong if the SDK's own automatic retries were left enabled alongside it?
5. Why is one provider instance resolved once at process startup rather than once per request? What would break if a second provider instance were ever constructed mid-run?
6. Why was Google ADK not adopted for this migration? Why does ScenarioRank call its stages a "pipeline" rather than "agents" (docs/architecture/KNOWN_LIMITATIONS.md P1.6)?
7. Why must `.env.local` remain backend-only and untracked? What's the exact precedence between it, `.env`, and a real exported shell variable?
8. Why were the pairing top-four fix (Phase 1C) and the provider migration (Phase 1B) kept as separate, sequential changes instead of one combined change?
9. Show the exact code where `cross_scenario_consistency` used to be hardcoded, and explain why the fix removed the input entirely rather than computing a "better" number.
10. What exactly changed in `computeAdaptabilityScore()`'s output, and why was that an acceptable, intentional behavior change rather than a regression?
11. Why does the "Confidence & Evidence Review" stage not detect demographic or legal bias, despite its former name implying otherwise?
12. What does `run_metadata` contain, and what question would you use it to answer six months from now?
13. Trace what happens, end to end, when an OpenAI response fails schema validation: which file catches it, what happens on retry, and what the SSE client ultimately receives.

## Phase 1 post-simplification understanding (single OpenAI provider, request-count reduction)

1. Why did ScenarioRank remove Groq and Gemini instead of fixing the Groq rate-limit problem and keeping both? What real test result drove this decision (docs/decisions/ADR-0004-single-openai-provider.md)?
2. `gpt-5-mini` no longer appears on OpenAI's primary "Standard pricing" comparison table. Why was it still chosen as the default, and what real check (not documentation alone) confirmed it was the right choice?
3. What does "a logical pipeline stage does not necessarily equal one network request" mean in this codebase? Name the one logical stage that now covers two pipeline-stage records.
4. Why does a *missing* pair in a batch pairing response now fail the stage exactly like a *missing* candidate in a batch scoring response does — and why did an earlier round of this project tolerate a missing pair as a partial success, before that tolerance was removed?
5. What is the difference between `logicalProviderStageCount` and `providerAttemptCount` in `run_metadata`? Give a concrete scenario where they'd differ (docs/architecture/CURRENT_ARCHITECTURE.md).
6. Trace `LogicalStageLimitExceededError` (`server/ai/errors.js`): what does it actually protect against, and why does a stage's own retries or a batch-integrity corrective call never come close to tripping it? What is the difference between `AI_MAX_CANDIDATES` and the fixed `MAX_LOGICAL_PROVIDER_STAGES` constant — which one is about cost/output-size, and which is a bug safety net that isn't even configurable?
7. Where does `server/ai/pricing/openaiPricing.js` get its numbers from, and what does it return for a model it doesn't recognize? Why is that the correct behavior instead of extrapolating a guess?
8. Why does the OpenAI adapter call `schema.parse()` on the result a second time, even though `zodTextFormat()` already validated it once internally?
9. What's the difference between a refusal, an incomplete/truncated response, and a schema-validation failure in `server/ai/providers/openaiProvider.js`? Which of the three gets a bigger output-token budget on retry, and which never retries at all?
10. Why must a successful pairing result cover *every* expected top-four pair rather than whatever subset the model happened to return validly? What exact string does `pairing_result.reason` contain when this requirement isn't met after the corrective retry?
11. When a batch-integrity corrective retry succeeds on its second attempt, does the first (rejected) attempt's token usage still count toward `run_metadata`'s totals? Why or why not (`server/pipeline/runPipeline.js`'s `callBatchWithIntegrityRetry`)?

## Expected verbal architecture explanation

The maintainer should be able to explain the current system in approximately two minutes:

> The browser runs a React and TypeScript single-page application. It sends role, scenario, and candidate data to an Express backend. The backend resolves one OpenAI provider instance once at startup and calls it through a provider-neutral interface — never the `openai` package directly from the pipeline. A normal run uses at most four logical model-backed pipeline stages: one combined role-and-scenario analysis, one batch stage scoring every candidate, one batch stage evaluating every relevant pair among the top four ranked candidates (which must cover every expected pair to count as successful, never a subset), and one final explanation stage. This logical-stage count is fixed and separate from the real OpenAI attempt count, since a stage's own retry or a batch-integrity corrective call adds real attempts without adding a stage. Every response is validated against a Zod schema — twice, in the OpenAI adapter's case — before deterministic JavaScript functions normalize weights and calculate fit, confidence, risk, outcomes, ranking, and pair scores. Ranking is always computed before the LLM writes its explanation, and the LLM can never change it. The frontend uses a POST request with an SSE response so it can receive progress events while the pipeline runs, and the final response includes the logical-stage count, the real aggregated attempt count, how many tokens were used, and an estimated cost. The system currently has no database or authentication. Cross-scenario adaptability is honestly reported as not yet measured rather than a fabricated number, and several other outputs are still prototype heuristics that later phases will validate or correct.

## Proof exercises

- Draw the current component diagram from memory, including the `server/{config,ai,domain,pipeline,http}` boundary.
- Trace one candidate score from input text to final ranking, naming which files it passes through.
- Change the selected decision mode and explain why ranking can change without rescoring candidates.
- Show the exact code where a batch candidate-scoring response is mapped back to candidates by ID, and what happens if the model invents an ID that was never submitted.
- Show the exact code where the pairing top-four fix lives, and the regression test that would fail if it regressed.
- Show the exact code where `cross_scenario_consistency` is now returned as `"not_measured"`.
- Explain what happens if `OPENAI_API_KEY` is invalid at process startup in production versus in development.
- Explain what would break if the model returned a string instead of a number for a criterion score — which layer catches it now, and what happens next.
- Explain how a malicious public client could create API cost without rate limiting, and what `AI_MAX_CANDIDATES` and the fixed `MAX_LOGICAL_PROVIDER_STAGES` safety net do and do not protect against.
- Show the exact code where a batch pairing response missing one expected pair is rejected, and the exact reason string a caller sees if it's still incomplete after the corrective retry.

## Phase 2A understanding

1. Why are provider output schemas in `server/ai/schemas/` distinct from public transport schemas in `shared/contracts/`?
2. How do `z.infer` types in `src/features/decision/contracts.ts` prevent the browser's static types drifting from runtime validation?
3. How does `SseParser` handle chunk boundaries and why are unknown events ignored?
4. Why is a Node-to-Python rewrite not justified today (ADR-0006)?
5. Which public values are constrained to 0–1, 0–10, 0–100, or 0–4, and why
   must those transport invariants differ from provider prompt-output schemas?
6. What safe text does the UI show for malformed SSE JSON, and why must native
   JSON parser details never become user-facing errors?
7. Why does the SSE parser retain a pending `\r` between chunks, and what would
   go wrong if each chunk normalized CRLF independently?
8. Which messages may pass through `SafeDecisionClientError`, and why are raw
   fetch and stream-reader messages converted to generic text?
9. How do the result-tab and evaluation-editor directories keep their
   composition roots small?
10. Which successful-pairing invariants are public transport guarantees, and
    which complete-coverage guarantee remains internal to the pipeline?
