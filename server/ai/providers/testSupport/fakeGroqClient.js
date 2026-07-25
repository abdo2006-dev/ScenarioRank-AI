/**
 * Minimal fake replacing the parts of the groq-sdk client surface that
 * groqProvider.js actually calls. No network, no real SDK instantiation —
 * this is the dependency-injection boundary used by provider-contract
 * tests instead of patching the groq-sdk module globally.
 *
 * `script` is an array of step descriptors, consumed one per call (the
 * last entry repeats if more calls happen than script entries). Honoring
 * the real AbortSignal for "hang" steps means the adapter's actual
 * timeout/AbortController code path is exercised for real, not simulated.
 */
export function createFakeGroqClient(script) {
  const receivedMessages = [];
  const receivedBodies = [];
  let callCount = 0;

  return {
    chat: {
      completions: {
        create: (body, options) => {
          callCount += 1;
          receivedMessages.push(body.messages);
          receivedBodies.push(body);
          const step = script[Math.min(callCount - 1, script.length - 1)];
          return runStep(step, options?.signal);
        },
      },
    },
    get callCount() {
      return callCount;
    },
    get receivedMessages() {
      return receivedMessages;
    },
    get receivedBodies() {
      return receivedBodies;
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
          choices: [{ message: { content: step.text } }],
          usage: step.usage
            ? { prompt_tokens: step.usage.inputTokens, completion_tokens: step.usage.outputTokens }
            : undefined,
        });
        return;
      case "noContent":
        resolve({ choices: [{ message: { content: "" } }] });
        return;
      case "httpError": {
        const err = new Error(`Groq HTTP ${step.status}`);
        err.status = step.status;
        reject(err);
        return;
      }
      case "hang":
        // Intentionally never resolves; only settles via the abort listener above.
        return;
      default:
        reject(new Error(`Unknown fake step type: ${step.type}`));
    }
  });
}
