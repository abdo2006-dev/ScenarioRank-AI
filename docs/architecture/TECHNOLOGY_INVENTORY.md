# Technology inventory

## Runtime and application technologies

| Technology | Where it appears | Current purpose | Why it is a plausible hackathon choice | V2 observation |
|---|---|---|---|---|
| React 18 | frontend | Interactive single-page UI | Fast component development and large ecosystem | Keep initially; split the oversized page into feature components |
| TypeScript | frontend | Type annotations for UI state and responses | Improves editor support and catches some shape errors | Useful, but types are duplicated and runtime validation is absent |
| Vite | frontend tooling | Development server and production build | Simple, fast setup for React | Appropriate for this project |
| Tailwind CSS | frontend styling | Utility-based visual styling | Fast iteration without writing many CSS files | Keep if the team can maintain consistent components |
| Radix UI / shadcn-style files | UI component library | Toasts, tooltip provider, and generated primitives | Accessible primitives and rapid UI generation | Many generated components are not used by the active page |
| React Router | app shell | Root route and catch-all page | Standard client routing | Currently more infrastructure than the one-page app needs, but harmless |
| TanStack Query | app shell | Query client provider | Usually manages server state, caching, retries | Provider exists, but active requests use manual `fetch`; not meaningfully used yet |
| Node.js | backend runtime | Hosts Express and executes formulas | Same language family as frontend; fast hackathon iteration | Suitable, though V2 may deliberately evaluate Python/FastAPI for educational value |
| Express 5 | backend framework | HTTP routes and middleware | Minimal learning/setup overhead | Routes, orchestration, prompts, and formulas should be separated |
| Server-Sent Events | backend/frontend | Pipeline progress streaming | Simpler than WebSockets for one-way progress updates | A good fit for this one-way stream |
| OpenAI SDK (`openai`) | backend (`server/ai/providers/openaiProvider.js`) | **The only supported provider**, via the Responses API + Structured Outputs, for every pipeline LLM operation | `gpt-5-mini` was verified at implementation time to be available to this project's account, to support Structured Outputs, and to work correctly with the installed SDK — see `docs/decisions/ADR-0004-single-openai-provider.md` for the real-account probe. Groq and Gemini were real, tested integrations from an earlier phase, removed after neither could reliably complete a full run on its free tier | Bundles its own Zod-to-JSON-Schema helper (`openai/helpers/zod`), so this project no longer needs a standalone conversion package |
| Vitest | testing | Test runner | Native fit for Vite projects | Frontend: 16 tests (was 1 placeholder). Backend: 159 tests across scoring, schemas, the OpenAI adapter, pipeline (including batching, logical-stage vs. real-attempt accounting, and complete pair-coverage validation), and HTTP/SSE routes (was 0 — no config covered `server/` before Phase 1A) |
| Playwright | testing configuration | Intended browser testing | Good for full user-flow verification | Still configured but unused — no meaningful end-to-end tests exist yet |
| Zod | dependency | Schema validation | Common TypeScript validation library | **Live**: every production LLM operation is validated against a Zod schema (`server/ai/schemas/`) before any deterministic calculation runs — the OpenAI adapter validates twice (once via the SDK's own helper, once explicitly, defense in depth). No longer "installed but unused" in any sense |

## Data and infrastructure technologies not present

The current baseline does **not** include:

- SQL or NoSQL database;
- vector database or embeddings;
- RAG pipeline;
- user authentication or authorization;
- object storage;
- message queue or background workers;
- container definition;
- infrastructure-as-code;
- hosted deployment configuration;
- centralized logging, traces, or metrics;
- CI workflow;
- secret manager;
- model gateway or multi-provider routing.

These should not be added merely to make the architecture sound advanced. Each should be introduced only when it solves a concrete V2 requirement or creates a deliberate learning objective.

## Installed versus actually used

A package being listed in `package.json` does not mean it is part of the active architecture.

Examples:

- TanStack Query is initialized, but live API requests use manual `fetch` calls.
- Zod is installed, but current runtime validation is manual.
- Playwright is configured, but no substantive browser tests are present.
- many Radix/shadcn component files exist, but the active page renders mostly self-contained components.
- a static dataset and older component set exist, but the active route does not import them.

For recruiter-facing documentation, describe technologies according to their actual role, not according to the dependency list.

## Technology choices that should be revisited in Phase 1 or 2

1. **Backend language and framework** — retain Node/Express (ADR-0006); revisit Python only for a concrete Python-native workload or independently justified service boundary.
2. **Runtime validation** — Zod now validates both public HTTP/SSE transport (`shared/contracts/`) and internal provider output (`server/ai/schemas/`).
3. **Model integration** — a provider interface was introduced in Phase 1A (`server/ai/`) and the live pipeline was wired onto it in Phase 1B; the Anthropic-specific integration it replaced has been fully removed. The interface briefly supported two real providers (Groq, Gemini) before simplifying to one (OpenAI) after neither reliably completed a live end-to-end run on its free tier — see `docs/decisions/ADR-0004-single-openai-provider.md`.
4. **Persistence** — start with SQLite when run history, auditability, or evaluation datasets become requirements.
5. **Streaming** — retain SSE unless two-way realtime interaction becomes necessary.
6. **Testing** — unit-test deterministic formulas first, then route integration tests, then end-to-end flows with model calls mocked.
