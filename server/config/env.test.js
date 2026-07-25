import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadEnv,
  checkProviderConfig,
  resolveStartupAiStatus,
  resolveCandidateConcurrency,
  SUPPORTED_PROVIDERS,
  DEFAULT_CANDIDATE_CONCURRENCY,
} from "./env.js";

function withTempDir(files, run) {
  const dir = mkdtempSync(join(tmpdir(), "scenariorank-env-test-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("loadEnv precedence", () => {
  it("loads .env when only .env exists", () => {
    withTempDir({ ".env": "FOO=from-env\n" }, (dir) => {
      const env = {};
      const { loadedFiles } = loadEnv({ cwd: dir, env });
      expect(env.FOO).toBe("from-env");
      expect(loadedFiles).toEqual([".env"]);
    });
  });

  it(".env.local overrides .env for the same key", () => {
    withTempDir({ ".env": "FOO=from-env\n", ".env.local": "FOO=from-env-local\n" }, (dir) => {
      const env = {};
      loadEnv({ cwd: dir, env });
      expect(env.FOO).toBe("from-env-local");
    });
  });

  it("merges distinct keys from both files", () => {
    withTempDir({ ".env": "A=a\n", ".env.local": "B=b\n" }, (dir) => {
      const env = {};
      loadEnv({ cwd: dir, env });
      expect(env).toMatchObject({ A: "a", B: "b" });
    });
  });

  it("never overrides a value already present in the real environment", () => {
    withTempDir({ ".env": "FOO=from-env\n", ".env.local": "FOO=from-env-local\n" }, (dir) => {
      const env = { FOO: "from-real-shell" };
      loadEnv({ cwd: dir, env });
      expect(env.FOO).toBe("from-real-shell");
    });
  });

  it("is a no-op when neither file exists", () => {
    withTempDir({}, (dir) => {
      const env = {};
      const { loadedFiles } = loadEnv({ cwd: dir, env });
      expect(env).toEqual({});
      expect(loadedFiles).toEqual([]);
    });
  });

  it("ignores blank lines and comments, strips surrounding quotes", () => {
    withTempDir({ ".env": "# comment\n\nFOO=\"quoted value\"\nBAR='single'\n" }, (dir) => {
      const env = {};
      loadEnv({ cwd: dir, env });
      expect(env.FOO).toBe("quoted value");
      expect(env.BAR).toBe("single");
    });
  });
});

describe("checkProviderConfig", () => {
  it("supports exactly groq and gemini", () => {
    expect(SUPPORTED_PROVIDERS).toEqual(["groq", "gemini"]);
  });

  it("fails when AI_PROVIDER is unset", () => {
    const result = checkProviderConfig({ env: {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/AI_PROVIDER is not set/);
  });

  it("fails for an unsupported provider name", () => {
    const result = checkProviderConfig({ env: { AI_PROVIDER: "anthropic" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Unsupported AI_PROVIDER/);
  });

  it("fails for groq without GROQ_API_KEY", () => {
    const result = checkProviderConfig({ env: { AI_PROVIDER: "groq" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/GROQ_API_KEY/);
  });

  it("succeeds for groq with GROQ_API_KEY", () => {
    const result = checkProviderConfig({ env: { AI_PROVIDER: "groq", GROQ_API_KEY: "x" } });
    expect(result).toEqual({ ok: true, provider: "groq" });
  });

  it("fails for gemini without GEMINI_API_KEY", () => {
    const result = checkProviderConfig({ env: { AI_PROVIDER: "gemini", GEMINI_MODEL: "gemini-x" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/GEMINI_API_KEY/);
  });

  it("fails for gemini without GEMINI_MODEL even with a valid key", () => {
    const result = checkProviderConfig({ env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "x" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/GEMINI_MODEL/);
  });

  it("succeeds for gemini with both required values", () => {
    const result = checkProviderConfig({ env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "x", GEMINI_MODEL: "gemini-x" } });
    expect(result).toEqual({ ok: true, provider: "gemini" });
  });
});

describe("resolveStartupAiStatus", () => {
  it("in development, tolerates missing config and marks AI unavailable instead of throwing", () => {
    const status = resolveStartupAiStatus({ env: {}, nodeEnv: "development" });
    expect(status.aiEnabled).toBe(false);
    expect(status.reason).toMatch(/AI_PROVIDER is not set/);
  });

  it("in production, throws clearly on missing/invalid config", () => {
    expect(() => resolveStartupAiStatus({ env: {}, nodeEnv: "production" })).toThrow(
      /AI provider configuration is invalid at startup/
    );
  });

  it("in production, starts normally with valid config", () => {
    const status = resolveStartupAiStatus({
      env: { AI_PROVIDER: "groq", GROQ_API_KEY: "x" },
      nodeEnv: "production",
    });
    expect(status).toEqual({ aiEnabled: true, provider: "groq", reason: null });
  });

  it("in development, starts normally with valid config", () => {
    const status = resolveStartupAiStatus({
      env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "x", GEMINI_MODEL: "gemini-x" },
      nodeEnv: "development",
    });
    expect(status).toEqual({ aiEnabled: true, provider: "gemini", reason: null });
  });
});

describe("resolveCandidateConcurrency", () => {
  it("defaults to 1 when AI_CANDIDATE_CONCURRENCY is unset", () => {
    expect(resolveCandidateConcurrency({ env: {} })).toEqual({ value: 1, usedDefault: true });
    expect(DEFAULT_CANDIDATE_CONCURRENCY).toBe(1);
  });

  it("defaults to 1 when the value is an empty string", () => {
    expect(resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "" } })).toEqual({ value: 1, usedDefault: true });
  });

  it("accepts a valid override within range", () => {
    expect(resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "3" } })).toEqual({ value: 3, usedDefault: false });
  });

  it("accepts the boundary values 1 and 4", () => {
    expect(resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "1" } })).toEqual({ value: 1, usedDefault: false });
    expect(resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "4" } })).toEqual({ value: 4, usedDefault: false });
  });

  it("falls back to the default for a non-integer value", () => {
    const result = resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "2.5" } });
    expect(result).toEqual({ value: 1, usedDefault: true, invalidInput: "2.5" });
  });

  it("falls back to the default for a non-numeric value", () => {
    const result = resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "fast" } });
    expect(result).toEqual({ value: 1, usedDefault: true, invalidInput: "fast" });
  });

  it("falls back to the default when the value is out of the 1-4 range", () => {
    expect(resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "0" } })).toEqual({ value: 1, usedDefault: true, invalidInput: "0" });
    expect(resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "5" } })).toEqual({ value: 1, usedDefault: true, invalidInput: "5" });
    expect(resolveCandidateConcurrency({ env: { AI_CANDIDATE_CONCURRENCY: "-1" } })).toEqual({ value: 1, usedDefault: true, invalidInput: "-1" });
  });
});
