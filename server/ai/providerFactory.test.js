import { describe, it, expect } from "vitest";
import { createProvider, SUPPORTED_PROVIDERS } from "./providerFactory.js";
import { ConfigurationError } from "./errors.js";

describe("createProvider — validation (explicit invocation only)", () => {
  it("supports exactly groq and gemini", () => {
    expect(SUPPORTED_PROVIDERS).toEqual(["groq", "gemini"]);
  });

  it("rejects an unsupported provider name", () => {
    expect(() => createProvider("anthropic", { env: {} })).toThrow(ConfigurationError);
    expect(() => createProvider("openai", { env: {} })).toThrow(ConfigurationError);
    expect(() => createProvider("", { env: {} })).toThrow(ConfigurationError);
  });

  it("rejects groq when GROQ_API_KEY is missing", () => {
    expect(() => createProvider("groq", { env: {} })).toThrow(/GROQ_API_KEY/);
  });

  it("builds a groq provider with the default model when GROQ_MODEL is unset", () => {
    const provider = createProvider("groq", { env: { GROQ_API_KEY: "fake" } });
    expect(provider.name).toBe("groq");
  });

  it("honors a custom GROQ_MODEL", () => {
    const provider = createProvider("groq", { env: { GROQ_API_KEY: "fake", GROQ_MODEL: "some-other-model" } });
    expect(provider.name).toBe("groq");
  });

  it("rejects gemini when GEMINI_API_KEY is missing", () => {
    expect(() => createProvider("gemini", { env: { GEMINI_MODEL: "gemini-x" } })).toThrow(/GEMINI_API_KEY/);
  });

  it("rejects gemini when GEMINI_MODEL is missing, even with a valid key", () => {
    expect(() => createProvider("gemini", { env: { GEMINI_API_KEY: "fake" } })).toThrow(/GEMINI_MODEL/);
  });

  it("builds a gemini provider when both GEMINI_API_KEY and GEMINI_MODEL are set", () => {
    const provider = createProvider("gemini", { env: { GEMINI_API_KEY: "fake", GEMINI_MODEL: "gemini-x" } });
    expect(provider.name).toBe("gemini");
  });

  it("does not require the non-selected provider's key to be present", () => {
    // Selecting groq must not fail just because GEMINI_API_KEY/GEMINI_MODEL are unset.
    expect(() => createProvider("groq", { env: { GROQ_API_KEY: "fake" } })).not.toThrow();
  });
});
