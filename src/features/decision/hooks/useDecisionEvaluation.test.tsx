import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipelineResponse, PipelineStage } from "../contracts";
import { DECISION_INPUT_LIMITS } from "../contracts";
import { DEFAULT_CANDIDATES } from "../constants";
import { pipelineResponseFixture } from "../test/fixtures";
import * as api from "../api/decisionApi";
import { SafeDecisionClientError } from "../api/decisionApi";
import { useDecisionEvaluation } from "./useDecisionEvaluation";

vi.mock("../api/decisionApi", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../api/decisionApi")
  >();
  return {
    ...actual,
    getHealth: vi.fn(),
    generateScenarios: vi.fn(),
    runEvaluation: vi.fn(),
  };
});

const mockedApi = vi.mocked(api);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function health(maxCandidates = 5, aiEnabled = true) {
  return {
    status: "ok" as const,
    ai_enabled: aiEnabled,
    ai_provider: aiEnabled ? "openai" : null,
    ai_model: aiEnabled ? "gpt-5-mini" : null,
    limits: {
      max_candidates: maxCandidates,
      max_scenarios: 5,
      role_title_max_chars: 120,
      role_description_max_chars: 4000,
      scenario_max_chars: 2000,
      candidate_name_max_chars: 120,
      candidate_description_max_chars: 4000,
    },
  };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("useDecisionEvaluation health teardown", () => {
  it("does not act on a late health response after unmount (regression: teardown unhandled rejection)", async () => {
    const pendingHealth = deferred<ReturnType<typeof health>>();
    mockedApi.getHealth.mockReturnValue(pendingHealth.promise);
    const { unmount } = renderHook(() => useDecisionEvaluation());

    unmount();

    const realWindow = globalThis.window;
    // Simulates the destroyed-jsdom-environment state a slow health
    // response can outlive between Vitest test files; the effect's own
    // cleanup guard — not `window` happening to still exist — is what
    // must prevent this from throwing.
    // @ts-expect-error -- deliberately simulating a torn-down test environment
    delete globalThis.window;

    let caught: unknown = null;
    try {
      await act(async () => {
        pendingHealth.resolve(health());
        await pendingHealth.promise;
      });
    } catch (error) {
      caught = error;
    } finally {
      globalThis.window = realWindow;
    }

    expect(caught).toBeNull();
  });
});

describe("useDecisionEvaluation health", () => {
  it("sets AI enabled from the initial health request", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    const { result } = renderHook(() => useDecisionEvaluation());

    await waitFor(() => expect(result.current.aiEnabled).toBe(true));
    expect(mockedApi.getHealth).toHaveBeenCalledTimes(1);
  });

  it("sets AI disabled from a separate initial mount", async () => {
    mockedApi.getHealth.mockResolvedValue(health(5, false));
    const { result } = renderHook(() => useDecisionEvaluation());

    await waitFor(() => expect(result.current.aiEnabled).toBe(false));
    expect(mockedApi.getHealth).toHaveBeenCalledTimes(1);
  });
});

