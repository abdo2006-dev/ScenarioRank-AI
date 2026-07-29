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

The final correction records semantic, not merely structural, invariants:

- health is a union of enabled-with-non-empty-provider/model and
  disabled-with-null-provider/model;
- decision confidence is 0–1 and stage duration is a nonnegative integer;
- successful pairing has non-empty `top_pairs`, distinct candidate IDs, no
  duplicate or reversed ID combinations, and an exact `best_pair` entry in
  `top_pairs`.

Candidate IDs, sorted as a pair, are the public pairing identity. `pair` names
remain ordered display labels and can be equal when different candidates share
a name. The completed-response schema resolves every pair ID through
`candidate_evaluations` and rejects unknown IDs or a name that does not match
its ordered ID. Fake-pipeline and both Express decision-route regressions parse
pairing-enabled completed responses through the public schema.

The browser's stateful parser coalesces CRLF across chunk boundaries and only
dispatches blank-line-terminated events. Malformed JSON has fixed safe text.
Only application-authored safe client errors and validated SSE error messages
retain their text; native fetch, reader, decoder, and browser failures do not.
