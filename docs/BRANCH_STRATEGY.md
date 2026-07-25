# Branch strategy

## Decision

`main` is the public V2 branch and remains the GitHub default branch. There is no long-lived branch named `v2`.

This means visitors, recruiters, and contributors immediately see the improved project rather than the frozen competition code.

## Preserve the original award snapshot first

Run these commands against the untouched competition commit before committing Phase 0 files:

```bash
git switch main
git pull --ff-only origin main
git status

# The working tree must be clean before continuing.
git tag -a bmw-award-original -m "BMW competition snapshot — Best Implementation"
git branch archive/bmw-award-original

git push origin bmw-award-original
git push -u origin archive/bmw-award-original
```

Verify that both references point to the same commit:

```bash
git rev-parse bmw-award-original
git rev-parse archive/bmw-award-original
```

The two hashes must match the pre-V2 `main` commit.

## Optional GitHub release

Create a release named:

```text
BMW Competition Award Version
```

Use the existing `bmw-award-original` tag and explain that it is the frozen hackathon implementation that received Best Implementation. The release makes the original achievement easy to find without making it the default code view.

## Commit the Phase 0 baseline to main

After creating and pushing the archive references, apply the Phase 0 files and commit them on `main`:

```bash
git switch main
git add README.md .env.example docs/ src/pages/Index.tsx server.mjs
git commit -m "docs: establish ScenarioRank V2 engineering baseline"
git push origin main
```

Review `git diff --cached` before committing. Phase 0 must not contain scoring or pipeline behavior changes.

## Future development workflow

Create one short-lived branch per focused work item:

```bash
git switch main
git pull --ff-only origin main
git switch -c v2/phase-1-correctness
```

Examples:

- `v2/fix-pair-selection`
- `v2/replace-hardcoded-adaptability`
- `v2/add-runtime-schemas`
- `v2/extract-scoring-domain`
- `v2/add-formula-tests`

Push and open a pull request into `main`:

```bash
git push -u origin v2/phase-1-correctness
```

Each pull request should contain:

- one clearly defined problem;
- architecture and behavior notes;
- tests added or updated;
- real command outputs for lint, tests, and build;
- manual verification steps;
- known limitations and follow-up work;
- no unrelated refactors.

## Main-branch protection

Recommended settings for `main`:

- block branch deletion;
- block force pushes;
- require pull requests for implementation changes when practical;
- require status checks after CI exists;
- require conversation resolution;
- allow emergency administrator bypass only when necessary and documented.

For a solo-maintained learning repository, mandatory external approval is not required. The main value is preventing accidental destructive pushes and creating a reviewable record of AI-generated changes.

## Archive policy

- Never commit new work to `archive/bmw-award-original`.
- Never move or recreate the `bmw-award-original` tag after publishing it.
- Fixes belong to `main`, not the archive.
- README links should direct visitors to the archive only when they want the exact competition snapshot.
