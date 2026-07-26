import { describe, it, expect } from "vitest";
import { createProvider } from "./providerFactory.js";
import { ConfigurationError } from "./errors.js";
import { DEFAULT_OPENAI_MODEL } from "./providers/openaiProvider.js";

describe("createProvider — single OpenAI provider (docs/decisions/ADR-0004-single-openai-provider.md)", () => {
  it("rejects construction when OPENAI_API_KEY is missing", () => {
    expect(() => createProvider({ env: {} })).toThrow(ConfigurationError);
    expect(() => createProvider({ env: {} })).toThrow(/OPENAI_API_KEY/);
  });

  it("builds an openai provider with the default model when OPENAI_MODEL is unset", () => {
    const provider = createProvider({ env: { OPENAI_API_KEY: "fake" } });
    expect(provider.name).toBe("openai");
    expect(provider.model).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("honors a custom OPENAI_MODEL", () => {
    const provider = createProvider({ env: { OPENAI_API_KEY: "fake", OPENAI_MODEL: "gpt-5.4-mini" } });
    expect(provider.model).toBe("gpt-5.4-mini");
  });

  it("accepts a valid OPENAI_REASONING_EFFORT", () => {
    expect(() => createProvider({ env: { OPENAI_API_KEY: "fake", OPENAI_REASONING_EFFORT: "minimal" } })).not.toThrow();
  });

  it("rejects an invalid OPENAI_REASONING_EFFORT", () => {
    expect(() => createProvider({ env: { OPENAI_API_KEY: "fake", OPENAI_REASONING_EFFORT: "ultra" } })).toThrow(ConfigurationError);
  });

  it("does not require OPENAI_REASONING_EFFORT to be set", () => {
    expect(() => createProvider({ env: { OPENAI_API_KEY: "fake" } })).not.toThrow();
  });
});
