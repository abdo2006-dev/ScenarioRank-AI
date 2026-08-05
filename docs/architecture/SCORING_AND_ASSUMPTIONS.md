# Scoring model and assumptions

## Principle

The current system combines model-derived qualitative judgments with deterministic formulas.

The formulas are reproducible **after** the model has produced criterion scores and confidence values. This does not make the complete system objectively reproducible, because model outputs may vary across runs and the formulas themselves use manually selected coefficients.

## Model-derived inputs

The LLM currently supplies:

- role baseline weights;
- scenario weight deltas;
- criterion scores from 1 to 10;
- self-reported confidence values from 0 to 1;
- short evidence and reasoning strings;
- strengths and weaknesses;
- pair-level estimates from 0 to 1;
- natural-language explanations and summaries.

**Phase 1B update:** these outputs are now validated against strict runtime Zod schemas (`server/ai/schemas/`) before any deterministic formula below runs — see `docs/decisions/ADR-0002-provider-abstraction.md` and `docs/architecture/KNOWN_LIMITATIONS.md` P0.4.

## Deterministic formulas

### Weight normalization

```text
adjusted_i = max(0, baseline_i + delta_i)
normalized_i = adjusted_i / sum(adjusted) * 100
```

The final normalized weights are intended to total 100.

### Weighted fit score

```text
WFS = sum(score_i * weight_i / 10)
```

With scores in `[1, 10]` and weights totaling 100, the result is approximately on a `[10, 100]` scale rather than a true `[0, 100]` scale.

### Overall confidence

```text
OverallConfidence = sum(confidence_i * weight_i) / sum(weight_i)
```

The number is a weighted average of model self-reported confidence. It is not an empirically calibrated probability.

### Execution risk

```text
100 - (
  0.45 * operational_execution * 10
+ 0.30 * domain_expertise * 10
+ 0.25 * crisis_management * 10
)
```

### Culture risk

```text
100 - (
  0.60 * stakeholder_management * 10
+ 0.20 * transformation_leadership * 10
+ 0.20 * confidence(stakeholder_management) * 100
)
```

This formula combines a capability estimate and confidence estimate in the same weighted score. That is a design assumption requiring justification.

### Time risk

```text
100 - (
  0.40 * domain_expertise * 10
+ 0.35 * operational_execution * 10
+ 0.25 * WFS
)
```

### Adaptability

**Phase 1C correctness fix** (`docs/architecture/KNOWN_LIMITATIONS.md` P0.2, `docs/decisions/ADR-0003-runtime-provider-configuration.md`): the formula previously included a `0.35 * cross_scenario_consistency` term fed a hardcoded `75` at the call site — meaning even a candidate scoring 0 on every real criterion still received a fabricated 26.25-point floor. That term has been removed, not replaced with another constant or an invented replacement formula. The three genuinely model-derived criteria keep their relative weight to each other, renormalized to sum to 1.0:

```text
raw = 0.25 * transformation_leadership * 10
    + 0.20 * stakeholder_management * 10
    + 0.20 * innovation_digital * 10

AdaptabilityScore = raw / 0.65
```

`cross_scenario_consistency` itself is no longer computed as a number at all — it is returned as the literal string `"not_measured"` in the API response (`outcome_models`, `candidate_evaluations[].outcome_model`, `adaptability_profiles`) and displayed as such in the UI, rather than silently feeding a fabricated value into a hidden internal calculation with zero visibility. Genuine cross-scenario consistency requires actually running the pipeline against multiple scenarios and comparing results — that capability does not exist yet (Phase 3, `docs/V2_ROADMAP.md`).

**Post-review correction (Phase 1D)**: `adaptability_profiles[].best_scenario` and `.worst_scenario` previously reported the current run's scenario as "best" and a fixed phrase ("Rapid crisis/pivot scenario") as "worst," which implied the system had actually observed how each candidate performs across different scenarios. It hadn't — no multi-scenario execution occurs. Both fields are now always the literal string `"not_measured"`, and the accompanying `resilience_note` states only that the adaptability score is "a heuristic derived only from the criteria observed in this run" and that cross-scenario resilience has not been measured — it no longer claims a candidate performs best in the current scenario or would struggle in a rapid pivot/crisis scenario.

### Opportunity-cost risk

```text
(ExecutionRisk + CultureRisk + TimeRisk) / 3
```

Despite its name, this is currently the average of three risk measures. It does not calculate the benefit lost by not choosing an alternative candidate.

### Expected outcome score

```text
0.35 * WFS
+ 0.20 * AdaptabilityScore
+ 0.20 * (100 - ExecutionRisk)
+ 0.10 * (100 - CultureRisk)
+ 0.10 * (100 - TimeRisk)
+ 0.05 * OverallConfidence * 100
```

### Risk-adjusted score

```text
WFS
- 0.25 * ExecutionRisk
- 0.20 * CultureRisk
- 0.15 * TimeRisk
- 0.15 * (1 - OverallConfidence) * 100
- 0.10 * (100 - AdaptabilityScore)
- 0.15 * OpportunityCostRisk
```

This is a signed penalty-adjusted net score. It can be negative when modeled
penalties exceed weighted fit. The existing calculation rounds to two decimals,
then enforces the public `-100…100` boundary; ranking uses that same final
value. It is neither a percentage nor a calibrated probability.

### Pair score

```text
0.30 * scenario_coverage
+ 0.25 * complementarity
+ 0.20 * execution_cohesion
+ 0.15 * pair_adaptability
- 0.10 * conflict_risk
- 0.05 * overlap_risk
```

The baseline implementation scales and clamps this result, then divides by 10 for display.

## Prototype assumptions requiring validation

1. Seven fixed criteria are sufficient for every leadership role.
2. Criterion values can be inferred reliably from short free-text candidate descriptions.
3. Model self-confidence correlates with scoring correctness.
4. The selected coefficients reflect real organizational outcomes.
5. Linear weighted sums adequately model interactions between leadership traits.
6. “Culture risk” can be inferred from the current inputs without introducing harmful proxies.
7. Pair compatibility can be estimated from short descriptions without team, role, or behavioral data.
8. The same model can interpret evidence and then fairly judge confidence in its own interpretation.
9. A single scenario label contains enough context to shift role weights correctly.
10. The model-generated explanation will remain faithful to deterministic metrics.

## Required V2 language

Until validation exists, documentation and UI should use terms such as:

- “prototype heuristic score”;
- “model-estimated criterion score”;
- “evidence availability indicator” rather than calibrated probability;
- “decision-support recommendation” rather than hiring decision;
- “requires human review.”

Avoid claims that the system predicts job performance, removes bias, or objectively identifies the best person.
