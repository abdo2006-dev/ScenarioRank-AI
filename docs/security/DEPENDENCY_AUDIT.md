# Dependency audit — Phase 2B-2

**Audit date:** 2026-08-01
**Branch:** `v2/phase-2b2-dependency-cleanup`

This document records the `npm audit` state before and after Phase 2B-2's
template/dependency cleanup, classifies every remaining finding, and states
exactly why each was deferred and what would resolve it. A lower finding
count is not, by itself, a claim that the application is secure — see
"What this audit does not claim" at the end.

**Correction (2026-08-01, Phase 2B-2 narrow correction pass):** this
document originally stated the `vite`/`esbuild` findings require `vite`
`8.2.0`. That was incorrect — it was `npm audit`'s own `fixAvailable`
summary field taken at face value, not verified against the actual
advisories. The corrected facts are below ("`vite` — high" and
"`esbuild` — moderate"). The same correction pass also removed four more
now-unused dependencies (`clsx`, `tailwind-merge`, `tailwindcss-animate`,
`@playwright/test`) via `npm install`; re-running `npm audit` afterward
still reports the same 4 findings (0 critical, 0 low, 3 moderate, 1 high) —
none of those four removed packages were part of the vulnerable dependency
graph, so the count is unchanged by this pass. No remediation was applied
in this correction beyond the existing `brace-expansion` fix already
recorded below; the corrected `vite` migration path is still deferred as a
separate follow-up (see "Migration decision" below).

## Summary

| | Count | Severity breakdown |
|---|---|---|
| Initial findings (start of Phase 2B-2, matches Phase 2B-1's recorded state) | 9 | 0 critical, 0 low, 3 moderate, 6 high |
| After removing ~45 unused template dependencies (`npm install`, no audit-specific action) | 5 | 0 critical, 0 low, 3 moderate, 2 high |
| After `npm audit fix` (no `--force`, no major bumps) | 4 | 0 critical, 0 low, 3 moderate, 1 high |
| After correction-pass cleanup (`clsx`, `tailwind-merge`, `tailwindcss-animate`, `@playwright/test` removed via `npm install`) | **4** | 0 critical, 0 low, **3 moderate, 1 high** |

Net: **5 findings resolved**, **4 remain**, all deliberately deferred (see
below). No `--force` flag was used at any point; no major-version dependency
migration was performed as part of this audit or its correction pass.

## How the count dropped from 9 to 5 before any audit-specific action

Removing the ~45 unused template dependencies (`docs/PROJECT_STATUS.md`,
"Dependencies removed") required a full `npm install` to re-sync
`package-lock.json`. That re-resolution pulled newer, non-vulnerable
transitive versions of `@eslint/config-array` and `@eslint/eslintrc` (both
transitive dependencies of `eslint`, previously pinned to older resolved
versions in the lockfile's dependency graph) — this was a **byproduct of
dependency-tree re-resolution**, not a targeted fix. It is recorded here for
honesty, not claimed as deliberate remediation work.

## `npm audit fix` (safe, in-range only)

| Package | Before | After | Change type |
|---|---|---|---|
| `brace-expansion` (transitive, via `eslint` → `minimatch@3.1.5`) | `1.1.16` (vulnerable, `<1.1.17`) | `1.1.18` | Patch bump, no `--force`, no semver-major flag |

This was the only finding `npm audit fix` (without `--force`) could resolve.
Verified safe: `npm run lint`, `npm run typecheck`, `npm run build`, and the
full test suite (see Phase 2B-2 verification results in
`docs/PROJECT_STATUS.md`) all still pass after this bump — behavior did not
change.

## Remaining findings — full classification

### 1. `vite` — high

| Field | Value |
|---|---|
| Package / direct or transitive | `vite`, **direct** devDependency |
| Advisories | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) (high, `server.fs.deny` bypass on Windows alternate paths) · [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) (moderate, path traversal in optimized-deps `.map` handling) · [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) (moderate, `launch-editor` NTLMv2 hash disclosure, Windows-only) |
| Affected range / installed | `<=6.4.2` / installed `5.4.21` |
| Environment | **Development only.** `vite` is a build/dev-server tool — it runs `npm run dev` and orchestrates `npm run build`; it is never imported by application code and ships nothing into `dist/` (confirmed: `dist/assets/*.js` contains no `vite` source, only the compiled app). |
| Exploit preconditions | The `server.fs.deny` bypass and NTLMv2 disclosure both require the Vite **dev server** to be reachable by an untrusted party on the same network (the NTLMv2 issue is Windows-only besides). This project's dev server binds locally during development; it is never deployed. The optimized-deps path traversal has the same dev-server-only precondition. |
| Is the vulnerable feature used? | The dev server is used locally by the maintainer, never exposed to untrusted networks. No production exposure. |
| Patched version | **`6.4.3`** — the minimum common patched release across all three cited advisories ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff), [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)), verified against the official GHSA advisory ranges directly, not assumed. *(Corrected: this document previously said `8.2.0`. That was `npm audit`'s own `fixAvailable` field, which reports the newest version that satisfies every dependency's combined semver range in one resolver pass against the **current, unpinned** `package.json` range — it is not the minimum patched version, and `8.2.0` is not required by any of these three advisories.)* |
| Remediation type | **Major** — but a single major-version step (`5.x` → `6.x`), not two (`5.x` → `8.x` as previously stated) |
| Risk of upgrading now | Lower than previously documented, but still a real devDependency major bump requiring its own verification pass: `@vitejs/plugin-react-swc@3.11.0` already declares `peerDependencies: { vite: "^4 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8" }` and `vitest@3.2.7` already declares `peerDependencies: { vite: "^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0-0" }`, so both already support `vite@6` without their own version bump. Mixing this into a dependency-*deletion and documentation-correction* phase would still violate this phase's own scope boundary (`docs/V2_ROADMAP.md`, "do not mix a broad Vite/Vitest/plugin migration into this cleanup correction merely to reduce the audit number"). |
| Chosen action | **Deferred**, correctly documented as a small follow-up now that the real scope is known — see "Migration decision" below. Not applied in this correction. |

