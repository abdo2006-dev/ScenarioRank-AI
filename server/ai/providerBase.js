/**
 * @file Shared structured-generation runner used by every provider adapter.
 *
 * This is where "parse safely, validate locally with Zod, never pass
 * unvalidated output to a caller, retry at most once with a sanitized
 * corrective summary (never the raw model output)" is implemented exactly
 * once. Each adapter (groqProvider.js, geminiProvider.js) only supplies a
 * `callSdk` function that performs its own SDK call and maps that SDK's
 * native errors into the shared error taxonomy — no provider SDK type or
 * error class is imported or referenced here.
 */

import { MalformedResponseError, SchemaValidationError } from "./errors.js";
import { withRetry } from "./retry.js";

/**
 * @param {object} params
 * @param {"groq"|"gemini"} params.providerName
 * @param {string} params.model
 * @param {import("./types.js").StructuredGenerationRequest} params.request
 * @param {(args: { system: string, prompt: string, correctivePromptSuffix: string, attempt: number }) => Promise<{ text: string, usage?: { inputTokens?: number, outputTokens?: number } }>} params.callSdk
 * @returns {Promise<import("./types.js").StructuredGenerationResult>}
 */
export async function runStructuredGeneration({ providerName, model, request, callSdk }) {
  const { system, prompt, schema, promptId, promptVersion } = request;

  const { data: attemptResult, attempts } = await withRetry(async ({ previousError }) => {
    const correctivePromptSuffix = buildCorrectiveSuffix(previousError);
    const start = Date.now();
    const { text, usage } = await callSdk({ system, prompt, correctivePromptSuffix });
    const latencyMs = Date.now() - start;

    const parsed = safeJsonParse(text);
    if (parsed === undefined) {
      throw new MalformedResponseError(
        `${providerName} response for "${promptId}" (${promptVersion}) was not valid JSON.`
      );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new SchemaValidationError(
        `${providerName} response for "${promptId}" (${promptVersion}) failed schema validation.`,
        { issues: summarizeZodIssues(result.error) }
      );
    }

    return { value: result.data, usage, latencyMs };
  });

  return {
    data: attemptResult.value,
    meta: {
      provider: providerName,
      model,
      latencyMs: attemptResult.latencyMs,
      attempts,
      ...(attemptResult.usage ? { usage: attemptResult.usage } : {}),
    },
  };
}

function buildCorrectiveSuffix(previousError) {
  if (!previousError) return "";
  if (previousError.code === "schema_validation" && previousError.issues?.length) {
    return (
      "\n\nYour previous response did not match the required shape. " +
      "Fix only these issues and return corrected JSON, nothing else:\n" +
      previousError.issues.map((issue) => `- ${issue}`).join("\n")
    );
  }
  if (previousError.code === "malformed_response") {
    return "\n\nYour previous response was not valid JSON. Return only valid JSON, no commentary or markdown fences.";
  }
  return "";
}

function safeJsonParse(text) {
  if (typeof text !== "string" || text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Sanitized, bounded validation summary — never the raw model output. */
function summarizeZodIssues(zodError) {
  return zodError.issues.slice(0, 8).map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  });
}