describe("useDecisionEvaluation inputs", () => {
  it("starts with the shared technical minimum of valid default candidates", () => {
    mockedApi.getHealth.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useDecisionEvaluation());

    expect(result.current.maxCandidates).toBe(
      DECISION_INPUT_LIMITS.candidates.min,
    );
    expect(result.current.candidates).toEqual(DEFAULT_CANDIDATES.slice(
      0,
      DECISION_INPUT_LIMITS.candidates.min,
    ));
    act(() => result.current.loadDefaults());
    expect(result.current.candidates).toHaveLength(
      DECISION_INPUT_LIMITS.candidates.min,
    );
  });

  it("does not leave a five-candidate default after health resolves to two", async () => {
    const pendingHealth = deferred<ReturnType<typeof health>>();
    mockedApi.getHealth.mockReturnValue(pendingHealth.promise);
    const { result } = renderHook(() => useDecisionEvaluation());

    expect(result.current.candidates).toHaveLength(
      DECISION_INPUT_LIMITS.candidates.min,
    );
    await act(async () => {
      pendingHealth.resolve(health(DECISION_INPUT_LIMITS.candidates.min));
      await pendingHealth.promise;
    });

    expect(result.current.maxCandidates).toBe(
      DECISION_INPUT_LIMITS.candidates.min,
    );
    expect(result.current.candidates).toHaveLength(
      DECISION_INPUT_LIMITS.candidates.min,
    );
  });

  it("loads exactly the runtime maximum when that maximum is two", async () => {
    mockedApi.getHealth.mockResolvedValue(
      health(DECISION_INPUT_LIMITS.candidates.min),
    );
    const { result } = renderHook(() => useDecisionEvaluation());

    await waitFor(() => expect(result.current.maxCandidates).toBe(
      DECISION_INPUT_LIMITS.candidates.min,
    ));
    act(() => result.current.loadDefaults());

    expect(result.current.candidates).toEqual(DEFAULT_CANDIDATES.slice(
      0,
      DECISION_INPUT_LIMITS.candidates.min,
    ));
  });

  it("loads no more than a resolved runtime maximum of five", async () => {
    mockedApi.getHealth.mockResolvedValue(health(5));
    const { result } = renderHook(() => useDecisionEvaluation());

    await waitFor(() => expect(result.current.maxCandidates).toBe(5));
    act(() => result.current.loadDefaults());

    expect(result.current.candidates.length).toBeLessThanOrEqual(5);
    expect(result.current.candidates).toEqual(DEFAULT_CANDIDATES.slice(0, 5));
  });

  it("does not silently remove manually entered candidates when health resolves", async () => {
    const pendingHealth = deferred<ReturnType<typeof health>>();
    mockedApi.getHealth.mockReturnValue(pendingHealth.promise);
    const { result } = renderHook(() => useDecisionEvaluation());
    const manuallyEnteredCandidates = DEFAULT_CANDIDATES.slice(0, 3);

    act(() => result.current.setCandidates(manuallyEnteredCandidates));
    await act(async () => {
      pendingHealth.resolve(health(DECISION_INPUT_LIMITS.candidates.min));
      await pendingHealth.promise;
    });

    expect(result.current.candidates).toEqual(manuallyEnteredCandidates);
  });

  it("resets every editable input", () => {
    mockedApi.getHealth.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useDecisionEvaluation());

    act(() => result.current.resetInputs());

    expect(result.current.phase).toBe("eval");
    expect(result.current.role).toEqual({
      title: "",
      description: "",
    });
    expect(result.current.scenarios).toEqual([]);
    expect(result.current.scenario).toBe("");
    expect(result.current.candidates).toEqual([]);
    expect(result.current.enablePairing).toBe(false);
  });
});

describe("useDecisionEvaluation scenario generation", () => {
  it("stores generated scenarios and selects the first", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    mockedApi.generateScenarios.mockResolvedValue({
      scenarios: ["New market", "Turnaround"],
      source: "ai",
    });
    const { result } = renderHook(() => useDecisionEvaluation());

    await act(async () => {
      await result.current.handleGenerateScenarios();
    });

    expect(result.current.scenarios).toEqual([
      "New market",
      "Turnaround",
    ]);
    expect(result.current.scenario).toBe("New market");
    expect(result.current.error).toBeNull();
    expect(result.current.isGeneratingScenarios).toBe(false);
  });

  it("stores a safe scenario-generation failure", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    mockedApi.generateScenarios.mockRejectedValue(
      new SafeDecisionClientError(
        "Scenario generation failed. Please try again.",
      ),
    );
    const { result } = renderHook(() => useDecisionEvaluation());

    await act(async () => {
      await result.current.handleGenerateScenarios();
    });

    expect(result.current.error).toBe(
      "Scenario generation failed. Please try again.",
    );
    expect(result.current.isGeneratingScenarios).toBe(false);
  });
});

