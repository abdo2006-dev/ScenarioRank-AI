# ADR-0008: React Router 6 → 7 security migration (Declarative Mode, package strategy)

- **Status:** Accepted (Phase 2D, draft PR, not merged)
- **Date:** 2026-08-02

## Context

`react-router`/`react-router-dom` `6.30.4` were the last two open `npm audit`
findings after Phase 2C (`docs/security/DEPENDENCY_AUDIT.md`), both
moderate, both production-exposed (shipped in the browser bundle):
`GHSA-wrjc-x8rr-h8h6` (open redirect via backslash in `<Link>`/
`useNavigate`), `GHSA-337j-9hxr-rhxg` (arbitrary constructor injection in
SSR hydration's `deserializeErrors()`), and `GHSA-jjmj-jmhj-qwj2` (open
redirect leading to XSS, `react-router-dom`-specific). No patched `6.x`
release exists for any of the three — the fixed range starts at `7.18.0`.
This app's actual exposure to all three was already low (two static
routes, `/` and a catch-all `*`, no dynamic navigation target built from
user input, no SSR), matching the reasoning already recorded for these
findings before this phase — but a real fix was still tracked as a
deliberate, deferred follow-up rather than dismissed.

The active app uses **Declarative Mode only**: `BrowserRouter`, `Routes`,
`Route`, and `useLocation` (`src/App.tsx`, `src/pages/NotFound.tsx`). No
`Link`, `NavLink`, `Navigate`, `useNavigate`, `useParams`,
`useSearchParams`, `redirect`, `generatePath`, `<Form>`, data routers
(`createBrowserRouter`/`RouterProvider`), loaders, actions, or fetchers are
used anywhere in the active source — confirmed by a repo-wide search before
this migration began.

## Decision

Migrate to **`react-router@7.18.2`** (the newest published `7.x` release at
migration time, confirmed live against the npm registry — `npm view
react-router dist-tags` reports `"version-7": "7.18.2"`), using **package
strategy Option A**: install `react-router` directly, migrate both active
DOM imports from `react-router-dom` to `react-router`, and remove
`react-router-dom` entirely rather than keep it installed as a
compatibility shim.

This was possible without any compatibility-layer detour because React
Router v7 consolidated `react-router-dom`'s exports into `react-router`
itself — `BrowserRouter`, `Routes`, `Route`, and `useLocation` are all
officially exported from `"react-router"` in v7's Declarative Mode, and
`react-router-dom@7.18.2` is confirmed (via `npm view react-router-dom@7.18.2
dependencies`) to be nothing more than a thin re-export of
`react-router@7.18.2` kept for compatibility, not an independent
implementation. Verified live against the registry, not assumed from
documentation:

| Check | Result |
|---|---|
| `react-router@7.18.2` peer dependencies | `react: ">=18"`, `react-dom: ">=18"` — this repo runs `18.3.1` for both |
| `react-router@7.18.2` engines | `node: ">=20.0.0"` — this repo runs Node `22.23.1` |
| `react-router-dom@7.18.2` dependencies | `{ "react-router": "7.18.2" }` only — confirms the re-export relationship |

Option B (upgrade `react-router-dom` in place, keep both packages
installed) was rejected: it would have left a redundant `react-router-dom`
dependency with no importer once the direct-import path was proven to
work, contradicting the migration's own goal of removing the vulnerable
package rather than papering over it, and the task instructions explicitly
require not keeping both packages without justification.

## What was deliberately not adopted

- **React Router 8** — published and available (`npm view react-router
  dist-tags` shows `"latest": "8.3.0"`) but out of scope for this phase.
  React Router 8 removes the `react-router-dom` re-export package entirely
  and moves DOM-specific exports to a new `react-router/dom` subpath — a
  second, unrelated import-path migration this phase does not perform.
- **Framework Mode / Data Mode** (`createBrowserRouter`, `RouterProvider`,
  loaders, actions, fetchers, route modules) — v7 supports them, but this
  app's Declarative Mode usage (`BrowserRouter`/`Routes`/`Route`) needed no
  behavioral change to reach a patched, supported version. Adopting Data
  Mode would be a architecture change with its own review, not a security
  patch.
- **RSC (React Server Components) APIs** — unstable in React Router 7 and
  not used by this client-only SPA.

## A new advisory surfaced during migration, deliberately not chased to v8

After installing `react-router@7.18.2`, `npm audit` reported one remaining
**high**-severity finding: `GHSA-qwww-vcr4-c8h2` ("React Router: RSC Mode
CSRF Bypass Allows Action Execution Before 400 Response"), affected range
`>=7.12.0 <8.3.0`, patched only in `8.3.0`. No `7.x` patch exists for this
specific advisory — checked directly against the published version list
(`npm view react-router versions`), which goes straight from `7.18.2` to
`8.0.0-pre.0`.

**This advisory does not apply to this app.** Its own text states it
"only affects your application if you are using the unstable RSC APIs" —
this app uses none of the RSC, Framework Mode, or Data Mode APIs the
advisory describes (Declarative Mode only, confirmed above). Per this
project's own established audit discipline (`docs/security/DEPENDENCY_AUDIT.md`),
this is documented as an assessed, deferred, non-applicable finding — not
silently ignored and not used as a reason to jump to React Router 8, which
the task instructions and this project's own scope both explicitly rule
out for this phase. See `docs/security/DEPENDENCY_AUDIT.md` ("Phase 2D
update") for the full before/after audit table.

## Consequences

- `react-router-dom` is fully removed from `package.json`,
  `package-lock.json`, and every active import — verified by
  `scripts/check-router-toolchain.mjs` (`npm run check:toolchain`).
- The two production-exposed `6.x`-line advisories
  (`GHSA-wrjc-x8rr-h8h6`, `GHSA-337j-9hxr-rhxg`, `GHSA-jjmj-jmhj-qwj2`) are
  resolved.
- One new high-severity finding (`GHSA-qwww-vcr4-c8h2`) remains in `npm
  audit`'s raw count, assessed and documented as not applicable to this
  app's actual usage (no RSC APIs) rather than silently left unexplained.
- A future React Router 8 migration remains easier than it would have been
  from `6.x`: the app is already on the consolidated `react-router` package
  name, already Declarative-Mode-only, and the only remaining v8 change for
  this app's usage is moving `BrowserRouter` (and any other DOM-specific
  export this app starts using later) from `"react-router"` to
  `"react-router/dom"`.

## Revisit triggers

- React Router `8.3.0`+ is adopted deliberately, with its own review of the
  `react-router` → `react-router/dom` import split, once React Router 8
  itself is in scope (not part of this phase).
- This app adopts RSC, Framework Mode, Data Mode, or a dynamic
  user-controlled navigation target — at that point the "not applicable"
  reasoning above for `GHSA-qwww-vcr4-c8h2` (and the original three
  `6.x`-line advisories' "no dynamic navigation target" reasoning) no
  longer holds and must be re-evaluated immediately, not deferred.
