# ScenarioRank AI V2 documentation

These documents form the engineering baseline for the post-award V2 refinement.

## Start here

0. [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) — **read this first.** The living source of truth for the project's objective, current state, decisions made, and next step. Every other document here goes deeper on one part of it.
1. [`PHASE_0_BASELINE_AUDIT.md`](./PHASE_0_BASELINE_AUDIT.md) — what exists today and what Phase 0 establishes.
2. [`architecture/CURRENT_ARCHITECTURE.md`](./architecture/CURRENT_ARCHITECTURE.md) — components, responsibilities, and pipeline boundaries.
3. [`architecture/DATA_FLOW.md`](./architecture/DATA_FLOW.md) — how requests and data move through the system.
4. [`architecture/SCORING_AND_ASSUMPTIONS.md`](./architecture/SCORING_AND_ASSUMPTIONS.md) — formulas, AI-derived inputs, and unvalidated assumptions.
5. [`architecture/KNOWN_LIMITATIONS.md`](./architecture/KNOWN_LIMITATIONS.md) — prioritized correctness, architecture, operational, and ethical risks.
6. [`REPOSITORY_MAP.md`](./REPOSITORY_MAP.md) — which files are active, support code, generated code, or likely legacy.
7. [`BRANCH_STRATEGY.md`](./BRANCH_STRATEGY.md) — how the award snapshot is preserved while `main` becomes V2.
8. [`V2_ROADMAP.md`](./V2_ROADMAP.md) — staged modernization plan.
9. [`LEARNING_CHECKPOINTS.md`](./LEARNING_CHECKPOINTS.md) — conceptual questions the maintainer should be able to answer.

## Architecture decisions

- [`decisions/ADR-0001-main-is-v2.md`](./decisions/ADR-0001-main-is-v2.md) — why `main` is the public V2 line and the award version is preserved separately.
- [`decisions/ADR-0002-provider-abstraction.md`](./decisions/ADR-0002-provider-abstraction.md) — why Anthropic coupling was removed in favor of a provider-neutral contract (Groq default, Gemini optional), and why not Google ADK.
- [`decisions/ADR-0003-runtime-provider-configuration.md`](./decisions/ADR-0003-runtime-provider-configuration.md) — `.env`/`.env.local` precedence, one-provider-per-process-lifetime, and startup validation behavior.

These documents describe the current implementation honestly. They do not imply that planned V2 capabilities already exist.
