# ADR-0004: Simplify to a single OpenAI provider

- **Status:** Accepted and implemented
- **Date:** 2026-07-26
- **Supersedes:** the multi-provider implementation decision in
  [`ADR-0002-provider-abstraction.md`](ADR-0002-provider-abstraction.md)
  (Groq default + Gemini alternative). ADR-0002 is not deleted — it stays
  as the honest historical record of what was built, tested, and later
  removed, and its architectural reasoning about *why a provider-neutral
  contract exists at all* is still correct and still applies. Only its
  choice of *which providers to run* is superseded here.
- **Updates:** [`ADR-0003-runtime-provider-configuration.md`](ADR-0003-runtime-provider-configuration.md)
  (the `.env` precedence, one-instance-per-process, and no-silent-fallback
  decisions all stand; the parts about `AI_PROVIDER` selection and
  Groq/Gemini-specific config are updated for a single provider — see that
  file's changelog note at the top).

## Context

Phase 1 built and shipped a provider-neutral `AIProvider` contract with two
real adapters, Groq (default) and Gemini (optional), specifically so
ScenarioRank was not coupled to one vendor's request/response shape (ADR-0002).
That work was genuine and is not being erased — it is the reason a
provider-neutral contract already existed when this decision was made.

A subsequent post-review correction round then ran a real, live,
synthetic end-to-end smoke test against both providers (documented in
`docs/PROJECT_STATUS.md`, "Phase 1 post-review corrections"). The result:

- **Groq** (`openai/gpt-oss-120b`, default account tier): the pipeline's
  very first sequential LLM call succeeded, but the *second* sequential
  call — no concurrency involved — was rejected with HTTP 429. The
  account's rate limit could not sustain even a strictly sequential
  multi-stage pipeline, let alone the six-to-nine calls a full evaluation
  with pairing made at the time.
- **Gemini** (`gemini-3.6-flash`, as a comparison after Groq failed):
  failed differently — its response was truncated mid-JSON because the
  configured `maxOutputTokens` was spent partly on the model's own
  internal reasoning tokens before the structured output finished,
  producing syntactically invalid JSON that failed schema validation
  twice in a row.

Neither failure was a bug in ScenarioRank's own code — both were
external, quota/token-budget problems specific to the free/low tier of
each provider. But the practical result was the same either way: **no
real end-to-end demo could be shown reliably on either provider**, and the
owner has only a small amount of real API budget (~$3) to work with going
forward, which makes "try a third provider and hope" an unacceptable next
step.

At the same time, reviewing what ScenarioRank actually needs surfaced a
simpler question: **does this project have an actual product requirement
for more than one simultaneously-supported provider?** It does not.
ScenarioRank has never run two providers at once, was never going to
compare them live in production, and the only reason Gemini existed at
all was "for controlled comparison and experimentation" (ADR-0002's own
words) — not a real user-facing need.

## Decision

Simplify to exactly one active provider:

```
ScenarioRank pipeline
        ↓
AIProvider contract   (kept — server/ai/types.js)
        ↓
OpenAIProvider        (server/ai/providers/openaiProvider.js)
        ↓
OpenAI API
```

- Remove `GroqProvider` and `GeminiProvider` — the adapter files, their
  tests, their fake-SDK-client test support, the `groq-sdk` and
  `@google/genai` dependencies, and every `GROQ_*`/`GEMINI_*` environment
  variable.
- Add `OpenAIProvider` (`server/ai/providers/openaiProvider.js`) as the
  only implementation of the `AIProvider` contract.
- **Keep the provider-neutral contract itself** (`server/ai/types.js`),
  the provider-neutral error taxonomy (`server/ai/errors.js`), the single
  retry owner (`server/ai/retry.js`), canonical Zod validation for every
  LLM operation, prompt/schema IDs and versions, and generic run metadata.
  These are not "multi-provider" abstractions — they are correct
  architecture regardless of how many providers exist, because they
  separate *what the pipeline needs from an LLM call* from *how one
  specific vendor's SDK satisfies that need*. Collapsing to one provider
  does not make that separation pointless: `runPipeline.js` still never
  imports an SDK type, and swapping `OpenAIProvider` for something else
  later remains "write one new adapter file," not "rewrite the pipeline."
- Do **not** add Anthropic, Groq, Gemini, OpenRouter, Azure OpenAI,
  Ollama, LM Studio, local inference, silent provider fallback, or
  automatic model routing. These may be reconsidered later, with their
  own written requirement and their own ADR — not added speculatively
  because the abstraction happens to make it easy.

### Why OpenAI specifically

Verified directly against the installed SDK (`openai` npm package,
v6.49.0) and a real, minimal, live API call against the project's own
account at implementation time (2026-07-26), not against training data or
a single web summary (see "Model and API verification" below for exactly
what was checked and how):

- The Responses API's Structured Outputs (`text.format` with `strict:
  true`) is the current, officially recommended way to get
  schema-constrained JSON from this provider, with an official Zod helper
  (`openai/helpers/zod`, `zodTextFormat`) that both converts the Zod
  schema to JSON Schema **and** re-parses the result through the same Zod
  schema instance — i.e., real local Zod validation is not an extra step
  bolted on afterward, it is what the helper already does, and this
  codebase still calls `schema.parse()` on the result a second time
  explicitly anyway (defense in depth — never trust a provider-side
  guarantee alone, the same principle ADR-0002 established for Groq's
  strict mode).
- Refusal and truncation are both distinguishable, structured response
  states (`response.output[].content[].type === "refusal"`;
  `response.status === "incomplete"` with
  `incomplete_details.reason === "max_output_tokens"`), not something that
  has to be inferred from prose or a generic parse failure.
- Token usage, including a `reasoning_tokens` breakdown, is reported on
  every response (`response.usage`) — the exact shape this project needs
  for honest cost/usage metadata (see "Cost and usage visibility" below).
- The account already has real, working access, confirmed live (see next
  section) — not just theoretically documented.

### Model and API verification (2026-07-26)

Because pre-trained knowledge and web-search summaries about a fast-moving
API surface are not reliable enough to build production configuration on,
every claim below was checked directly, not assumed:

1. **SDK**: `npm view openai version` → `6.49.0`, peer-depends on
   `zod@^3.25 || ^4.0` (the project's installed Zod, 3.25.76, satisfies
   this). Installed and inspected directly
   (`node_modules/openai/helpers/zod.js`, `.../lib/parser.js`,
   `.../lib/ResponsesParser.js`, `.../resources/responses/responses.d.ts`,
   `.../core/error.d.ts`) rather than trusted from documentation alone.
2. **API shape**: confirmed from the installed type definitions, not a
   blog post — `client.responses.parse()` exists, returns
   `ParsedResponse<T>` with `output_parsed`, `status`,
   `incomplete_details`, and `usage`; `zodTextFormat()`'s internal
   `parseZodObject()` genuinely calls `zodObject.parse(JSON.parse(content))`,
   confirmed by reading the compiled helper source directly.
3. **Model choice**: the instruction was "use `gpt-5-mini` only if it is
   available to the account, supports Structured Outputs, and the
   installed SDK supports it correctly — otherwise pick the current
   lowest-cost suitable model and explain why." A real, minimal, live
   call (`reasoning: { effort: "minimal" }`, `max_output_tokens: 128`,
   a trivial one-field schema, no candidate or role data) was made
   against the project's own OpenAI account for both `gpt-5-mini` and
   `gpt-5.4-mini` (the current low-cost "mini" model per OpenAI's public
   pricing page, which no longer lists `gpt-5-mini` in its primary
   Standard-tier table). Result: **`gpt-5-mini` is available to this
   account, returned `status: "completed"` with a correctly schema-
   validated parsed result, and accepted `reasoning.effort: "minimal"`**
   for a real cost of 32 input + 26 output tokens (0 reasoning tokens).
   `gpt-5.4-mini`, by contrast, rejected `reasoning.effort: "minimal"`
   with a `400 BadRequestError` stating its supported values are `none`,
   `low`, `medium`, `high`, `xhigh` — a real, observed example of the
   "not all reasoning models support every value" caveat documented in
   the SDK's own type definitions. Since all three stated conditions for
   defaulting to `gpt-5-mini` were met by a real account probe, it is the
   default — **no fallback to a different or more expensive model was
   needed.**
4. **Pricing**: read directly from `gpt-5-mini`'s own OpenAI documentation
   page (`developers.openai.com/api/docs/models/gpt-5-mini`, retrieved
   2026-07-26): **$0.25 / 1M input tokens, $0.025 / 1M cached input
   tokens, $2.00 / 1M output tokens** (reasoning tokens bill at the output
   rate — they are a labeled subset of `output_tokens`, not a separate
   line item). This model no longer appears in OpenAI's primary
   "Standard pricing" comparison table (which now leads with the
   `gpt-5.6` family and `gpt-5.4-mini`/`gpt-5.4-nano`), but its own model
   page is still live, current, and was not flagged as deprecated or
   scheduled for retirement — only nudged with "for most new low-latency,
   high-volume workloads, we recommend starting with GPT-5.6 Terra," which
   is generic forward-looking guidance, not a deprecation notice. See
   `server/ai/pricing/openaiPricing.js` for exactly how this is used and
   what happens for any model this file does not explicitly recognize
   (it returns `null` — see "Cost and usage visibility" below).
5. **Reasoning effort values**: confirmed from the installed SDK's own
   type definitions (`Shared.Reasoning.effort`, not a support article):
   `"none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`,
   with the SDK's own comment that "not all reasoning models support
   every value" — borne out directly by the `gpt-5.4-mini` probe above.
   `OPENAI_REASONING_EFFORT` is validated locally against this exact
   enum; whichever subset the configured model actually accepts is still
   enforced by the API itself, and an unsupported combination surfaces as
   a clear `400` configuration-shaped error, not a silent downgrade.

### Cost and usage visibility

`response.usage` (input/cached-input/output/reasoning tokens) is reported
on every *completed* OpenAI response, and `run_metadata.estimatedCostUsd`
(`server/ai/pricing/openaiPricing.js`) is computed from those aggregated
counts against a small versioned per-model pricing table, `null` rather
than a guessed number for any model the table does not explicitly
recognize. **Known limitation, stated plainly rather than glossed over:**
usage is only ever available from an attempt that actually returned a
response body. An attempt that fails before that point — an
authentication error, a connection failure, an exhausted-retry error with
no body — has no usage to report and is silently excluded from the
token/cost totals, even though it still counts as a real attempt in
`run_metadata.providerAttemptCount` (see the next section for that
distinction). This means the displayed estimate can honestly under-report
true spend when a stage fails hard, as opposed to succeeding-but-discarded
(e.g. a batch-integrity corrective retry, which does have usage and is
included). `estimatedCostUsd` is a displayed estimate for the user's own
awareness, never an invoice — OpenAI's own billing dashboard remains the
source of truth.

### Logical stages vs. real provider attempts

The batched architecture below reduces a full evaluation from the
six-to-nine per-call, per-candidate, per-pair requests the pre-batching
design made, to a fixed maximum of **4 logical model-backed pipeline
stages**: combined context analysis, batch candidate scoring, batch
pairing analysis (optional), and decision explanation
(`server/pipeline/runPipeline.js`'s `MAX_LOGICAL_PROVIDER_STAGES`, a fixed
internal constant, not an environment setting — the architecture itself
defines the stage count, so there is nothing for an operator to configure
here). This logical-stage count is a fixed architectural fact, but it is
**not** the same claim as "at most 4 real OpenAI API requests" — a single
logical stage can still take more than one real attempt (a schema-
validation retry, a truncation retry, a transient-error retry, or a
batch-integrity corrective call when a batch response has a duplicate,
missing, or unknown identity). `run_metadata` therefore reports two
distinct counts: `logicalProviderStageCount` (bounded at 4) and
`providerAttemptCount` (the real, aggregated total of every OpenAI attempt
across every stage, which can legitimately exceed 4). A batch-integrity
corrective retry's real attempt is added to `providerAttemptCount` — it is
never discarded just because its result was superseded by a later,
validated call. The earlier `AI_MAX_PROVIDER_REQUESTS_PER_RUN` environment
setting and `providerRequestCount` field (present in an earlier round of
this simplification) conflated these two concepts and have been removed;
`LogicalStageLimitExceededError` (`server/ai/errors.js`) is the safety net
that replaces it, firing only if a future bug adds a 5th call site this
architecture was never designed to need — not a normal-path limiter, and
never tripped by ordinary retries or corrective calls within the existing
4 stages.

### Pairing requires complete coverage, never a partial "best pair"

Batch pairing analysis (logical stage 3 of 4) evaluates every relevant
pair among the top-four *ranked* candidates in a single request. A
successful pairing result means **every** expected pair was returned and
validated exactly once — a subset is never classified as a successful
"best pair" analysis. `mapPairResultsByIdentity()`
(`server/pipeline/runPipeline.js`) rejects a batch that is missing any
expected pair, contains a duplicate (including a reversed-order
duplicate), or contains an unrequested pair, with one corrective retry;
if the batch is still incomplete afterward, the response honestly reports
`{"status":"unavailable","reason":"Complete pair analysis was
unavailable.","best_pair":null,"top_pairs":[]}` rather than fabricating or
partially reporting a "best" pair. This is a deliberate tightening from an
earlier round's design, which tolerated a merely-missing pair as a
partial success — that tolerance is no longer considered acceptable,
because presenting a subset of evaluated pairs as if it were a complete
comparison overstates what was actually checked. The stage's real
attempts and token usage are still recorded in `run_metadata` even when
pairing ends up unavailable, since real API spend occurred regardless of
whether the result was usable.

### Why the provider-neutral contract is still worth keeping with one provider

YAGNI cuts against *unused* abstraction, not against *all* abstraction.
The distinction that matters here: `AIProvider.generateStructured()` does
not exist to support multiple providers — it exists so `runPipeline.js`
and the deterministic scoring layer never need to know what an OpenAI
`Response` object looks like, what a refusal content item is, or how
usage is reported. That separation is valuable with exactly one provider
in production, because it means the SDK-specific plumbing (request
building, refusal/truncation detection, retry-eligible error mapping,
usage extraction) lives in exactly one file
(`server/ai/providers/openaiProvider.js`) instead of being smeared across
the orchestrator. If ScenarioRank ever needs a second provider again, the
change is "write a new adapter file that implements the same contract,"
not "find every place `runPipeline.js` assumes OpenAI's response shape."
Removing the contract now to save one layer of indirection would be
optimizing for the wrong thing — the abstraction's cost (one extra file,
already written and tested) is small and its benefit (SDK isolation)
doesn't depend on provider count.

