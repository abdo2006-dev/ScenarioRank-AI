# ADR-0001: Use `main` as the public V2 line

- **Status:** Accepted
- **Date:** 2026-07-25

## Context

The repository contains an award-winning competition implementation, but the maintainer wants the first version seen by recruiters, developers, and visitors to be the improved post-award system.

Keeping the legacy implementation on `main` and developing V2 on a long-lived secondary branch would make the repository landing page show outdated architecture. Rewriting history or deleting the original would lose an important achievement and comparison point.

## Decision

- Keep `main` as the GitHub default branch.
- Use `main` as the public V2 source of truth.
- Preserve the untouched competition commit with:
  - an annotated tag named `bmw-award-original`;
  - a frozen branch named `archive/bmw-award-original`;
  - optionally, a GitHub release using the same tag.
- Implement V2 work in short-lived `v2/<work-item>` branches and merge them into `main`.

## Consequences

### Positive

- visitors immediately see the strongest and most current project state;
- the original award version remains permanently accessible;
- the README can present an honest evolution story;
- future pull requests create a visible engineering record;
- no long-lived V2 branch can drift away from the default branch.

### Negative

- `main` may temporarily contain an explicitly marked “V2 in progress” state;
- links to the archive depend on the tag and branch being created before the README is pushed;
- disciplined pull-request and testing practices are required to keep the public branch credible.

## Alternatives considered

### Keep award code on `main`, build V2 on `v2`

Rejected because visitors would land on legacy code and may never discover the improved architecture.

### Rename the default branch to `v2`

Rejected because `main` is the conventional source-of-truth name, and the version should be communicated through releases, tags, documentation, and application metadata rather than a permanent branch name.

### Replace the original without preserving it

Rejected because the competition snapshot is historically valuable and demonstrates the project’s evolution.
