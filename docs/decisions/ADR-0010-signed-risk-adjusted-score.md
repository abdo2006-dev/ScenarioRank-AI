# ADR-0010: Signed risk-adjusted net score

- **Status:** Accepted
- **Date:** 2026-08-05
- **Related:** [ADR-0005](ADR-0005-shared-http-contracts.md), [ADR-0009](ADR-0009-local-first-evaluation-harness.md)

## Context

`SR-P3A-001` exposed a contradiction: deterministic scoring could produce a
negative `risk_adjusted_score`, while the public completed-response contract
required `0–100`. The JSON route therefore returned a generic 500 and the SSE
route emitted an error after all provider stages had completed.

## Decision

`risk_adjusted_score` is a signed penalty-adjusted net score, bounded from
`-100` to `100`. Higher is better. A negative result means modeled penalties
exceed weighted fit; it is not a probability, percentage, calibrated utility,
fairness measurement, or scientific claim.

The existing formula and coefficients remain unchanged. Compute the raw net
score, round to two decimal places using the existing rounding behaviour, then
apply the final `[-100, 100]` contract boundary. Ranking uses that same final
serialized value. Exact ties retain the existing stable submission-order
behaviour; no raw-score field or hidden tie-breaker exists.

Only `risk_adjusted_score` uses the signed public schema. Weighted-fit and
expected-outcome scores remain `0–100`. The frontend calls the field
“Risk-adjusted net score” and provides an accessible explanation of the signed
range.

## Alternatives considered

- **Clamp to zero:** rejected because distinct weak candidates collapse to the
  same value and can reverse a `lowest_risk` result through stable tie order.
- **Affine or other re-normalization:** rejected for this correction because it
  changes every output and introduces uncalibrated scoring-model constants.
- **Raw/public split:** rejected because no consumer needs two concepts, and
  ranking on a hidden value while displaying another would be misleading.

## Migration and benchmark

This is a deliberate breaking semantic correction for the field. The released
fixture benchmark first detected the correction as `baseline_change_required`
under v1.0.0: eight expected observations disappeared without unrelated
failures. The benchmark then advanced to v1.1.0, removed only the four
`SR-P3A-001` annotations, and refreshed reviewed release integrity. The new
offline baseline is `clean_pass` with 16 clean cases.

## Consequences and limits

Route and SSE completion now succeed for signed negative values, while values
outside the signed boundary remain invalid. Consumers that assume a percentage
must migrate. There is no empirical calibration claim.

The separate `normalizeWeights` residual-rounding issue remains open: it can
produce a slight negative final weight and an adjacent score edge. This ADR
does not alter weight normalization.
