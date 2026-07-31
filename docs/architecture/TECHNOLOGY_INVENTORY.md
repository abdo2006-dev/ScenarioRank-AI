# Technology inventory

## Runtime and application technologies

| Technology | Where it appears | Current purpose | Why it is a plausible hackathon choice | V2 observation |
|---|---|---|---|---|
| React 18 | frontend | Interactive single-page UI | Fast component development and large ecosystem | Keep initially; split the oversized page into feature components |
| TypeScript | frontend | Type annotations for UI state and responses | Improves editor support and catches some shape errors | Useful, but types are duplicated and runtime validation is absent |
| Vite | frontend tooling | Development server and production build | Simple, fast setup for React | Appropriate for this project |
| Tailwind CSS | frontend styling | Utility-based visual styling | Fast iteration without writing many CSS files | Keep if the team can maintain consistent components |
| React Router | app shell | Root route and catch-all page | Standard client routing | Currently more infrastructure than the one-page app needs, but harmless. `npm audit` flags a moderate open-redirect/XSS advisory with no patched `6.x` release — deferred as a separate major-version (`6`→`7`) follow-up; this app's two static routes have no dynamic navigation target, so the vulnerable feature isn't exercised today (`docs/security/DEPENDENCY_AUDIT.md`) |
| Node.js | backend runtime | Hosts Express and executes formulas | Same language family as frontend; fast hackathon iteration | Suitable, though V2 may deliberately evaluate Python/FastAPI for educational value |
| Express 5 | backend framework | HTTP routes and middleware | Minimal learning/setup overhead | Routes, orchestration, prompts, and formulas should be separated |
| Server-Sent Events | backend/frontend | Pipeline progress streaming | Simpler than WebSockets for one-way progress updates | A good fit for this one-way stream |
| OpenAI SDK (`openai`) | backend (`server/ai/providers/openaiProvider.js`) | **The only supported provider**, via the Responses API + Structured Outputs, for every pipeline LLM operation | `gpt-5-mini` was verified at implementation time to be available to this project's account, to support Structured Outputs, and to work correctly with the installed SDK — see `docs/decisions/ADR-0004-single-openai-provider.md` for the real-account probe. Groq and Gemini were real, tested integrations from an earlier phase, removed after neither could reliably complete a full run on its free tier | Bundles its own Zod-to-JSON-Schema helper (`openai/helpers/zod`), so this project no longer needs a standalone conversion package |
| Vitest | testing | Test runner | Native fit for Vite projects | Phase 2B-1 adds shared-limit, validation, accessibility-semantic, and route coverage; no test uses the real OpenAI provider. |
| Playwright | testing configuration | Intended browser testing | Good for full user-flow verification | Configured; Phase 2B-1 retains deterministic React semantic tests and a manual accessibility-oriented checklist. Axe was not added because browser-scanner setup is outside the verified dependency/runtime path for this focused change. |
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

- Zod is installed, but current runtime validation is manual.
- Playwright is configured, but no substantive browser tests are present.

**Resolved in Phase 2B-2:** TanStack Query was initialized (`QueryClientProvider`
in `App.tsx`) but no active code ever called `useQuery`/`useMutation` — live
requests use manual `fetch` calls through `src/features/decision/api/`. The
generated Radix/shadcn component library (55 files under the former
`src/components/ui/`) existed but the active page rendered only its own
small, self-contained primitives (`src/features/decision/components/ui.tsx`).
Both the unused provider and the unused component set — plus 45 dependencies
that only those files imported — were verified unreachable by an exhaustive
import-graph search and removed; see `docs/PROJECT_STATUS.md` ("Phase 2B-2")
and `docs/security/DEPENDENCY_AUDIT.md`. This is the exact scenario Phase 0
warned about: "why unused dependencies and generated components can mislead
a recruiter about the real architecture" (`docs/LEARNING_CHECKPOINTS.md`).

For recruiter-facing documentation, describe technologies according to their actual role, not according to the dependency list.

## Technology choices that should be revisited in Phase 1 or 2

1. **Backend language and framework** — retain Node/Express (ADR-0006); revisit Python only for a concrete Python-native workload or independently justified service boundary.
2. **Runtime validation** — Zod now validates both public HTTP/SSE transport (`shared/contracts/`) and internal provider output (`server/ai/schemas/`).
3. **Model integration** — a provider interface was introduced in Phase 1A (`server/ai/`) and the live pipeline was wired onto it in Phase 1B; the Anthropic-specific integration it replaced has been fully removed. The interface briefly supported two real providers (Groq, Gemini) before simplifying to one (OpenAI) after neither reliably completed a live end-to-end run on its free tier — see `docs/decisions/ADR-0004-single-openai-provider.md`.
4. **Persistence** — start with SQLite when run history, auditability, or evaluation datasets become requirements.
5. **Streaming** — retain SSE unless two-way realtime interaction becomes necessary.
6. **Testing** — unit-test deterministic formulas first, then route integration tests, then end-to-end flows with model calls mocked.

Phase 2A adds frontend API-client, SSE-parser, and workflow-hook tests. No
browser E2E or real-provider test was added.
