/**
 * Minimal fake replacing the parts of the @google/genai client surface
 * that geminiProvider.js actually calls. Same shape/contract as
 * fakeGroqClient.js — see that file's header comment.
 */
export function createFakeGeminiClient(script) {
  const receivedContents = [];
  const receivedParams = [];
  let callCount = 0;

  return {
    models: {
      generateContent: (params) => {
        callCount += 1;
        receivedContents.push(params.contents);
        receivedParams.push(params);
        const step = script[Math.min(callCount - 1, script.length - 1)];
        return runStep(step, params.config?.abortSignal);
      },
    },
    get callCount() {
      return callCount;
    },
    get receivedContents() {
      return receivedContents;
    },
    get receivedParams() {
      return receivedParams;
    },
  };
}

function runStep(step, signal) {
  return new Promise((resolve, reject) => {
    if (signal) {
      signal.addEventListener("abort", () => {
        const err = new Error("Request aborted");
        err.name = "AbortError";
        reject(err);
      });
    }
    switch (step.type) {
      case "success":
        resolve({
          text: step.text,
          usageMetadata: step.usage
            ? { promptTokenCount: step.usage.inputTokens, candidatesTokenCount: step.usage.outputTokens }
            : undefined,
        });
        return;
      case "noContent":
        resolve({ text: undefined });
        return;
      case "httpError": {
        const err = new Error(`Gemini HTTP ${step.status}`);
        err.status = step.status;
        reject(err);
        return;
      }
      case "hang":
        return;
      default:
        reject(new Error(`Unknown fake step type: ${step.type}`));
    }
  });
}
