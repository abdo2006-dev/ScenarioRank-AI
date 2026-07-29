import { afterEach, describe, expect, it, vi } from "vitest";
import { generateScenarios, getAiEnabled, runEvaluation } from "./decisionApi";
import { pipelineResponseFixture } from "../test/fixtures";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const json = (body: unknown, ok = true) => new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } });
const stream = (...chunks: string[]) => new Response(new ReadableStream({ start(controller) { chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk))); controller.close(); } }));
const request = { role: { title: "VP", description: "Leads growth." }, scenario: "Growth", decision_mode: "best_fit" as const, candidates: [{ id: "a", name: "Alice", description: "Experience." }, { id: "b", name: "Bob", description: "Experience." }], options: { enable_pair_simulation: false } };

afterEach(() => { fetchMock.mockReset(); vi.useRealTimers(); });

describe("decision API health and scenario generation", () => {
  it.each([[true], [false]])("returns validated AI readiness (%s)", async (ai_enabled) => {
    fetchMock.mockResolvedValue(json({ status: "ok", ai_enabled, ai_provider: ai_enabled ? "openai" : null, ai_model: ai_enabled ? "gpt-5-mini" : null }));
    await expect(getAiEnabled()).resolves.toBe(ai_enabled);
  });
  it("treats non-OK, network, and invalid health responses as unavailable", async () => {
    fetchMock.mockResolvedValueOnce(json({}, false)).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(json({ status: "bad" }));
    await expect(getAiEnabled()).resolves.toBe(false);
    await expect(getAiEnabled()).resolves.toBe(false);
    await expect(getAiEnabled()).resolves.toBe(false);
  });
  it("returns validated AI and fallback scenario responses", async () => {
    fetchMock.mockResolvedValueOnce(json({ scenarios: ["Growth"], source: "ai" })).mockResolvedValueOnce(json({ scenarios: ["Fallback"], source: "fallback", note: "AI scenario generation failed; local fallback scenarios were used." }));
    await expect(generateScenarios({ title: "VP", description: "Leads growth." }, 1000)).resolves.toMatchObject({ source: "ai" });
    await expect(generateScenarios({ title: "VP", description: "Leads growth." }, 1000)).resolves.toMatchObject({ source: "fallback" });
  });
  it("uses safe errors for failed, invalid, and network scenario responses", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "provider secret" }, false)).mockResolvedValueOnce(json({ scenarios: [], source: "ai" })).mockRejectedValueOnce(new Error("network failure"));
    await expect(generateScenarios({ title: "VP", description: "Leads growth." }, 1000)).rejects.toThrow("Scenario generation failed. Please try again.");
    await expect(generateScenarios({ title: "VP", description: "Leads growth." }, 1000)).rejects.toThrow("invalid scenario response");
    await expect(generateScenarios({ title: "VP", description: "Leads growth." }, 1000)).rejects.toThrow("Scenario generation failed. Please try again.");
  });
  it("validates scenario request before fetching", async () => {
    await expect(generateScenarios({ title: "", description: "x" }, 1000)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("validates streamed progress and complete responses", async () => {
    const completed = pipelineResponseFixture();
    fetchMock.mockResolvedValue(stream(`event: stage_update\ndata: [{"id":"input","label":"Input Received","status":"completed"}]\n\nevent: complete\ndata: ${JSON.stringify(completed)}\n\n`));
    const stages = vi.fn();
    await expect(runEvaluation(request, stages, 1000)).resolves.toEqual(completed);
    expect(stages).toHaveBeenCalledTimes(1);
  });
  it("converts safe error and malformed stream payloads without parser detail", async () => {
    fetchMock.mockResolvedValueOnce(stream('event: error\ndata: {"message":"Safe server error"}\n\n')).mockResolvedValueOnce(stream("event: complete\ndata: nope\n\n"));
    await expect(runEvaluation(request, vi.fn(), 1000)).rejects.toThrow("Safe server error");
    await expect(runEvaluation(request, vi.fn(), 1000)).rejects.toThrow("The server returned a malformed evaluation stream.");
  });
});
