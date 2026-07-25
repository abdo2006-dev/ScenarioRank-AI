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
| Anthropic Messages API | backend | Hosted LLM inference for the live pipeline | High-quality model access without model hosting | Still the live provider as of Phase 1A. A tested, provider-neutral abstraction exists at `server/ai/` (Phase 1A), but nothing in `server.mjs` calls it yet — cutover is Phase 1B |
| Groq SDK (`groq-sdk`) | backend (`server/ai/providers/groqProvider.js`) | Structured-output adapter, built and unit-tested in Phase 1A | Intended Phase 1B default provider; `openai/gpt-oss-120b` is one of only two Groq models with strict-mode (constrained-decoding) JSON Schema output | Not called by the live pipeline yet — see ADR-0002 |
| Google Gen AI SDK (`@google/genai`) | backend (`server/ai/providers/geminiProvider.js`) | Structured-output adapter, built and unit-tested in Phase 1A | Optional alternative provider for controlled comparison | Not called by the live pipeline yet — see ADR-0002. `GEMINI_MODEL` has no built-in default (model IDs change too often to hardcode) |
| Vitest | testing | Test runner | Native fit for Vite projects | Frontend: still one placeholder test. Backend: previously not run at all (no config covered `server/`); Phase 1A added a Node-environment config and 70 real tests |
| Playwright | testing configuration | Intended browser testing | Good for full user-flow verification | No meaningful end-to-end tests are present |
| Zod | dependency | Schema validation | Common TypeScript validation library | No longer merely installed-but-unused: Phase 1A's provider contract validates every (test-fixture) structured-generation result against a Zod schema. Not yet used by the live pipeline's real prompts — that's Phase 1B |
| `zod-to-json-schema` | backend (`server/ai/schemaConversion.js`) | Converts canonical Zod schemas into JSON Schema for both provider adapters | Installed Zod (3.25.76) has no native `toJSONSchema()` (Zod 4+ only) and neither SDK bundles a Zod helper; see ADR-0002 for why this was added instead of bumping Zod's major version | Small, single-purpose dependency; not used outside `server/ai/` |

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

1. **Backend language and framework** — keep Node/Express for incremental refactoring or migrate later to Python/FastAPI for stronger AI ecosystem exposure and Pydantic schemas.
2. **Runtime validation** — use Zod in Node or Pydantic in Python for API and model-output contracts.
3. **Model integration** — a provider interface was introduced in Phase 1A (`server/ai/`); wiring the live pipeline onto it is Phase 1B.
4. **Persistence** — start with SQLite when run history, auditability, or evaluation datasets become requirements.
5. **Streaming** — retain SSE unless two-way realtime interaction becomes necessary.
6. **Testing** — unit-test deterministic formulas first, then route integration tests, then end-to-end flows with model calls mocked.
