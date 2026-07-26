import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadEnv,
  checkProviderConfig,
  resolveStartupAiStatus,
  resolveMaxCandidates,
  resolveMaxProviderRequestsPerRun,
  DEFAULT_AI_MAX_CANDIDATES,
  DEFAULT_AI_MAX_PROVIDER_REQUESTS_PER_RUN,
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

describe("checkProviderConfig — single OpenAI provider (docs/decisions/ADR-0004-single-openai-provider.md)", () => {
  it("fails when OPENAI_API_KEY is unset", () => {
    const result = checkProviderConfig({ env: {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/OPENAI_API_KEY/);
  });

  it("succeeds with only OPENAI_API_KEY set", () => {
    expect(checkProviderConfig({ env: { OPENAI_API_KEY: "x" } })).toEqual({ ok: true });
  });

  it("fails for an invalid OPENAI_REASONING_EFFORT", () => {
    const result = checkProviderConfig({ env: { OPENAI_API_KEY: "x", OPENAI_REASONING_EFFORT: "ultra" } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/OPENAI_REASONING_EFFORT/);
  });

  it("succeeds for a valid OPENAI_REASONING_EFFORT", () => {
    expect(checkProviderConfig({ env: { OPENAI_API_KEY: "x", OPENAI_REASONING_EFFORT: "minimal" } })).toEqual({ ok: true });
  });
});

describe("resolveStartupAiStatus", () => {
  it("in development, tolerates missing config and marks AI unavailable instead of throwing", () => {
    const status = resolveStartupAiStatus({ env: {}, nodeEnv: "development" });
    expect(status.aiEnabled).toBe(false);
    expect(status.reason).toMatch(/OPENAI_API_KEY/);
  });

  it("in production, throws clearly on missing/invalid config", () => {
    expect(() => resolveStartupAiStatus({ env: {}, nodeEnv: "production" })).toThrow(
      /AI provider configuration is invalid at startup/
    );
  });

  it("in production, starts normally with valid config", () => {
    const status = resolveStartupAiStatus({ env: { OPENAI_API_KEY: "x" }, nodeEnv: "production" });
    expect(status).toEqual({ aiEnabled: true, reason: null });
  });

  it("in development, starts normally with valid config", () => {
    const status = resolveStartupAiStatus({ env: { OPENAI_API_KEY: "x" }, nodeEnv: "development" });
    expect(status).toEqual({ aiEnabled: true, reason: null });
  });
});

describe("resolveMaxCandidates", () => {
  it("defaults to 5 when AI_MAX_CANDIDATES is unset", () => {
    expect(resolveMaxCandidates({ env: {} })).toEqual({ value: 5, usedDefault: true });
    expect(DEFAULT_AI_MAX_CANDIDATES).toBe(5);
  });

  it("defaults when the value is an empty string", () => {
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "" } })).toEqual({ value: 5, usedDefault: true });
  });

  it("accepts a valid override within range", () => {
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "8" } })).toEqual({ value: 8, usedDefault: false });
  });

  it("accepts the boundary values 2 and 10", () => {
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "2" } })).toEqual({ value: 2, usedDefault: false });
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "10" } })).toEqual({ value: 10, usedDefault: false });
  });

  it("falls back to the default for a non-integer value", () => {
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "2.5" } })).toEqual({ value: 5, usedDefault: true, invalidInput: "2.5" });
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "many" } })).toEqual({ value: 5, usedDefault: true, invalidInput: "many" });
  });

  it("falls back to the default when the value is out of the 2-10 range", () => {
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "1" } })).toEqual({ value: 5, usedDefault: true, invalidInput: "1" });
    expect(resolveMaxCandidates({ env: { AI_MAX_CANDIDATES: "11" } })).toEqual({ value: 5, usedDefault: true, invalidInput: "11" });
  });
});

describe("resolveMaxProviderRequestsPerRun", () => {
  it("defaults to 4 when AI_MAX_PROVIDER_REQUESTS_PER_RUN is unset", () => {
    expect(resolveMaxProviderRequestsPerRun({ env: {} })).toEqual({ value: 4, usedDefault: true });
    expect(DEFAULT_AI_MAX_PROVIDER_REQUESTS_PER_RUN).toBe(4);
  });

  it("accepts a valid override within range", () => {
    expect(resolveMaxProviderRequestsPerRun({ env: { AI_MAX_PROVIDER_REQUESTS_PER_RUN: "3" } })).toEqual({ value: 3, usedDefault: false });
  });

  it("falls back to the default when out of the 1-4 range", () => {
    expect(resolveMaxProviderRequestsPerRun({ env: { AI_MAX_PROVIDER_REQUESTS_PER_RUN: "0" } })).toEqual({ value: 4, usedDefault: true, invalidInput: "0" });
    expect(resolveMaxProviderRequestsPerRun({ env: { AI_MAX_PROVIDER_REQUESTS_PER_RUN: "5" } })).toEqual({ value: 4, usedDefault: true, invalidInput: "5" });
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(resolveMaxProviderRequestsPerRun({ env: { AI_MAX_PROVIDER_REQUESTS_PER_RUN: "many" } })).toEqual({ value: 4, usedDefault: true, invalidInput: "many" });
  });
});
