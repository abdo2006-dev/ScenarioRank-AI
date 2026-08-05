/**
 * Repository-protection tests.
 *
 * These guard the boundaries Phase 3A committed to, in the repository itself
 * rather than in a module's own logic:
 *
 *   - production code never imports the evaluation harness;
 *   - run artifacts are git-ignored and never committed;
 *   - nothing committed under evals/ contains a secret or an absolute path;
 *   - the CLI commands behave as the runbook promises, including exit status.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function walk(dir, predicate = () => true) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

const isSource = (file) => /\.(js|mjs|ts|tsx|json)$/.test(file);

/** Runs a CLI and captures status plus output, without throwing on nonzero. */
function runCli(args, env = {}) {
  try {
    const stdout = execFileSync("node", args, {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

describe("production code does not depend on the evaluation harness", () => {
  const productionDirs = ["server", "src", "shared", "scripts"];

  it("contains no import of evals/ anywhere in production source", () => {
    const offenders = [];
    for (const dir of productionDirs) {
      for (const file of walk(path.join(ROOT, dir), isSource)) {
        const contents = readFileSync(file, "utf8");
        if (/(?:from|import\(|require\()\s*["'][^"']*\bevals\//.test(contents)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("contains no import of evals/ in the composition root", () => {
    expect(readFileSync(path.join(ROOT, "server.mjs"), "utf8")).not.toMatch(/\bevals\//);
  });

  it("keeps the dependency direction one-way: the harness may import production", () => {
    const harnessImportsProduction = walk(path.join(ROOT, "evals"), isSource).some((file) =>
      /(?:from)\s*["']\.\.\/\.\.\/(?:server|shared)\//.test(readFileSync(file, "utf8")),
    );
    expect(harnessImportsProduction).toBe(true);
  });

  it("does not reference the evaluation harness from any HTTP route or frontend component", () => {
    for (const file of [
      ...walk(path.join(ROOT, "server", "http"), isSource),
      ...walk(path.join(ROOT, "src"), isSource),
    ]) {
      expect(readFileSync(file, "utf8"), path.relative(ROOT, file)).not.toMatch(/\bevals\//);
    }
  });
});

describe("run artifacts stay out of git", () => {
  const gitignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8");

  it("ignores the .eval-runs directory", () => {
    expect(gitignore).toMatch(/^\.eval-runs\/?$/m);
  });

  it("is confirmed ignored by git itself", () => {
    const output = execFileSync("git", ["check-ignore", "-v", ".eval-runs/example/summary.json"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toContain(".eval-runs");
  });

  it("has no run artifact tracked in the repository", () => {
    const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
    expect(tracked).not.toMatch(/^\.eval-runs\//m);
    expect(tracked).not.toMatch(/run-manifest\.json/);
    expect(tracked).not.toMatch(/case-results\.jsonl/);
  });

  it("still ignores .env files, unchanged by this phase", () => {
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });
});

describe("committed evaluation files contain nothing sensitive", () => {
  // Test files are deliberately excluded. They contain example key- and
  // path-shaped strings *as fixtures*, because the artifact scanner has to be
  // proven to detect them. Scanning the detector's own test data would make
  // this check impossible to satisfy without weakening the detector's tests.
  const isTest = (file) => file.endsWith(".test.js");
  const files = walk(
    path.join(ROOT, "evals"),
    (file) => (isSource(file) || file.endsWith(".md")) && !isTest(file),
  );

  it("finds a non-trivial number of files to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("contains no secret-shaped string", () => {
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      expect(contents, path.relative(ROOT, file)).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}/);
      expect(contents, path.relative(ROOT, file)).not.toMatch(/\bBearer\s+[A-Za-z0-9._-]{20,}/);
    }
  });

  it("contains no absolute machine path", () => {
    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      expect(contents, path.relative(ROOT, file)).not.toMatch(/\/(?:Users|home|root)\/[A-Za-z0-9_.-]+\//);
      expect(contents, path.relative(ROOT, file)).not.toMatch(/[A-Za-z]:\\\\Users/);
    }
  });

  it("reads the API key only in the live gate, and only to check it exists", () => {
    for (const file of walk(path.join(ROOT, "evals"), (entry) => isSource(entry) && !isTest(entry))) {
      const contents = readFileSync(file, "utf8");
      if (!contents.includes("OPENAI_API_KEY")) continue;
      const relative = path.relative(ROOT, file);
      expect(relative.includes("liveRunner") || relative.includes("cli/live"), relative).toBe(true);
      // Presence check only. The value must never be interpolated, logged, or
      // written anywhere.
      expect(contents, relative).not.toMatch(/console\.\w+\([^)]*OPENAI_API_KEY/);
      expect(contents, relative).not.toMatch(/\$\{[^}]*OPENAI_API_KEY[^}]*\}/);
    }
  });

  it("never records a provider request or response body in the observer", () => {
    const observer = readFileSync(path.join(ROOT, "evals/runners/observingProvider.js"), "utf8");
    // The observer keeps derived identifiers only; retaining prompt or
    // response text would put synthetic-or-not content straight into artifacts.
    expect(observer).not.toMatch(/trace\.(?:prompts|responses|bodies|headers)/);
    expect(observer).toContain("never what came back");
  });
});

describe("CLI ergonomics", () => {
  const commands = {
    validate: "evals/cli/validate.mjs",
    fixtures: "evals/cli/fixtures.mjs",
    live: "evals/cli/live.mjs",
    compare: "evals/cli/compare.mjs",
  };

  for (const [name, script] of Object.entries(commands)) {
    it(`eval:${name} supports --help and exits 0`, () => {
      const result = runCli([script, "--help"]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("--help");
    });

    it(`eval:${name} help output contains no ANSI escape codes`, () => {
      // eslint-disable-next-line no-control-regex
      expect(/\u001b\[/.test(runCli([script, "--help"]).stdout)).toBe(false);
    });
  }

  it("eval:validate succeeds on the committed benchmark", () => {
    const result = runCli([commands.validate]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("decision-benchmark-v1");
  });

  it("eval:validate fails with an actionable message for an unknown benchmark", () => {
    const result = runCli([commands.validate, "--benchmark", "does-not-exist-v1"]);
    expect(result.status).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stderr).not.toMatch(/\/(?:Users|home|root)\//);
  });

  it("rejects unknown options instead of silently changing command behaviour", () => {
    for (const script of Object.values(commands)) {
      const result = runCli([script, "--definitely-unknown"]);
      expect(result.status, script).toBe(1);
      expect(result.stderr, script).toContain("Unknown option");
    }
  });

  it("eval:fixtures exits 0 on the committed baseline", () => {
    const result = runCli([commands.fixtures, "--no-write"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("fixture machinery: PASSED");
    expect(result.stdout).toContain("production baseline: PASS WITH KNOWN DEFECTS");
  });

  it("eval:fixtures exits nonzero when a required invariant fails", () => {
    const result = runCli([
      commands.fixtures,
      "--case",
      "case-015",
      "--profile",
      "missing-pair",
      "--no-write",
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("fixture machinery: FAILED");
    expect(result.stdout).toContain("production baseline: UNEXPECTED FAILURE");
    expect(result.stderr).toContain("required grader failure");
  });

  it("eval:fixtures rejects an unknown case with a pointer to eval:validate", () => {
    const result = runCli([commands.fixtures, "--case", "case-999", "--no-write"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("eval:validate");
  });

  it("eval:live refuses without --live, without reaching the provider", () => {
    const result = runCli([commands.live, "--case", "case-001", "--max-budget-usd", "1"], {
      OPENAI_API_KEY: "not-a-real-key",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--live");
  });

  it("eval:live refuses without an API key", () => {
    const result = runCli([commands.live, "--live", "--case", "case-001", "--max-budget-usd", "1"], {
      OPENAI_API_KEY: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPENAI_API_KEY");
  });

  it("eval:live refuses without a budget", () => {
    const result = runCli([commands.live, "--live", "--case", "case-001"], {
      OPENAI_API_KEY: "not-a-real-key",
      EVAL_MAX_BUDGET_USD: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("budget");
  });

  it("eval:live refuses in CI by default", () => {
    const result = runCli(
      [commands.live, "--live", "--case", "case-001", "--max-budget-usd", "1"],
      { OPENAI_API_KEY: "not-a-real-key", CI: "true" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CI");
  });

  it("eval:live refuses when no case is selected", () => {
    const result = runCli([commands.live, "--live", "--max-budget-usd", "1"], {
      OPENAI_API_KEY: "not-a-real-key",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--all-cases");
  });

  it("eval:compare refuses without both run directories", () => {
    const result = runCli([commands.compare, "--baseline", ".eval-runs/whatever"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--candidate");
  });
});

describe("package wiring", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

  it("exposes all four evaluation commands", () => {
    for (const script of ["eval:validate", "eval:fixtures", "eval:live", "eval:compare"]) {
      expect(pkg.scripts, script).toHaveProperty(script);
    }
  });

  it("includes the evaluation suite in npm test", () => {
    expect(pkg.scripts.test).toContain("test:evals");
    expect(pkg.scripts["test:evals"]).toContain("vitest.evals.config.ts");
  });

  it("adds no dependency for the evaluation harness", () => {
    // Phase 3A introduced no package. The harness uses Node built-ins plus
    // zod, which the application already depends on.
    expect(pkg.dependencies).toHaveProperty("zod");
    for (const forbidden of ["commander", "yargs", "minimist", "chalk", "jest"]) {
      expect(pkg.dependencies ?? {}, forbidden).not.toHaveProperty(forbidden);
      expect(pkg.devDependencies ?? {}, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it("keeps the evaluation config present and separate", () => {
    expect(existsSync(path.join(ROOT, "vitest.evals.config.ts"))).toBe(true);
    const serverConfig = readFileSync(path.join(ROOT, "vitest.server.config.ts"), "utf8");
    expect(serverConfig).not.toContain("evals/");
  });
});
