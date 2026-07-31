# ADR-0007: npm is the only supported package manager

- **Status:** Accepted
- **Date:** 2026-08-01

## Context and decision

The repository carried three lockfiles at once: `package-lock.json`,
`bun.lock`, and `bun.lockb`. Every documented and actually-used workflow —
`README.md`, every `npm run ...` script in `package.json`, and this project's
own verification commands — already used npm exclusively. A repo-wide search
found no CI configuration (there is no `.github/` directory), no Vercel/Netlify
config, and no script anywhere that invoked `bun`. The two Bun lockfiles were
unused template residue, not a second supported workflow, and their presence
made "install with what?" an open, undocumented question for a new
contributor or coding agent.

ScenarioRank standardizes on **npm** as the sole supported package manager.
`package-lock.json` remains the single source of truth for resolved
dependency versions; `bun.lock` and `bun.lockb` were deleted in Phase 2B-2
(`docs/PROJECT_STATUS.md`). `scripts/check-unused-template.mjs`
(`npm run check:unused-template`) fails if either Bun lockfile reappears.

## Revisit triggers and trade-offs

Reconsider only if a concrete, documented reason to support Bun appears —
for example a CI workflow or deployment target that specifically requires it.
Until then, a single lockfile removes an entire class of "which install did
you run" drift between a human contributor's machine and a coding agent's.