### Why not keep Groq or Gemini "just in case"

This is the YAGNI point, stated directly: keeping a provider adapter that
nothing currently uses is not free. Each one carries its own SDK
dependency (with its own transitive vulnerabilities to track), its own
environment variables to validate and document, its own adapter tests,
its own fake-SDK-client test support, its own entries in every
architecture document, and its own failure modes an operator has to
reason about. None of that pays for itself unless the project actually
runs multiple providers, and ScenarioRank never has — Gemini's only
stated purpose (ADR-0002) was "controlled comparison and experimentation,"
which is exactly what the smoke test just did, once, and which does not
require keeping the adapter installed permanently afterward. Retaining
unused provider complexity to preserve "hypothetical flexibility" is the
textbook case YAGNI exists to prevent.

### Why not add a different alternative provider instead (OpenRouter, Azure, local inference, etc.)

Same reasoning as above, one level removed: there is no current product
requirement for *any* second provider, so evaluating and adding a
*different* one right now would repeat the same mistake with a new name.
If a real requirement emerges later (cost pressure at scale, a specific
model only available elsewhere, a data-residency requirement), it gets
its own ADR with its own justification at that time — not a preemptive
addition here.

## Consequences

### Positive

- One fewer axis of runtime configuration (`AI_PROVIDER` selection is
  gone entirely — see `docs/decisions/ADR-0003-runtime-provider-configuration.md`);
  one model to reason about, document, and price.
