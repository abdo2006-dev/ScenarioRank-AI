import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvaluationRequest } from "../contracts";
import { DECISION_INPUT_LIMITS } from "../contracts";
import { pipelineResponseFixture } from "../test/fixtures";
import {
  generateScenarios,
  getAiEnabled,
  runEvaluation,
} from "./decisionApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const evaluationRequest: EvaluationRequest = {
  role: {
    title: "VP of Growth",
    description: "Leads the growth function.",
  },
  scenario: "Enter a new market",
  decision_mode: "best_fit",
  candidates: [
    {
      id: "a",
      name: "Alice",
      description: "Experienced operator.",
    },
    {
      id: "b",
      name: "Bob",
      description: "Experienced strategist.",
    },
  ],
  options: {
    enable_pair_simulation: false,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function streamResponse(...chunks: string[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
  );
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function abortingFetch() {
  return (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("native abort detail", "AbortError")),
        { once: true },
      );
    });
}

afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
});

describe("getAiEnabled", () => {
  it("returns true for a valid enabled health response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "ok",
        ai_enabled: true,
        ai_provider: "openai",
        ai_model: "gpt-5-mini",
        limits: {
          max_candidates: 5, max_scenarios: 5, role_title_max_chars: 120,
          role_description_max_chars: 4000, scenario_max_chars: 2000,
          candidate_name_max_chars: 120, candidate_description_max_chars: 4000,
        },
      }),
    );

    await expect(getAiEnabled()).resolves.toBe(true);
  });

  it("returns false for a valid disabled health response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "ok",
        ai_enabled: false,
        ai_provider: null,
        ai_model: null,
        limits: {
          max_candidates: 5, max_scenarios: 5, role_title_max_chars: 120,
          role_description_max_chars: 4000, scenario_max_chars: 2000,
          candidate_name_max_chars: 120, candidate_description_max_chars: 4000,
        },
      }),
    );

    await expect(getAiEnabled()).resolves.toBe(false);
  });

  it("returns false for a non-OK health response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));
    await expect(getAiEnabled()).resolves.toBe(false);
  });

  it("returns false for a health network failure", async () => {
    fetchMock.mockRejectedValue(new Error("internal network detail"));
    await expect(getAiEnabled()).resolves.toBe(false);
  });

  it("returns false for an invalid health contract", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "ok",
        ai_enabled: false,
        ai_provider: "impossible-provider",
        ai_model: null,
      }),
    );

    await expect(getAiEnabled()).resolves.toBe(false);
  });
});

describe("generateScenarios", () => {
  it("returns a validated AI response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        scenarios: ["Enter a new market"],
        source: "ai",
      }),
    );

    await expect(
      generateScenarios(evaluationRequest.role, 1_000),
    ).resolves.toEqual({
      scenarios: ["Enter a new market"],
      source: "ai",
    });
  });

  it("returns a validated fallback response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        scenarios: ["Stabilize a critical team"],
        source: "fallback",
        note: "Local fallback scenarios were used.",
      }),
    );

    await expect(
      generateScenarios(evaluationRequest.role, 1_000),
    ).resolves.toMatchObject({
      source: "fallback",
    });
  });

  it("uses a stable message for a non-OK response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          message: "provider key and upstream URL",
        },
        502,
      ),
    );

    await expect(
      generateScenarios(evaluationRequest.role, 1_000),
    ).rejects.toThrow("Scenario generation failed. Please try again.");
  });

  it("rejects an invalid scenario response contract", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        scenarios: ["s".repeat(DECISION_INPUT_LIMITS.scenario.max + 1)],
        source: "ai",
      }),
    );

    await expect(
      generateScenarios(evaluationRequest.role, 1_000),
    ).rejects.toThrow("The server returned an invalid scenario response.");
  });

  it("validates the request before calling fetch", async () => {
    await expect(
      generateScenarios(
        {
          title: "",
          description: "Missing title.",
        },
        1_000,
      ),
    ).rejects.toThrow("Enter a role title and description first.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("converts timeout aborts to a stable message", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(abortingFetch());

    const request = generateScenarios(evaluationRequest.role, 50);
    const expectation = expect(request).rejects.toThrow(
      "Scenario generation timed out. Please try again.",
    );
    await vi.advanceTimersByTimeAsync(51);

    await expectation;
  });

  it("converts a network failure to a stable message", async () => {
    fetchMock.mockRejectedValue(new Error("socket to secret-host failed"));

    await expect(
      generateScenarios(evaluationRequest.role, 1_000),
    ).rejects.toThrow("Scenario generation failed. Please try again.");
  });

  it("never exposes raw response details", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: "upstream_failed",
          message: "Bearer secret at https://provider.example/internal",
        },
        500,
      ),
    );

    const error = await generateScenarios(
      evaluationRequest.role,
      1_000,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Scenario generation failed. Please try again.",
    );
  });
});

