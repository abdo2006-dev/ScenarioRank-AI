/**
 * @file Provider request observer (Phase 3A evaluation harness).
 *
 * Wraps any `AIProvider` (fake or real) and records *what the pipeline asked
 * for* — never what came back, never credentials, never raw payloads. Two
 * graders depend on this:
 *
 *   - candidate coverage, to confirm the scoring stage requested exactly the
 *     submitted candidate set;
 *   - pairing integrity, to confirm every expected unordered pair was
 *     evaluated. The response only exposes the top three pairs, so pair
 *     coverage genuinely cannot be verified from the response alone.
 *
 * Only derived identifiers are kept (candidate IDs, canonical pair keys, per-
 * stage attempt counts). Prompt text, system text, response bodies, headers,
 * and API keys are never retained, so a trace is safe to write into a run
 * artifact.
 */
import { canonicalPairKey } from "../schemas/benchmarkCase.js";

const CANDIDATE_ID_PATTERN = /candidate_id: (\S+)\nName:/g;
const PAIR_PATTERN = /candidate_id_a: ([^,\s]+), candidate_id_b: ([^,)\s]+)/g;

/**
 * @param {{ name: string, generateStructured: Function }} inner
 * @returns {{ provider: object, trace: { requestedCandidateIds: string[]|null, requestedPairKeys: string[]|null, attemptsByStage: Record<string, number> } }}
 */
export function createObservingProvider(inner) {
  const trace = {
    requestedCandidateIds: null,
    requestedPairKeys: null,
    attemptsByStage: {},
  };

  const provider = {
    name: inner.name,
    model: inner.model,
    async generateStructured(request) {
      trace.attemptsByStage[request.promptId] = (trace.attemptsByStage[request.promptId] ?? 0) + 1;

      if (request.promptId === "batch-candidate-scoring" && trace.requestedCandidateIds === null) {
        trace.requestedCandidateIds = [
          ...request.prompt.matchAll(CANDIDATE_ID_PATTERN),
        ].map((match) => match[1]);
      }
      if (request.promptId === "batch-pairing-analysis" && trace.requestedPairKeys === null) {
        trace.requestedPairKeys = [...request.prompt.matchAll(PAIR_PATTERN)].map((match) =>
          canonicalPairKey(match[1], match[2]),
        );
      }

      return inner.generateStructured(request);
    },
  };

  return { provider, trace };
}
