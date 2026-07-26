# ADR-0003: Runtime environment and provider configuration

- **Status:** Accepted; updated 2026-07-26 for the single-OpenAI-provider
  simplification ([`ADR-0004-single-openai-provider.md`](ADR-0004-single-openai-provider.md)).
  **What changed:** `AI_PROVIDER` (the "which provider" selector) no longer
  exists — there is exactly one provider, so selecting one at runtime has
  no value (see "Decision: no runtime provider selection" below, replacing
  the old provider-selection text). `GROQ_*`/`GEMINI_*` variables are gone,
  replaced by `OPENAI_API_KEY`/`OPENAI_MODEL` (and the new
  `OPENAI_REASONING_EFFORT`, `AI_MAX_CANDIDATES`,
  `AI_MAX_PROVIDER_REQUESTS_PER_RUN` — see ADR-0004 and
  `docs/PROJECT_STATUS.md`). **What did not change:** every decision
  below about `.env`/`.env.local` precedence, resolving exactly one
  provider instance for the process's entire lifetime, environment-
  dependent startup strictness, and never silently falling back between
  providers — all of it still applies exactly as written, just with
  "the selected provider" read as "OpenAI" throughout.
- **Date:** 2026-07-25

## Context

ADR-0002 established the provider-neutral contract and adapters (Phase
1A) but deliberately left them disconnected from the live application.
Phase 1B/1C connects them for real, which raises three questions ADR-0002
didn't need to answer yet: how environment configuration is loaded, how
one provider instance is guaranteed for an entire run, and how the server
should behave at startup when configuration is missing or wrong.

## Decision: `.env` / `.env.local` precedence

Implemented in `server/config/env.js`. Precedence, highest wins:

1. the real process environment (already set before `loadEnv()` runs —
   exported in a shell, or injected by CI/hosting) — never overridden;
2. `.env.local` (developer-local, git-ignored);
3. `.env` (checked-in-shape template values / shared defaults).

Mechanically: `.env.local` is loaded before `.env`, and each pass only
fills in a key that isn't already present. Loading `.env.local` first is
what makes it win over `.env` for a shared key; checking "already present"
before every write is what guarantees a real shell-level value is never
touched. No new dependency was added — this is the same hand-rolled
`.env` parser style the codebase already used, extended to a second file
with clear precedence.

## Decision: no runtime provider selection

Before ADR-0004, `AI_PROVIDER` selected between `"groq"` and `"gemini"` at
startup. With exactly one supported provider, a selector variable adds a
configuration surface with no real choice behind it — `createProvider()`
now takes no provider-name argument at all; it directly constructs the
OpenAI provider from `OPENAI_API_KEY`/`OPENAI_MODEL`. This is not a
"provider defaults to OpenAI" behavior that could silently drift to
something else later — there is no other branch in the code for it to
fall into. Adding a second provider back in the future means adding a
real selector and a real second `createXProvider()` branch again,
deliberately, with its own ADR — not un-commenting something dormant.

## Decision: one provider instance for the process's lifetime

`server.mjs` resolves the provider **once**, at process startup:

```
loadEnv() -> resolveStartupAiStatus() -> createProvider() -> createApp({ provider, aiEnabled })
```

That single instance is threaded through `createApp` -> `registerRoutes`
-> every call to `runPipeline()`, for the life of the process. This is a
stronger guarantee than "resolved once per run": there is only ever one
provider object in memory at all, so mixing providers mid-run, per-
candidate, or between two concurrent requests is structurally impossible,
not just avoided by convention. Restarting the process (which happens
whenever `AI_PROVIDER` or its keys change, since env vars are read once at
startup) is the only way the active provider changes.

## Decision: startup behavior differs by environment

`resolveStartupAiStatus()`:

- **production** (`NODE_ENV=production`): invalid or missing configuration
  for the selected provider throws, and the process exits. A production
  deployment with broken AI configuration should fail loudly at boot, not
  serve traffic that will 503 on every AI-dependent request.
- **development** (default): the same invalid/missing configuration is
  tolerated — the server starts with `aiEnabled: false`. This mirrors the
  project's existing pre-migration behavior (`ANTHROPIC_API_KEY` missing
  didn't crash the server either) and keeps frontend development usable
  without live credentials.

`/health` reflects this without exposing anything secret:

```json
{ "status": "ok", "ai_enabled": true, "ai_provider": "openai", "ai_model": "gpt-5-mini" }
```

`status` is basic liveness (the process is up and answering); `ai_enabled`
/`ai_provider` are AI readiness. Never a key, a key fragment, or a raw
config-validation error message.

## Decision: no silent provider fallback

If OpenAI fails (auth error, rate limit, exhausted retries), the pipeline
stage fails and the SSE route emits an `error` event. There is no second
provider to fall back to, and even when there were two (Groq/Gemini, see
ADR-0002/ADR-0004), nothing in this codebase ever caught a failure on one
and silently retried against the other. This is deliberate and unchanged
by the single-provider simplification: a run that silently changed
providers or models partway through would produce candidates judged under
different conditions (see ADR-0002, "why one provider must be used
consistently"), and a user-visible failure is more honest than an
invisible provider switch.

## Consequences

### Positive

- `.env.local` gives developers a private, git-ignored place for real
  credentials without ever risking a committed secret in `.env`.
- Exactly one place (`server.mjs`) decides whether AI is available for
  the whole process, so every route and every pipeline run reads the same
  answer.
- A misconfigured production deployment fails at `npm start`, not on the
  first user's request.

### Negative

- Changing providers requires a process restart (env vars are read once
  at startup) — acceptable for this project's scale; a hot-reload
  provider switch was not implemented and is not currently justified.

## Alternatives considered

### Resolve the provider fresh on every request

Rejected: strictly more work for zero additional safety, since the
environment doesn't change between requests in this deployment model. A
single startup-resolved instance already gives the strongest possible
"one provider" guarantee.

### Always fail startup on missing AI configuration, in every environment

Rejected: would make local frontend development require live provider
credentials even when nobody is testing the AI pipeline that session —
unnecessary friction the pre-migration codebase didn't have either.
