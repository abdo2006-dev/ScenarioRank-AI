# ADR-0006: Retain Node and Express

- **Status:** Accepted
- **Date:** 2026-07-29

## Context and decision

The current Node/Express backend is modular, tested, and operational. Python is
useful for AI and ML work, but it is not automatically a better API backend.
This system does not need PyTorch, Transformers, pandas-heavy processing, model
training, or a Python-only library.

ScenarioRank will retain Node/Express. A full FastAPI rewrite would duplicate
routes, SSE behavior, Zod/Pydantic schemas, provider integration, retries,
tests, and deployment work without improving the current product. A separate
Python inference service has the same operational cost without a present need.

## Revisit triggers and trade-offs

Reconsider Python only for a concrete Python-native workload, model-training or
evaluation pipeline, substantial data-science processing, or an independently
justified service boundary. Node keeps one language across frontend and backend
and preserves current expertise; it does not prevent a future service when one
has a real responsibility.
