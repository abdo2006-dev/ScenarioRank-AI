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
| `src/lib/backendUrl.ts` | Active | `VITE_BACKEND_URL`-configurable backend origin |
| `src/features/decision/components/ui.tsx` | Active | Feature-owned `Card`/`Badge`/`ScoreBar` presentation primitives — not the generated shadcn/Radix set, which was removed in Phase 2B-2 |
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
- `package-lock.json` (the sole lockfile — see below)
- `vite.config.ts`
- `vitest.config.ts` / `vitest.server.config.ts` (the latter also covers `scripts/**/*.test.js`)
- `tsconfig*.json`
- `eslint.config.js`
- `tailwind.config.ts`
- `postcss.config.js`
- `.gitignore`
- `scripts/check-decision-source-readability.mjs` (`npm run check:decision-readability`)
- `scripts/check-unused-template.mjs` (`npm run check:unused-template` — reintroduction guard for the paths, lockfiles, dependency names, root-provider imports, generated package name, and stale public-demo terminology this phase confirmed dead or incorrect)

`playwright.config.ts`, `playwright-fixture.ts`, and `components.json` were
removed in the Phase 2B-2 correction pass — see below.

Phase 2B-2 removed `bun.lock` and `bun.lockb`; npm (`package-lock.json`) is
now the sole supported package manager — see
[`decisions/ADR-0007-npm-only-lockfile.md`](decisions/ADR-0007-npm-only-lockfile.md).

## Resolved legacy and contract duplication

Phase 2A confirmed and removed the backup files, old dataset, unreachable
presentation families, `src/components/v3/`, and stale
`src/types/pipeline.ts`. `DecisionViews.tsx` was also retired after its
responsibilities were decomposed. Public browser/server types now come only
from `shared/contracts/decisionApi.js`; the frontend derives its static types
from those runtime schemas. **Phase 2B-2** confirmed and removed the entire
generated shadcn/Radix template set (55 files under `src/components/ui/`),
`src/components/NavLink.tsx`, `src/hooks/use-mobile.tsx`, and
`src/hooks/use-toast.ts` — none had an importer reachable from
`src/main.tsx`. `src/components/` and `src/hooks/` no longer exist as
directories; the only remaining code under `src/lib/` is
`src/lib/backendUrl.ts`. `src/lib/utils.ts` (the shadcn `cn()` helper) was
initially left in place — it sat outside the explicitly scoped deletion
directories (`src/components/ui/`, `src/components/`, `src/hooks/`) named in
the original Phase 2B-2 task instructions — but the **Phase 2B-2 correction
pass** confirmed it had zero importers anywhere and deleted it, along with
its two now-unused dependencies (`clsx`, `tailwind-merge`).

The same correction pass also removed `components.json` (stale shadcn
configuration pointing at `@/components/ui` and `@/lib/utils`, neither of
which exist anymore), `src/App.css` (unused Vite starter CSS with no
importer), and `playwright.config.ts` / `playwright-fixture.ts` /
`@playwright/test` (both files imported a package,
`lovable-agent-playwright-config`, that was never in `package.json` or
`package-lock.json`; no script or test used them). `tailwindcss-animate`
and its unused accordion keyframes/animation were removed from
`tailwind.config.ts` — no active class referenced them; the root package
name was renamed from the generated `vite_react_shadcn_ts` to
`scenariorank-ai`; and `public/demo.html` — reachable directly by URL and
never covered by the import-graph trace above, since it is a static file
with no import into `src/` — was rewritten to describe the current
OpenAI/gpt-5-mini pipeline instead of the retired award-build architecture
it still described (Claude, a seven-agent pipeline, "Bias Review").

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
