# Phase 0 change manifest

## Added

- `.env.example`
- `docs/README.md`
- `docs/PHASE_0_BASELINE_AUDIT.md`
- `docs/PHASE_0_CHANGE_MANIFEST.md`
- `docs/REPOSITORY_MAP.md`
- `docs/BRANCH_STRATEGY.md`
- `docs/V2_ROADMAP.md`
- `docs/LEARNING_CHECKPOINTS.md`
- `docs/architecture/CURRENT_ARCHITECTURE.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/architecture/TECHNOLOGY_INVENTORY.md`
- `docs/architecture/SCORING_AND_ASSUMPTIONS.md`
- `docs/architecture/KNOWN_LIMITATIONS.md`
- `docs/decisions/ADR-0001-main-is-v2.md`

## Updated

- `README.md` — V2 public project narrative, honest baseline, correct environment setup, and documentation index.
- `.gitignore` — explicitly allows the safe `.env.example` template while continuing to ignore real environment files.
- `src/pages/Index.tsx` — non-functional visible/comment version label changed from v3 to V2.
- `server.mjs` — non-functional startup/comment version label changed from v3 to V2.

## Intentionally unchanged

- pipeline order;
- prompts;
- formulas;
- request and response behavior;
- ranking logic;
- pair-selection behavior;
- hardcoded adaptability behavior;
- UI layout and functionality.
