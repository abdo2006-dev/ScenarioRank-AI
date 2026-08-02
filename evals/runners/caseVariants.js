/**
 * @file Controlled case-variant utilities (Phase 3A evaluation harness).
 *
 * These produce a *derived* case from an existing one, changing exactly one
 * controlled thing and nothing else. Candidate IDs are always preserved, and
 * `variant_of` always links back to the original, so the two results remain
 * comparable.
 *
 * Honest scope note: under the offline fake provider, wording and
 * irrelevant-text variants are guaranteed to produce identical results,
 * because the fixture scores by candidate ID and never reads description text.
 * They validate the machinery — the linkage, the comparison, the reporting —
 * not the model. Only a live run can say whether wording actually moves a real
 * model's scores. This is stated in docs/evaluation/BENCHMARK_V1.md rather
 * than left for a reader to infer from a green result.
 */
import { benchmarkCaseSchema } from "../schemas/benchmarkCase.js";

function derive(original, overrides, variantKind, titleSuffix) {
  const variant = {
    ...structuredClone(original),
    ...overrides,
    variant_of: original.variant_of ?? original.case_id,
    variant_kind: variantKind,
    // Scoped observations belong only to the released source execution. A
    // generated test variant must never inherit a suppression for another ID.
    known_defects: [],
    title: `${original.title} (${titleSuffix})`,
    tags: [...new Set([...original.tags, "permutation"])],
  };
  return variant;
}

/**
 * Reverses the submitted candidate order. Deterministic expectations are
 * rewritten to match the new order, because `expected_candidate_ids` mirrors
 * the submitted list — the *set* is unchanged, which is the point.
 * @param {object} original validated benchmark case
 * @param {string} caseId ID to give the variant
 */
export function createCandidateOrderVariant(original, caseId) {
  const candidates = [...original.input.candidates].reverse();
  return derive(
    original,
    {
      case_id: caseId,
      input: { ...structuredClone(original.input), candidates },
      deterministic_expectations: {
        ...structuredClone(original.deterministic_expectations),
        expected_candidate_ids: candidates.map((candidate) => candidate.id),
      },
    },
    "candidate-order",
    "candidate order reversed",
  );
}

/**
 * Reverses scenario order, moving each scenario's weight deltas and score
 * overrides with it so each scenario keeps its own configuration.
 * @param {object} original
 * @param {string} caseId
 */
export function createScenarioOrderVariant(original, caseId) {
  const scenarios = [...original.input.scenarios].reverse();
  const lastIndex = original.input.scenarios.length - 1;
  const remap = (record) => {
    if (!record) return undefined;
    return Object.fromEntries(
      Object.entries(record).map(([index, value]) => [String(lastIndex - Number(index)), value]),
    );
  };

  const plan = structuredClone(original.fake_provider_plan);
  const remappedOverrides = remap(plan.scenario_overrides);
  const remappedDeltas = remap(plan.scenario_weight_deltas);
  if (remappedOverrides) plan.scenario_overrides = remappedOverrides;
  if (remappedDeltas) plan.scenario_weight_deltas = remappedDeltas;

  return derive(
    original,
    {
      case_id: caseId,
      input: { ...structuredClone(original.input), scenarios },
      deterministic_expectations: {
        ...structuredClone(original.deterministic_expectations),
        required_scenario_coverage: scenarios,
      },
      fake_provider_plan: plan,
    },
    "scenario-order",
    "scenario order reversed",
  );
}

/**
 * Applies a caller-supplied rewrite to each candidate description. The caller
 * owns the rewrite because "semantically equivalent" is a judgment a function
 * cannot make: a mechanical synonym swap would silently change meaning.
 * @param {object} original
 * @param {string} caseId
 * @param {(description: string, candidate: object) => string} rewrite
 */
export function createWordingVariant(original, caseId, rewrite) {
  const input = structuredClone(original.input);
  input.candidates = input.candidates.map((candidate) => ({
    ...candidate,
    description: rewrite(candidate.description, candidate),
  }));
  return derive(original, { case_id: caseId, input }, "equivalent-wording", "reworded");
}

/**
 * Appends one decision-irrelevant sentence to each candidate description.
 * The default sentences are deliberately mundane and carry no demographic,
 * protected, or evaluative signal — this case tests robustness to noise, and
 * the benchmark makes no fairness claims of any kind.
 * @param {object} original
 * @param {string} caseId
 * @param {string[]} [sentences] one per candidate, cycled if shorter
 */
export function createIrrelevantTextVariant(
  original,
  caseId,
  sentences = [
    "The office is a twenty-minute walk from the nearest station.",
    "The interview was scheduled for a Tuesday afternoon.",
    "The application was submitted through the standard portal.",
  ],
) {
  const input = structuredClone(original.input);
  input.candidates = input.candidates.map((candidate, index) => ({
    ...candidate,
    description: `${candidate.description} ${sentences[index % sentences.length]}`,
  }));
  return derive(original, { case_id: caseId, input }, "irrelevant-text", "irrelevant sentence added");
}

/**
 * Validates a generated variant against the same schema committed cases use.
 * A variant that would not be accepted as a committed case is a bug in the
 * generator, not an acceptable runtime shortcut.
 * @param {object} variant
 */
export function validateVariant(variant) {
  const result = benchmarkCaseSchema.safeParse(variant);
  if (result.success) return result.data;
  throw new Error(
    `Generated variant "${variant.case_id}" is not a valid benchmark case:\n${result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n")}`,
  );
}
