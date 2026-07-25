# Learning checkpoints

These questions are not documentation decoration. The maintainer should answer them verbally and, where appropriate, point to the relevant code.

## Phase 0 understanding

1. Why is the current system better described as an LLM pipeline than a fully autonomous multi-agent system?
2. Which stages call Anthropic, and which stages run only normal JavaScript calculations?
3. Why does deterministic ranking not make the whole system deterministic?
4. How does the frontend receive progress updates from a POST request?
5. Why is SSE more appropriate than WebSockets for the current progress stream?
6. What happens when the Anthropic key is missing?
7. What data leaves the application and is sent to the model provider?
8. Where is runtime validation missing even though TypeScript types exist?
9. Why is model self-reported confidence not the same as a calibrated probability?
10. Which current adaptability values are calculated, and which are hardcoded?
11. Why does pair simulation currently use the wrong four candidates?
12. Which files are definitely part of the active application path?
13. Why can unused dependencies and generated components mislead a recruiter about the real architecture?
14. Why should the original competition version be a tag and archive branch instead of remaining the default branch?
15. What is the difference between preserving historical code and maintaining two active product versions?

## Expected verbal architecture explanation

The maintainer should be able to explain the current system in approximately two minutes:

> The browser runs a React and TypeScript single-page application. It sends role, scenario, and candidate data to an Express backend. The backend orchestrates a fixed sequence of model calls and deterministic calculations. Anthropic interprets the role and scenario, scores candidate descriptions, and writes explanations. JavaScript functions normalize weights and calculate fit, confidence, risk, outcomes, ranking, and pair scores. The frontend uses a POST request with an SSE response so it can receive progress events while the pipeline runs. The system currently has no database or authentication, and several outputs—especially cross-scenario adaptability—are still prototype assumptions that V2 will correct.

## Proof exercises

- Draw the current component diagram from memory.
- Trace one candidate score from input text to final ranking.
- Change the selected decision mode and explain why ranking can change without rescoring candidates.
- Show the exact code where candidate-scoring concurrency is limited.
- Show the exact code where the pair-selection bug occurs.
- Show the exact code where cross-scenario consistency is hardcoded.
- Explain what would break if the model returned a string instead of a number for a criterion score.
- Explain how a malicious public client could create API cost without rate limiting.
