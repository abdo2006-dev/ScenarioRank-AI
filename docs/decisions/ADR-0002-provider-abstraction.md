# ADR-0002: Provider-neutral AI integration (Groq default, Gemini optional)

- **Status:** Accepted (Phase 1A: abstraction built; Phase 1B: pipeline cutover)
- **Date:** 2026-07-25

## Context

The active pipeline (`server.mjs`) calls the Anthropic Messages API directly
from `callClaudeJSON()`: the endpoint, request shape, model name, and a
manual JSON-repair routine are all hardcoded and duplicated implicitly
across six call sites (`docs/architecture/KNOWN_LIMITATIONS.md` P1.4, P1.5).
There is no schema-enforcement contract with the provider — prompts ask the
model in English to "return valid JSON only," and whatever `JSON.parse`
produces flows into deterministic scoring with only ad-hoc `?? 0` guards
(P0.4).

V2 needs to run on Groq by default, optionally on Gemini for comparison,
without rewriting the orchestration, prompts, or scoring math that already
work.

## Decision

Introduce a provider-neutral contract (`server/ai/types.js`) —
`AIProvider.generateStructured(request) -> { data, meta }` — with one
adapter per provider (`server/ai/providers/groqProvider.js`,
`geminiProvider.js`). `runPipeline` (and, in Phase 1B, every stage function)
calls only this contract; no provider SDK type or error class is ever
imported outside `server/ai/providers/*`.

### Why direct Anthropic coupling is being removed

Coupling every call site to one vendor's request/response shape means a
provider change requires touching all six stages, and the ad-hoc JSON
repair exists only because there is no schema-enforcement contract with
that vendor. A provider-neutral contract fixes both at once: adding or
swapping a provider becomes a new adapter file, not a rewrite of
`runPipeline`, and "return valid JSON" prompting is replaced by real
JSON-Schema structured output plus local validation (below).

### Why Groq is the intended default

Verified against Groq's own documentation (`docs/decisions/ADR-0002`
research, cited in `server/ai/schemaConversion.js` and
`providers/groqProvider.js`): `openai/gpt-oss-120b` is a current
**production** model (not preview), and Groq's **strict-mode** structured
output — constrained decoding that guarantees schema-conforming JSON — is
currently only available for GPT-OSS 20B/120B. The proposed default model
is one of the only two models on the platform where that guarantee exists.
`GROQ_MODEL` remains configurable; `openai/gpt-oss-120b` is a default, not
a hardcoded assumption.

### Why Gemini is supported as an alternative

Gemini is useful for controlled comparison/experimentation, not as a
second default. `GEMINI_MODEL` has **no built-in default** in
`geminiProvider.js` — it throws if unset — because Gemini model
identifiers change faster than this codebase will be revisited (the
current stable Flash tier moved from the 2.5 to the 3.x generation within
the lifetime of this research). `.env.example` documents a
verified-at-write-time example and tells the operator to re-check
`https://ai.google.dev/gemini-api/docs/models` rather than trust it.

### Gemini data-use restriction (unpaid tier)

Groq remains the intended default runtime provider; Gemini is an optional
comparison/experimentation provider, not a second production path. Do
**not** send real CVs, candidate records, interview notes, confidential
material, or any other personal information through Gemini while using an
unpaid API key — Google's terms for the free tier permit using submitted
content to improve their services, which is not an acceptable handling
path for real candidate data. Unpaid Gemini use in this codebase must be
limited to synthetic or explicitly non-sensitive examples (the kind of
placeholder role/candidate text already used in `.env.example`-adjacent
docs and tests). A public or production use of Gemini involving real
candidate data requires a separate privacy, terms-of-service, consent, and
paid-service review before it happens — see Google's current Gemini API
terms and paid-tier data-handling documentation (linked from the Gemini
API docs referenced elsewhere in this ADR) rather than relying on this
paragraph as the terms themselves, since they can change. This is
documentation and configuration guidance only: Phase 1A does not add a
database, consent system, or privacy UI to enforce it.

### Why Google ADK was not selected

ScenarioRank's pipeline is 5-7 fixed sequential stages with no dynamic tool
selection, branching agent-to-agent handoff, or need for durable multi-turn
memory. An agent framework would add abstractions (tool registries,
planning loops, session state) this system doesn't need, and would blur
exactly the boundary this ADR is trying to make more explicit: LLMs
interpret qualitative evidence, deterministic code computes scores and
rankings, LLMs explain the computed results, and LLMs never secretly
override a ranking. An ordinary orchestrator function calling a small
provider-adapter layer is the right-sized answer; nothing here needs an
agent framework's problem-solving power.

### Why one provider must be used consistently for an entire evaluation run

Mixing providers mid-run (e.g. scoring some candidates on Groq and others
on Gemini) would make candidates incomparable — the whole point of the
deterministic scoring layer is that every candidate was judged by criteria
and confidence values produced under the same conditions. `providerFactory`
is designed to be invoked once per run and to hand back a single provider
instance for that run's lifetime; Phase 1B's `runPipeline` integration must
resolve the provider once, not per stage.

### Why provider-side structured-output guarantees do not eliminate local validation

