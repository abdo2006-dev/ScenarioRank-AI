import { describe, expect, it } from "vitest";
import { scenarioGenerationResponseSchema } from "../../shared/contracts/decisionApi.js";
import { generateScenarios } from "./scenarioGeneration.js";

describe("scenario generation fallback transport", () => {
  it("returns a valid generic fallback without exposing provider details", async () => {
    const provider = { generateStructured: async () => { throw new Error("sk-live-secret https://internal.example/provider"); } };
    const result = await generateScenarios(provider, "VP", "Leads growth and culture.");
    expect(result.source).toBe("fallback");
    expect(result.scenarios.length).toBeGreaterThan(0);
    expect(result.note).toBe("AI scenario generation failed; local fallback scenarios were used.");
    expect(JSON.stringify(result)).not.toContain("sk-live-secret");
    expect(scenarioGenerationResponseSchema.safeParse(result).success).toBe(true);
  });
});
