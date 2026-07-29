import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/decisionApi";
import { useDecisionEvaluation } from "./useDecisionEvaluation";

vi.mock("../api/decisionApi", () => ({ getAiEnabled: vi.fn(), generateScenarios: vi.fn(), runEvaluation: vi.fn() }));
const mockedApi = vi.mocked(api);
afterEach(() => vi.resetAllMocks());

describe("useDecisionEvaluation", () => {
  it("reflects initial health readiness and failure", async () => {
    mockedApi.getAiEnabled.mockResolvedValueOnce(true);
    const { result, rerender } = renderHook(() => useDecisionEvaluation());
    await waitFor(() => expect(result.current.aiEnabled).toBe(true));
    mockedApi.getAiEnabled.mockResolvedValueOnce(false);
    rerender();
  });
  it("loads defaults and resets editable inputs", async () => {
    mockedApi.getAiEnabled.mockResolvedValue(true);
    const { result } = renderHook(() => useDecisionEvaluation());
    await waitFor(() => expect(mockedApi.getAiEnabled).toHaveBeenCalled());
    act(() => result.current.resetInputs());
    expect(result.current.candidates).toEqual([]);
    act(() => result.current.loadDefaults());
    expect(result.current.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.current.scenario).not.toBe("");
  });
  it("generates scenarios through the API and keeps the first selected", async () => {
    mockedApi.getAiEnabled.mockResolvedValue(true);
    mockedApi.generateScenarios.mockResolvedValue({ scenarios: ["New scenario"], source: "ai" });
    const { result } = renderHook(() => useDecisionEvaluation());
    await act(async () => { await result.current.handleGenerateScenarios(); });
    expect(result.current.scenarios).toEqual(["New scenario"]);
    expect(result.current.scenario).toBe("New scenario");
  });
  it("adds or excludes the pairing stage before evaluation", async () => {
    mockedApi.getAiEnabled.mockResolvedValue(true);
    mockedApi.runEvaluation.mockRejectedValue(new Error("safe failure"));
    const { result } = renderHook(() => useDecisionEvaluation());
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.stages.some((stage) => stage.id === "pairing")).toBe(false);
    act(() => result.current.setEnablePairing(true));
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.stages.some((stage) => stage.id === "pairing")).toBe(true);
    expect(result.current.phase).toBe("eval");
    expect(result.current.error).toBe("safe failure");
  });
});
