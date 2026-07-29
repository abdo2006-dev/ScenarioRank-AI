# Repository map

This map is based on the active import path beginning at `src/main.tsx` and a static review of the uploaded baseline.

## Active application path

| File or directory | Classification | Current responsibility |
|---|---|---|
| `src/main.tsx` | Active | Mounts the React application |
| `src/App.tsx` | Active | Providers and routing |
| `src/pages/Index.tsx` | Active, oversized | Main UI, state, API client, SSE parser, types, and visual sections |
| `src/pages/NotFound.tsx` | Active | Catch-all route |
| `src/index.css` | Active | Global styling and Tailwind layers |
| `src/components/ui/sonner.tsx` | Active through `App.tsx` | Toast renderer |
| `src/components/ui/toaster.tsx` | Active through `App.tsx` | Toast renderer |
| `src/components/ui/tooltip.tsx` | Active through `App.tsx` | Tooltip provider |
| `src/hooks/use-toast.ts` | Active transitively | Toast state helper |
| `src/components/ui/toast.tsx` | Active transitively | Toast UI contract |
| `server.mjs` | Active, thin (Phase 1D) | Composition root only: env loading, provider resolution, app startup |
| `server/config/env.js` | Active | `.env`/`.env.local` loading, provider-config validation |
| `server/ai/` | Active | Provider-neutral contract, the single OpenAI adapter, pricing, schemas, prompts (docs/decisions/ADR-0004-single-openai-provider.md) |
| `server/domain/scoring.js` | Active | Deterministic scoring formulas |
| `server/pipeline/` | Active | Orchestration, deterministic pipeline stages, run metadata |
| `server/http/` | Active | Express routes and app wiring |
| `public/demo.html` | Active link target | Standalone system demonstration |
| `public/pipeline.svg` | Documentation asset | Pipeline image used by README |

## Configuration and build support

- `package.json`
- `package-lock.json`
- `bun.lock` and `bun.lockb`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `playwright-fixture.ts`
- `tsconfig*.json`
- `eslint.config.js`
- `tailwind.config.ts`
- `postcss.config.js`
- `components.json`
- `.gitignore`

The repository currently contains lockfiles for both npm and Bun. V2 should choose one primary package manager and document it.

## Likely legacy or unreachable from the active entrypoint

The following files are not imported by the current active route based on static import review:

- `server.mjs.bak`;
- `src/pages/Index.tsx.bak`;
- `src/data/dataset.ts`;
- the older top-level presentation components under `src/components/` such as `LandingSection.tsx`, `ResultsSection.tsx`, and `ScoreBreakdown.tsx`;
- the component family under `src/components/v3/`;
- most generated files under `src/components/ui/`.

These files should not be deleted in Phase 0. Phase 1 should confirm reachability, move any useful pieces, and remove dead code in a focused cleanup commit with a successful build and UI smoke test.

## Contract duplication

Pipeline types are defined in at least two places:

- inside `src/pages/Index.tsx`;
- `src/types/pipeline.ts`.

The active page does not import the shared type file. V2 should establish one contract source and pair it with runtime validation.

## Recommended future ownership boundaries

```text
src/
├── app/                 # providers and routing
├── features/evaluation/
│   ├── api/             # HTTP/SSE client
│   ├── components/      # form, progress, results
│   ├── hooks/           # evaluation state
│   ├── schemas/         # runtime validation
│   └── types/           # inferred/static types
└── shared/              # reusable UI and utilities

backend/ (achieved in Phase 1D as server/, close to this shape)
├── http/                # routes and transport concerns
├── pipeline/            # orchestration + deterministic stages
├── domain/              # formulas and decision rules
├── ai/                  # providers, prompts, structured outputs, schemas
├── config/              # env loading, provider-config validation
└── (tests are colocated *.test.js files, not a separate directory)
```

The backend boundary above is now close to reality (`server/{http,pipeline,domain,ai,config}`, Phase 1D). Phase 2A made the active frontend concrete: `src/pages/Index.tsx` composes `src/features/decision/`, whose `api/` owns HTTP/SSE parsing, `hooks/` owns workflow state, `contracts.ts` derives types from `shared/contracts/decisionApi.js`, and `components/DecisionViews.tsx` owns presentation. The listed legacy trees, dataset, `src/types/pipeline.ts`, and `.bak` files were removed after import-graph review.
