import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipelineResponse, PipelineStage } from "../contracts";
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
    getAiEnabled: vi.fn(),
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

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("useDecisionEvaluation health", () => {
  it("sets AI enabled from the initial health request", async () => {
    mockedApi.getAiEnabled.mockResolvedValue(true);
    const { result } = renderHook(() => useDecisionEvaluation());

    await waitFor(() => expect(result.current.aiEnabled).toBe(true));
    expect(mockedApi.getAiEnabled).toHaveBeenCalledTimes(1);
  });

  it("sets AI disabled from a separate initial mount", async () => {
    mockedApi.getAiEnabled.mockResolvedValue(false);
    const { result } = renderHook(() => useDecisionEvaluation());

    await waitFor(() => expect(result.current.aiEnabled).toBe(false));
    expect(mockedApi.getAiEnabled).toHaveBeenCalledTimes(1);
  });
});

describe("useDecisionEvaluation inputs", () => {
  it("loads the documented defaults", async () => {
    mockedApi.getAiEnabled.mockReturnValue(
      new Promise<boolean>(() => undefined),
    );
    const { result } = renderHook(() => useDecisionEvaluation());

    act(() => result.current.resetInputs());
    act(() => result.current.loadDefaults());

    expect(result.current.phase).toBe("eval");
    expect(result.current.role.title).not.toBe("");
    expect(result.current.scenario).not.toBe("");
    expect(result.current.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.current.enablePairing).toBe(false);
  });

  it("resets every editable input", () => {
    mockedApi.getAiEnabled.mockReturnValue(
      new Promise<boolean>(() => undefined),
    );
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
    mockedApi.getAiEnabled.mockResolvedValue(true);
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