Groq's strict mode is a guarantee from the model provider, not a guarantee
about this codebase's assumptions — and it has a documented reliability
caveat: community reports describe `openai/gpt-oss-120b` occasionally
ignoring the schema constraint and returning free-form text. Every adapter
in this codebase parses the response and re-validates it against the
caller's Zod schema (`server/ai/providerBase.js`) regardless of what the
provider claims, and never returns unvalidated data to a caller. This is
not optional or provider-dependent behavior.

### JSON Schema portability across providers is not guaranteed

Zod is the **canonical** local validation format — every stage's contract
is written once, as a Zod schema, and that is the only shape any caller
ever depends on. Both provider adapters convert the same canonical Zod
schema into generated JSON Schema (`server/ai/schemaConversion.js`), but
**Groq and Gemini do not necessarily support identical JSON Schema
features**:

- Groq's strict mode uses the schema for real constrained decoding and
  documents specific constraints (every object needs
  `additionalProperties: false` and every property listed in `required`
  — see `schemaConversion.js`'s module comment for the known limitation
  this creates for schemas with optional fields).
- Gemini's `responseJsonSchema` documents support for a set of JSON Schema
  keywords (`$id`, `$defs`, `$ref`, `$anchor`) but its documentation also
  offers a separate, more restrictive `responseSchema` field explicitly
  described as an OpenAPI 3.0 schema subset — evidence that Gemini's JSON
  Schema support is **narrower than the full spec**, not a drop-in
  equivalent of what Groq accepts.

**A Zod schema being valid locally, and even converting to JSON Schema
without error, does not guarantee both providers will accept the
converted result.** Local Zod validity only proves the schema is
internally well-formed — it says nothing about whether a specific
provider's structured-output implementation will honor every keyword used.

Consequences for Phase 1B, binding on whoever authors the six production
schemas:

- **Every production schema must have adapter request-shape and
  compatibility tests for both Groq and Gemini** — not just one. A schema
  that only compiles cleanly for the default provider (Groq) is not
  Phase-1B-complete.
- **Large, deeply nested, `$ref`-heavy, or otherwise unsupported schemas
  must fail during development** (a failing test, a clear conversion-time
  error) **rather than fail unpredictably during a live candidate
  evaluation.** Prefer flatter, simpler schemas for the six production
  contracts over schema features that merely happen to work with the
  Zod-to-JSON-Schema converter today.
- `toJsonSchema()` already forces `$refStrategy: "none"` (no `$ref`/
  `definitions` indirection) specifically to sidestep the referencing
  question rather than requiring both providers to resolve the same
  reference style — see the strengthened test coverage in
  `server/ai/schemaConversion.test.js`.

### Why Phase 1A does not yet migrate the active pipeline

`providerFactory.js` is not imported anywhere in `server.mjs`. The six
`callClaudeJSON()` call sites, the prompts, and the Anthropic-specific JSON
repair are all untouched. Phase 1A's job is to build and prove the
abstraction (characterization-tested scoring extraction, a real backend
test runner, two adapters validated against a shared contract-test suite
with mocked SDK clients) without touching request/response behavior for
the live application. Cutting the real pipeline stages over to
`provider.generateStructured()` — one stage at a time, with manual
end-to-end verification after each — is Phase 1B.

## Consequences

### Positive

- Adding a third provider later is a new adapter file, not a `runPipeline`
  rewrite.
- "Return valid JSON" prompting is replaced by real JSON-Schema structured
  output plus mandatory local validation — P0.4 becomes fixable in Phase 1B
  without touching prompts' substantive wording.
- The provider/deterministic-math/explanation boundary described in
  `docs/architecture/CURRENT_ARCHITECTURE.md` becomes enforced by a type
  contract, not just a convention.

### Negative

- Two new runtime dependencies (`groq-sdk`, `@google/genai`) plus one
  small schema-conversion dependency (`zod-to-json-schema`) are added before
  either is used by the live pipeline (Phase 1B activates them).
- Until Phase 1B lands, the repository temporarily carries both the old
  Anthropic path (live) and the new provider abstraction (tested, dormant)
  — an intentional, time-boxed duplication, not a lingering one.

## Alternatives considered

### Migrate the pipeline directly to Groq/Gemini in one phase, no abstraction

Rejected: doing the extraction, the test-runner fix, and the six-call-site
migration in one uncharacterized change would make it impossible to tell
whether a regression came from the provider swap or the refactor. Phase 1A
isolates "build and prove the abstraction" from Phase 1B's "cut the real
pipeline over to it."

### Bump the installed Zod (3.25.76) to 4.x for native `toJSONSchema()`

Rejected for this phase: Zod is not consumed anywhere in the repository
yet, so a major-version bump carries no immediate benefit here beyond
avoiding one small dependency, and a cross-cutting dependency bump deserves
its own deliberate change rather than being folded into an adapter PR. See
`server/ai/schemaConversion.js` for the full reasoning; `zod-to-json-schema`
was added instead, pinned to the currently-installed Zod's peer range.

### Google ADK

Rejected — see "Why Google ADK was not selected" above.
