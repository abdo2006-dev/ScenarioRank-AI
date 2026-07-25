# Learning checkpoints

These questions are not documentation decoration. The maintainer should answer them verbally and, where appropriate, point to the relevant code.

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

1. What is an adapter, concretely, in `server/ai/providers/`? What would change (and what wouldn't) if a third provider were added?
2. Why does `runPipeline` depend on the `AIProvider` interface rather than importing `groq-sdk` or `@google/genai` directly?
3. Why is Zod validation still required even though Groq's strict mode and Gemini's structured output both claim to guarantee schema-conforming JSON? Where in the code does that validation actually happen?
4. Where do retries occur, and why is there exactly one retry owner? What would go wrong if the SDK's own automatic retries were left enabled alongside it?
5. Why is one provider instance resolved once at process startup rather than once per request? What would break if a second provider instance were ever constructed mid-run?
6. Why was Google ADK not adopted for this migration, given ScenarioRank calls itself an "agent pipeline"?
7. Why must `.env.local` remain backend-only and untracked? What's the exact precedence between it, `.env`, and a real exported shell variable?
8. Why were the pairing top-four fix (Phase 1C) and the provider migration (Phase 1B) kept as separate, sequential changes instead of one combined change?
9. Show the exact code where `cross_scenario_consistency` used to be hardcoded, and explain why the fix removed the input entirely rather than computing a "better" number.
10. What exactly changed in `computeAdaptabilityScore()`'s output, and why was that an acceptable, intentional behavior change rather than a regression?
11. Why does the "Confidence & Evidence Review" stage not detect demographic or legal bias, despite its former name implying otherwise?
12. What does `run_metadata` contain, and what question would you use it to answer six months from now?
13. Trace what happens, end to end, when a Groq response fails schema validation: which file catches it, what happens on retry, and what the SSE client ultimately receives.

## Expected verbal architecture explanation

The maintainer should be able to explain the current system in approximately two minutes:

> The browser runs a React and TypeScript single-page application. It sends role, scenario, and candidate data to an Express backend. The backend resolves one configured AI provider (Groq by default, Gemini as an optional alternative) once at startup and calls it through a provider-neutral interface — never a vendor SDK directly from the pipeline. The provider interprets the role and scenario, scores candidate descriptions, and writes explanations; every one of those responses is validated against a Zod schema before deterministic JavaScript functions normalize weights and calculate fit, confidence, risk, outcomes, ranking, and pair scores. Ranking is always computed before the LLM writes its explanation, and the LLM can never change it. The frontend uses a POST request with an SSE response so it can receive progress events while the pipeline runs. The system currently has no database or authentication. Cross-scenario adaptability is honestly reported as not yet measured rather than a fabricated number, and several other outputs are still prototype heuristics that later phases will validate or correct.

## Proof exercises

- Draw the current component diagram from memory, including the `server/{config,ai,domain,pipeline,http}` boundary.
- Trace one candidate score from input text to final ranking, naming which files it passes through.
- Change the selected decision mode and explain why ranking can change without rescoring candidates.
- Show the exact code where candidate-scoring concurrency is limited.
- Show the exact code where the pairing top-four fix lives, and the regression test that would fail if it regressed.
- Show the exact code where `cross_scenario_consistency` is now returned as `"not_measured"`.
- Explain what happens if a configured provider's API key is invalid at process startup in production versus in development.
- Explain what would break if the model returned a string instead of a number for a criterion score — which layer catches it now, and what happens next.
- Explain how a malicious public client could create API cost without rate limiting.
