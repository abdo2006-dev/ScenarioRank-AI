# ADR-0005: Share public HTTP and SSE contracts

- **Status:** Accepted and implemented
- **Date:** 2026-07-29

## Context

The active page independently declared transport interfaces while
`src/types/pipeline.ts` held stale agent and bias terminology. The backend
validated provider output, but its public HTTP and SSE payloads had no single
runtime contract shared with the browser.

## Decision

`shared/contracts/decisionApi.js` is the single Zod source of truth for the
public health, scenario, decision, progress, SSE-error, pairing, response, and
run-metadata contracts. Provider-output schemas remain private to
`server/ai/schemas/`. Express parses requests and validates every successful
transport response; the frontend imports the same schemas through
`src/features/decision/contracts.ts`, derives static types with `z.infer`, and
parses all network data before use.

Plain ESM was selected because both Node and Vite consume it directly without a
TypeScript runtime loader, packaging step, or generated artifacts. OpenAPI/code
generation and a separate package add maintenance cost before there is a public
API; manual duplication was the problem being solved. A package or generated
OpenAPI document remains possible if external consumers arrive.

## Consequences

Invalid responses become safe errors rather than partially-rendered data.
Schema changes now require a deliberate browser/server compatibility review.