### 2. `esbuild` — moderate

| Field | Value |
|---|---|
| Package / direct or transitive | `esbuild`, **transitive** (via `vite`) |
| Advisory | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — any website can send requests to the dev server and read the response |
| Affected range / installed | `<=0.24.2` |
| Environment | **Development only** — same dev-server-only precondition as the `vite` findings above; `esbuild`'s output is bundled into `dist/` but the *vulnerability* is in its dev-server request handling, not its bundling output. |
| Exploit preconditions | A malicious website open in the same browser as a developer running `npm run dev`, reachable at the dev server's origin. Not applicable to the built static site. |
| Is the vulnerable feature used? | Dev server only, local machine, not exposed to untrusted networks. |
| Patched version | **`0.25.0`.** Whether the `vite@6.4.3` bump above actually resolves `esbuild` to `0.25.0+` was verified from an installed dependency tree, not assumed: `npm view vite@6.4.3 dependencies` declares `esbuild: "^0.25.0"` directly, and a real isolated install (`npm install vite@6.4.3` against a copy of this project's `package.json`, in a scratch directory, followed by `npm ls vite esbuild`) resolved `esbuild` to `0.25.12` — comfortably above the patched threshold, with no other findings introduced. *(Corrected: this document previously said the fix required `vite@8.2.0`.)* |
| Remediation type | Major (tied to the corrected `vite` `5.x`→`6.x` bump above, not `8.x`) |
| Risk of upgrading now | Same as `vite` above — same change, same deferral. |
| Chosen action | **Deferred**, bundled with the corrected `vite` follow-up below. |

### 3. `react-router` — moderate

| Field | Value |
|---|---|
| Package / direct or transitive | `react-router`, **transitive** (via `react-router-dom`) |
| Advisories | [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) (open redirect via backslash in `<Link>`/`useNavigate`, range `>=6.0.0 <7.18.0`) · [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) (arbitrary constructor injection via `deserializeErrors()` in SSR hydration, range `>=6.4.0 <7.18.0`) |
| Affected range / installed | `6.0.0 - 7.17.0` / installed `6.30.4` (the newest published `6.x` release — confirmed via `npm view react-router-dom versions`; no patched `6.x` release exists) |
| Environment | **Production** — `react-router-dom` is imported by `src/App.tsx` and `src/pages/NotFound.tsx`, and ships in the browser bundle. |
| Exploit preconditions | The open-redirect issue requires a `<Link>`/`useNavigate` target built from attacker-controlled input (e.g. a query parameter or user-submitted URL passed straight into a route/redirect target). The SSR-hydration issue requires server-side rendering with `deserializeErrors()` in the request path. |
| Is the vulnerable feature used? | **No.** This app has exactly two static routes (`/` and a catch-all `*`), no dynamic route targets, no user-controlled navigation input, and no server-side rendering (`docs/architecture/CURRENT_ARCHITECTURE.md` — client-rendered SPA only, `useLocation`/`NotFound` only read the current path for a 404 message). |
| Patched version | `7.18.0` (first version outside the `6.0.0–7.17.0` vulnerable range) |
| Remediation type | **Major** (`6.x` → `7.x`) |
| Risk of upgrading now | React Router 7 changes the router API surface (data routers, `RouterProvider`, changed type exports) — a real migration requiring its own review and test pass, explicitly listed as out of scope for this phase (task instructions: "React Router major migration unless separately required and explicitly justified"). |
| Chosen action | **Deferred** — not mixed into this dependency-cleanup phase. |

### 4. `react-router-dom` — moderate

| Field | Value |
|---|---|
| Package / direct or transitive | `react-router-dom`, **direct** dependency |
| Advisory | [GHSA-jjmj-jmhj-qwj2](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2) — open redirect leading to XSS, range `>=6.30.2 <=6.30.4` |
| Affected range / installed | `6.30.2–6.30.4` / installed `6.30.4` |
| Environment | **Production** — same as `react-router` above. |
| Exploit preconditions | Same open-redirect-to-XSS precondition: requires an attacker-influenced `<Link>`/navigate target. |
| Is the vulnerable feature used? | **No** — same reasoning as `react-router` above: two static routes, no dynamic/user-controlled navigation targets. |
| Patched version | None in `6.x` (this specific advisory's vulnerable range already covers the latest `6.x`, `6.30.4`); resolved only by moving to the `7.18.0`+ line together with `react-router`. |
| Remediation type | **Major** |
| Risk of upgrading now | Same as `react-router` above. |
| Chosen action | **Deferred**, tracked as the same follow-up as `react-router`. |

## Production versus development exposure — at a glance

| Finding | Ships in browser bundle? | Exposure |
|---|---|---|
| `vite` | No — build/dev tool only | Development only |
| `esbuild` | No — bundling tool only, not its own dev-server vulnerability surface | Development only |
| `react-router` | Yes (transitively, via `react-router-dom`) | Production, but unused feature (no dynamic navigation targets) |
| `react-router-dom` | Yes | Production, but unused feature (no dynamic navigation targets) |

Confirmed by inspecting the actual production bundle (`npm run build`,
`dist/assets/*.js`): the built output contains the compiled application and
`react-router-dom`'s runtime, not `vite` or `esbuild` source.

## Migration decision (this correction pass)

This correction pass does **not** authorize or apply a Vite major migration.
It only corrects the documented facts above. The exact compatible
remediation options, in order:

1. **`vite@6.4.3`, no plugin/Vitest bump required.** Verified this pass:
   `@vitejs/plugin-react-swc@3.11.0` and `vitest@3.2.7` (the exact versions
   already pinned in `package.json`) both already declare peer-dependency
   ranges that accept `vite@6` without themselves needing a version change.
   An isolated trial install resolved cleanly with no peer-dependency
   warnings and dropped the isolated environment's audit count from 4 to 2
   (only `react-router`/`react-router-dom` remained). This is the
   recommended path for the eventual follow-up.
2. A newer supported Vite line (7 or 8) — not needed, since option 1 alone
   satisfies every currently open Vite/esbuild advisory.
3. A direct `esbuild` override — not needed, since `vite@6.4.3` already
   pulls a patched `esbuild` transitively.

Even though option 1 is smaller and safer than this document previously
implied, it is still **retained as a separate, reviewed follow-up** rather
than applied here: this correction's own scope is documentation accuracy
and residual-template cleanup, not a build-tool version bump, and applying
it would require its own full `npm run dev`/`npm run build` manual
re-verification pass that is out of scope for a "narrow correction."

## Why each remaining finding was deferred, and the exact future remediation path

1. **`vite`/`esbuild` (dev-tooling major bump, `5.x` → `6.x` — corrected
   from the previously documented `5.x` → `8.x`).** Follow-up: bump `vite`
   to `6.4.3` in `package.json`, run `npm install` to resync the lockfile,
   run the full build/typecheck/test suite, and manually re-verify
   `npm run dev` and `npm run build` before merging. Should not be combined
   with any other dependency change so a regression is easy to bisect.
2. **`react-router`/`react-router-dom` (major migration, `6.x` → `7.x`+).**
   Follow-up: a dedicated React Router migration phase — read the v6→v7
   upgrade guide, adopt the new data-router APIs if required, re-verify both
   routes (`/` and the catch-all), re-run `src/App.test.tsx` and
   `src/pages/Index.test.tsx`, and re-check the accessibility checklist
   (`docs/testing/ACCESSIBILITY_CHECKLIST.md`) since routing changes can
   affect focus management. This app's exposure is already low (two static
   routes, no dynamic navigation targets) — the point of doing this later is
   defense in depth and staying current, not closing an active, exploitable
   hole in this specific app today.

Both follow-ups are independent of each other and of Phase 3; either can be
scheduled whenever the owner chooses, without blocking Phase 3 model
evaluation work.

## What this audit does not claim

- A lower finding count is not a claim that the application is "secure" —
  see `docs/architecture/KNOWN_LIMITATIONS.md` (Priority 3) for the
  still-open authentication, rate-limiting, CORS, and observability gaps,
  none of which `npm audit` measures.
- This audit covers only `npm audit`'s advisory database against installed
  package versions. It is not a penetration test, a SAST/DAST scan, or a
  license-compliance review.
- The "exploit preconditions not met today" reasoning for `react-router`/
  `react-router-dom` describes this app's *current* route structure. If a
  future phase adds a dynamic route target built from user input (a
  redirect parameter, a deep link built from request data), that reasoning
  no longer holds and the major-version migration should be prioritized
  immediately rather than deferred.

## Verification this round

`npm ci`, `npm run lint`, `npm run lint:server`, `npm run typecheck`,
`npm run check:decision-readability`, `npm run check:unused-template`,
`npm test` (frontend + server), `npm run build`, `node --check server.mjs`,
and `npm audit` all pass with the dependency set and lockfile described
above — see `docs/PROJECT_STATUS.md` for the exact recorded results.
