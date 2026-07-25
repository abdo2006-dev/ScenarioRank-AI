# Phase 0 baseline audit

## Purpose

Phase 0 preserves the BMW competition implementation, documents the real system, establishes the public V2 branch model, and records known assumptions before behavior is changed.

Phase 0 is intentionally documentation-first. It should make later refactoring safer by ensuring that the team can distinguish:

- current behavior from planned behavior;
- LLM interpretation from deterministic computation;
- active files from generated or abandoned files;
- genuine system capabilities from presentation labels;
- validated logic from prototype heuristics.

## Baseline snapshot

The uploaded/public baseline contains:

- a React and TypeScript frontend built with Vite;
- a Node.js and Express backend in one `server.mjs` file;
- direct calls to the Anthropic Messages API;
- Server-Sent Events for progress updates;
- deterministic scoring functions embedded in the backend;
- no database, authentication, rate limiting, or persistent audit history;
- a placeholder Vitest test rather than meaningful automated coverage.

## Current scale and concentration

At the time of this audit:

- `server.mjs` is approximately 807 lines;
- `src/pages/Index.tsx` is approximately 1,252 lines;
- `src/pages/Index.tsx.bak` and `server.mjs.bak` remain in the repository;
- multiple component sets and a static dataset exist but are not reached from the active application entrypoint;
- the current public repository reports seven commits and uses `main` as its default branch.

Line counts are diagnostic, not quality scores. The issue is that unrelated responsibilities are combined in a small number of files, making reasoning, testing, replacement, and ownership more difficult.

## Current architectural boundary

The strongest existing design choice is the partial separation between model interpretation and deterministic math:

- the LLM derives criteria, weights, candidate scores, explanations, and pair estimates;
- normal code normalizes weights and computes weighted fit, risks, expected outcome, risk-adjusted ranking, and pair scores;
- the ranking mode is selected by application code;
- the final explanation is generated after deterministic ranking.

This is worth preserving and strengthening.

## What Phase 0 changes

Phase 0 adds or updates:

- a V2-focused public README;
- an environment-variable template;
- architecture, data-flow, scoring, limitations, repository-map, roadmap, and learning documents;
- a branch strategy and architecture decision record;
- visible version labels from “v3” to “V2” on the active application;
- no intentional scoring, API, or UI behavior changes.

## What Phase 0 does not change

Phase 0 does not yet:

- fix the pair-selection bug;
- replace hardcoded adaptability values;
- rename or redesign the bias/confidence stage in the API;
- split the backend or frontend;
- add strict request/response schemas;
- add production security controls;
- add persistence or a database;
- migrate to Python or FastAPI;
- add RAG, embeddings, or an agent framework;
- validate the formulas against real hiring outcomes.

Those belong to later phases and should be implemented through focused pull requests.

## Phase 0 acceptance criteria

Phase 0 is complete when:

- [ ] the current competition commit is tagged `bmw-award-original`;
- [ ] a frozen `archive/bmw-award-original` branch points to the same commit;
- [ ] `main` remains the GitHub default branch and receives the V2 baseline documentation;
- [ ] the README clearly separates current capabilities from V2 goals;
- [ ] the current architecture and request flows are documented;
- [ ] prototype assumptions and hardcoded values are recorded;
- [ ] active and likely legacy files are mapped;
- [ ] no API keys or `.env` files are committed;
- [ ] baseline build, lint, and tests are run and their real results are recorded in the pull request;
- [ ] the next branch is `v2/phase-1-correctness`.

## Baseline verification record

This artifact was prepared from the uploaded repository snapshot. Dependency installation and a full build could not be independently completed in the artifact environment because external package access was unavailable. The Phase 0 pull request must therefore record the actual local outputs of:

```bash
npm ci
npm run lint
npm test
npm run build
```

Do not write “all checks pass” unless those commands have been run successfully on the exact commit being merged.