describe("runEvaluation", () => {
  it("accepts a valid stage update followed by complete", async () => {
    const response = pipelineResponseFixture();
    const stages = response.pipeline_steps;
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("stage_update", stages),
        sseEvent("complete", response),
      ),
    );
    const onStage = vi.fn();

    await expect(
      runEvaluation(evaluationRequest, onStage, 1_000),
    ).resolves.toEqual(response);
    expect(onStage).toHaveBeenCalledWith(stages);
  });

  it("accepts a signed risk-adjusted score in a complete event", async () => {
    const base = pipelineResponseFixture();
    const response = pipelineResponseFixture({
      candidate_evaluations: base.candidate_evaluations.map((candidate, index) => ({
        ...candidate,
        risk_adjusted_score: index === 1 ? -30 : candidate.risk_adjusted_score,
      })),
    });
    fetchMock.mockResolvedValue(streamResponse(sseEvent("complete", response)));

    await expect(runEvaluation(evaluationRequest, vi.fn(), 1_000)).resolves.toEqual(response);
  });

  it("parses an event divided across several stream chunks", async () => {
    const response = pipelineResponseFixture();
    const complete = sseEvent("complete", response);
    fetchMock.mockResolvedValue(
      streamResponse(
        complete.slice(0, 9),
        complete.slice(9, 47),
        complete.slice(47),
      ),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).resolves.toEqual(response);
  });

  it("parses multiple events delivered in one chunk", async () => {
    const response = pipelineResponseFixture();
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("stage_update", response.pipeline_steps) +
          sseEvent("complete", response),
      ),
    );
    const onStage = vi.fn();

    await runEvaluation(evaluationRequest, onStage, 1_000);
    expect(onStage).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-OK evaluation response safely", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow(
      "The server could not start the evaluation. Please try again.",
    );
  });

  it("rejects a response without a stream body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The server returned no evaluation stream.");
  });

  it("preserves a validated safe server error", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("error", {
          message: "The evaluation could not be completed.",
        }),
      ),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The evaluation could not be completed.");
  });

  it("rejects an invalid server error contract safely", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("error", {
          message: "",
          internal: "secret",
        }),
      ),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The server returned an invalid error response.");
  });

  it("converts malformed JSON to a stable message", async () => {
    fetchMock.mockResolvedValue(
      streamResponse("event: complete\ndata: not-json\n\n"),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The server returned a malformed evaluation stream.");
  });

  it("rejects an invalid stage-update contract", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("stage_update", [
          {
            id: "input",
            label: "Input Received",
            status: "completed",
            duration_ms: -1,
          },
        ]),
      ),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The server returned an invalid progress update.");
  });

  it("rejects an invalid complete contract", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("complete", {
          request_id: "incomplete",
        }),
      ),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The server returned an invalid evaluation response.");
  });

  it("rejects a stream that closes without complete", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(sseEvent("stage_update", [])),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("Stream ended before the evaluation completed.");
  });

  it("uses the validated server error when the stream closes", async () => {
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("error", {
          message: "The safe server explanation.",
        }),
      ),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The safe server explanation.");
  });

  it("converts an evaluation timeout abort to a stable message", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(abortingFetch());

    const result = runEvaluation(evaluationRequest, vi.fn(), 50);
    const expectation = expect(result).rejects.toThrow(
      "The evaluation timed out. Please try again.",
    );
    await vi.advanceTimersByTimeAsync(51);

    await expectation;
  });

  it("converts an evaluation network failure to a stable message", async () => {
    fetchMock.mockRejectedValue(
      new Error("request to https://private.example failed"),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The evaluation connection failed. Please try again.");
  });

  it("cancels the reader after successful completion", async () => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            sseEvent("complete", pipelineResponseFixture()),
          ),
        );
      },
      cancel,
    });
    fetchMock.mockResolvedValue(new Response(body));

    await runEvaluation(evaluationRequest, vi.fn(), 1_000);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown event types for forward compatibility", async () => {
    const response = pipelineResponseFixture();
    fetchMock.mockResolvedValue(
      streamResponse(
        sseEvent("future_event", {
          ignored: true,
        }),
        sseEvent("complete", response),
      ),
    );

    await expect(
      runEvaluation(evaluationRequest, vi.fn(), 1_000),
    ).resolves.toEqual(response);
  });

  it("does not expose raw stream-reader errors", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("reader failed at https://private.example");
      },
    });
    fetchMock.mockResolvedValue(new Response(body));

    const error = await runEvaluation(
      evaluationRequest,
      vi.fn(),
      1_000,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "The evaluation connection failed. Please try again.",
    );
  });

  it("validates the evaluation request before fetch", async () => {
    const invalidRequest = {
      ...evaluationRequest,
      candidates: [evaluationRequest.candidates[0]],
    };

    await expect(
      runEvaluation(invalidRequest, vi.fn(), 1_000),
    ).rejects.toThrow("The evaluation request is invalid.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