- Two fewer runtime dependencies (`groq-sdk`, `@google/genai`) and one
  fewer supporting dependency (`zod-to-json-schema` — the `openai`
  package vendors its own Zod-to-JSON-Schema conversion via
  `openai/helpers/zod`, so the standalone conversion module this project
  wrote for Groq/Gemini compatibility, `server/ai/schemaConversion.js`, is
  also removed as dead weight, not kept "in case it's useful").
- Removing per-call-per-candidate-per-pair provider requests (see
  "Logical stages vs. real provider attempts" above) directly protects the
  owner's small real API budget — the previous six-to-nine-call
  architecture was not something a single provider swap would have fixed
  on its own.
- Fewer adapter tests to maintain, fewer environment variables to
  validate, fewer places for "which provider is this describing" to go
  stale in documentation.

### Negative

- No live fallback if OpenAI itself has an outage or rate-limits this
  account — this is an accepted trade-off given there is no current
  product requirement to run multiple providers simultaneously, and
  silent fallback between providers was already rejected on correctness
  grounds in ADR-0003 ("mixing providers mid-run ... would make
  candidates incomparable").
- Re-adding a second provider later requires writing a new adapter file
  from scratch (Groq's and Gemini's adapters are deleted, not archived in
  the active tree) — acceptable, since git history and this ADR preserve
  exactly how they were built and why they were removed; nothing here
  pretends the experiment didn't happen.

## Alternatives considered

### Keep Groq as default, Gemini as fallback

Rejected: this is exactly the "silent provider fallback" pattern
ADR-0003 already ruled out for correctness reasons (candidates judged
under different providers/models are not comparable), and it wouldn't
have fixed anything anyway — the smoke test showed *both* providers
failing to complete a full run on their current tiers, for two entirely
different reasons.

### Try a third alternative provider before committing to OpenAI

Rejected for this round: there is no evidence a third free/low-tier
provider would behave any better, and burning more of a ~$3 real budget
on speculative comparison testing is not a good use of it. OpenAI's
Structured Outputs + Responses API combination was verified to actually
work end-to-end against this project's real schemas on a real account
probe (see "Model and API verification" above), which is a higher bar
than "documented to probably work."

### Keep the Groq/Gemini adapters in the tree, unused, "for later"

Rejected — this is the literal scenario YAGNI is about. Dead provider
code that nothing calls still has to be read, still shows up in
dependency audits, and still misleads a reader of
`docs/architecture/TECHNOLOGY_INVENTORY.md` into thinking the system is
more multi-provider than it is. Git history is the correct place to keep
"how the Groq/Gemini experiment was built," not the active `server/ai/providers/`
directory.