describe("useDecisionEvaluation evaluation workflow", () => {
  it("accepts stage updates and transitions from running to results", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    const pending = deferred<PipelineResponse>();
    const updatedStages: PipelineStage[] = [
      {
        id: "input",
        label: "Input Received",
        status: "completed",
        duration_ms: 0,
      },
    ];
    mockedApi.runEvaluation.mockImplementation(
      async (_request, onStage) => {
        onStage(updatedStages);
        return pending.promise;
      },
    );
    const { result } = renderHook(() => useDecisionEvaluation());

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.handleRun();
    });

    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(result.current.stages).toEqual(updatedStages);

    const response = pipelineResponseFixture();
    pending.resolve(response);
    await act(async () => {
      await runPromise;
    });

    expect(result.current.response).toEqual(response);
    expect(result.current.phase).toBe("results");
    expect(result.current.error).toBeNull();
  });

  it("returns to evaluation and stores a safe evaluation failure", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    mockedApi.runEvaluation.mockRejectedValue(
      new SafeDecisionClientError(
        "The evaluation connection failed. Please try again.",
      ),
    );
    const { result } = renderHook(() => useDecisionEvaluation());

    await act(async () => {
      await result.current.handleRun();
    });

    expect(result.current.phase).toBe("eval");
    expect(result.current.error).toBe(
      "The evaluation connection failed. Please try again.",
    );
    expect(result.current.response).toBeNull();
  });

  it("includes the pairing stage when pairing is enabled", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    const pending = deferred<PipelineResponse>();
    mockedApi.runEvaluation.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useDecisionEvaluation());

    act(() => result.current.setEnablePairing(true));
    act(() => {
      void result.current.handleRun();
    });

    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(
      result.current.stages.some((stage) => stage.id === "pairing"),
    ).toBe(true);

    pending.reject(new Error("finish pending test"));
    await waitFor(() => expect(result.current.phase).toBe("eval"));
  });

  it("excludes the pairing stage when pairing is disabled", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    const pending = deferred<PipelineResponse>();
    mockedApi.runEvaluation.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useDecisionEvaluation());

    act(() => {
      void result.current.handleRun();
    });

    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(
      result.current.stages.some((stage) => stage.id === "pairing"),
    ).toBe(false);

    pending.reject(new Error("finish pending test"));
    await waitFor(() => expect(result.current.phase).toBe("eval"));
  });

  it("clears old response, error, and stage updates on a new run", async () => {
    mockedApi.getHealth.mockResolvedValue(health());
    mockedApi.runEvaluation.mockImplementationOnce(
      async (_request, onStage) => {
        onStage([
          {
            id: "old-stage",
            label: "Old Stage",
            status: "completed",
          },
        ]);
        return pipelineResponseFixture();
      },
    );
    mockedApi.generateScenarios.mockRejectedValueOnce(
      new SafeDecisionClientError("Previous safe error"),
    );
    const { result } = renderHook(() => useDecisionEvaluation());

    await act(async () => {
      await result.current.handleRun();
    });
    await act(async () => {
      await result.current.handleGenerateScenarios();
    });
    expect(result.current.response).not.toBeNull();
    expect(result.current.error).toBe("Previous safe error");

    const pending = deferred<PipelineResponse>();
    mockedApi.runEvaluation.mockReturnValueOnce(pending.promise);
    act(() => {
      void result.current.handleRun();
    });

    await waitFor(() => expect(result.current.phase).toBe("running"));
    expect(result.current.response).toBeNull();
    expect(result.current.error).toBeNull();
    expect(
      result.current.stages.some((stage) => stage.id === "old-stage"),
    ).toBe(false);

    pending.reject(new Error("finish pending test"));
    await waitFor(() => expect(result.current.phase).toBe("eval"));
  });

  it("schedules a smooth scroll after successful evaluation", async () => {
    vi.useFakeTimers();
    mockedApi.getHealth.mockResolvedValue(health());
    mockedApi.runEvaluation.mockResolvedValue(
      pipelineResponseFixture(),
    );
    const scrollIntoView = vi.fn();
    const { result } = renderHook(() => useDecisionEvaluation());
    Object.defineProperty(result.current.resultsRef, "current", {
      configurable: true,
      value: {
        scrollIntoView,
      },
    });

    await act(async () => {
      await result.current.handleRun();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
    });
  });
});
