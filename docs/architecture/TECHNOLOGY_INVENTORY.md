# Technology inventory

## Runtime and application technologies

| Technology | Where it appears | Current purpose | Why it is a plausible hackathon choice | V2 observation |
|---|---|---|---|---|
| React 18 | frontend | Interactive single-page UI | Fast component development and large ecosystem | Keep initially; split the oversized page into feature components |
| TypeScript | frontend | Type annotations for UI state and responses | Improves editor support and catches some shape errors | Useful, but types are duplicated and runtime validation is absent |
| Vite | frontend tooling | Development server and production build | Simple, fast setup for React | Appropriate for this project. **Phase 2C** migrated `5.4.21` → `6.4.3` — the minimum patched release for the `npm audit` dev-server advisories, not the newest Vite release (Vite 7/8 exist but were deliberately not adopted this phase) — with no config or plugin/Vitest version changes required; see `docs/security/DEPENDENCY_AUDIT.md` |
| Tailwind CSS | frontend styling | Utility-based visual styling | Fast iteration without writing many CSS files | Keep if the team can maintain consistent components |
| React Router | app shell | Root route and catch-all page | Standard client routing | Currently more infrastructure than the one-page app needs, but harmless. **Phase 2D** migrated `react-router-dom@6.30.4` → `react-router@7.18.2` (Declarative Mode, `BrowserRouter`/`Routes`/`Route`/`useLocation` only) — a deliberately selected patched `7.x` target, not React Router 8. `react-router-dom` was removed entirely; both active imports now come from `"react-router"` directly. Resolves the three `6.x`-line open-redirect/SSR-hydration advisories; one new RSC-mode-only advisory (`GHSA-qwww-vcr4-c8h2`) is not applicable to this Declarative-Mode-only app and was deliberately not chased to React Router 8 (`docs/security/DEPENDENCY_AUDIT.md`, `docs/decisions/ADR-0008-react-router-7-migration.md`) |
| Node.js | backend runtime | Hosts Express and executes formulas | Same language family as frontend; fast hackathon iteration | Suitable, though V2 may deliberately evaluate Python/FastAPI for educational value |
| Express 5 | backend framework | HTTP routes and middleware | Minimal learning/setup overhead | Routes, orchestration, prompts, and formulas should be separated |
| Server-Sent Events | backend/frontend | Pipeline progress streaming | Simpler than WebSockets for one-way progress updates | A good fit for this one-way stream |
| OpenAI SDK (`openai`) | backend (`server/ai/providers/openaiProvider.js`) | **The only supported provider**, via the Responses API + Structured Outputs, for every pipeline LLM operation | `gpt-5-mini` was verified at implementation time to be available to this project's account, to support Structured Outputs, and to work correctly with the installed SDK — see `docs/decisions/ADR-0004-single-openai-provider.md` for the real-account probe. Groq and Gemini were real, tested integrations from an earlier phase, removed after neither could reliably complete a full run on its free tier | Bundles its own Zod-to-JSON-Schema helper (`openai/helpers/zod`), so this project no longer needs a standalone conversion package |
| Vitest | testing | Test runner | Native fit for Vite projects | Phase 2B-1 adds shared-limit, validation, accessibility-semantic, and route coverage; no test uses the real OpenAI provider. |
| Playwright | *(removed, Phase 2B-2 correction pass)* | N/A | N/A | `@playwright/test`, `playwright.config.ts`, and `playwright-fixture.ts` were removed: the config and fixture imported a nonexistent package (`lovable-agent-playwright-config`, absent from `package.json` and `package-lock.json`), no npm script or test file used them, and no substantive browser test was ever present. Accessibility verification uses Vitest/Testing Library semantic tests plus the manual checklist (`docs/testing/ACCESSIBILITY_CHECKLIST.md`) — that was already the real coverage; the Playwright configuration never added anything beyond an unused, broken stub. |
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
- Playwright *was* configured but never had a substantive browser test —
  its config and fixture imported a package that was never actually
  installed, and it was removed entirely in the Phase 2B-2 correction pass
  rather than fixed, since nothing depended on it.

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

## Evaluation technologies (Phase 3A)

The evaluation harness added **no new dependency**. It uses Node built-ins
(`node:fs/promises`, `node:path`, `node:child_process`, `node:url`) plus `zod`,
which the application already depends on, and Vitest, which it already uses.

ADR-0010 adds no dependency: the signed risk-adjusted-score correction uses the
existing scoring module, Zod contract boundary, React result component, and
offline fixture harness.

| Considered | Decision |
|---|---|
| Hosted OpenAI Evals API | **Not adopted in Phase 3A.** It cannot observe the deterministic layer most of these checks target (batch-identity validation, ranking agreement, pair canonicalisation, stage accounting), requires network access and spend per run, and would couple the benchmark to one vendor. Boundaries were drawn so it can be added later as a provider factory plus a reporter — see ADR-0009. |
| A CLI framework (`commander`, `yargs`, `minimist`) | **Not adopted.** `evals/cli/args.js` is ~60 lines of dependency-free parsing. Adding supply-chain surface for argument splitting was not justified, and a repository-protection test asserts none of these appears in `package.json`. |
| A terminal-colour library (`chalk`) | **Not adopted.** CLI and artifact output is deliberately ANSI-free so it stays greppable and diffable; tests assert no escape codes are emitted. |
| Python + an evaluation framework | **Not adopted**, consistent with ADR-0006. A second language and toolchain for evaluation alone would duplicate working, tested infrastructure for no product requirement. |
| Snapshot/golden-output testing | **Not adopted** as the primary mechanism. Snapshots of model text fail on any wording change, which trains people to re-bless them without reading. |
| LLM-as-judge grading | **Deferred to a later phase.** Layering a second unvalidated model judgment on an unvalidated first one produces numbers nobody could defend. |

Configuration added: `vitest.evals.config.ts` (separate test project) and four
`eval:*` npm scripts. `.eval-runs/` is git-ignored.
