import { afterEach, describe, expect, it, vi } from "vitest";
import { generateScenarios, getAiEnabled } from "./decisionApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const json = (body: unknown, ok = true) => new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { "Content-Type": "application/json" } });

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
});
