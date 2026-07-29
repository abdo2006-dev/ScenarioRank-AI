# Repository map

This map is based on the active import path beginning at `src/main.tsx` and a static review of the uploaded baseline.

## Active application path

| File or directory | Classification | Current responsibility |
|---|---|---|
| `src/main.tsx` | Active | Mounts the React application |
| `src/App.tsx` | Active | Providers and routing |
| `src/pages/Index.tsx` | Active, thin | Renders the decision feature screen |
| `src/features/decision/api/` | Active | Validated HTTP/SSE client, stateful stream parser, focused tests |
| `src/features/decision/hooks/` | Active | Workflow state and phase transitions |
| `src/features/decision/components/evaluation/` | Active | Composed form plus role, scenario, candidate, and option editors |
| `src/features/decision/components/results/` | Active | Results tab composition and one module per result responsibility |
| `src/features/decision/components/DecisionScreen.tsx` | Active | Page shell, phase composition, error banner, result ref |
| `src/features/decision/contracts.ts` | Active | Re-exports shared schemas and derives browser types with `z.infer` |
| `shared/contracts/decisionApi.js` | Active | Canonical public HTTP and SSE runtime contracts |
| `shared/contracts/decisionInputLimits.js` | Active | Shared technical text/count ceilings; runtime candidate cap remains server-resolved |
| `src/features/decision/validation/` | Active | Zod-issue-to-field-error mapping for controlled evaluation drafts |
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

## Resolved legacy and contract duplication

Phase 2A confirmed and removed the backup files, old dataset, unreachable
presentation families, `src/components/v3/`, and stale
`src/types/pipeline.ts`. `DecisionViews.tsx` was also retired after its
responsibilities were decomposed. Public browser/server types now come only
from `shared/contracts/decisionApi.js`; the frontend derives its static types
from those runtime schemas.

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

The backend boundary above is now concrete
(`server/{http,pipeline,domain,ai,config}`, Phase 1D). Phase 2A made the
frontend boundary equally explicit. Evaluation and results are directories of
cohesive components rather than alternate monoliths, and all active decision
source is guarded against lines longer than 180 characters.
