import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-unused-template.mjs");

const decoyDir = path.join(repoRoot, "src", "components", "ui");
const decoyFile = path.join(decoyDir, "button.tsx");
const decoyLockfile = path.join(repoRoot, "bun.lockb");

async function cleanupDecoys() {
  await rm(decoyDir, { recursive: true, force: true });
  await rm(decoyLockfile, { force: true });
}

/**
 * Regression coverage for the Phase 2B-2 reintroduction guard
 * (docs/security/DEPENDENCY_AUDIT.md). This spawns the real script against
 * the real repository tree rather than mocking the filesystem, since the
 * guard's entire job is to inspect actual paths and package.json contents.
 */
describe("scripts/check-unused-template.mjs", () => {
  afterEach(async () => {
    await cleanupDecoys();
  });

  it("passes deterministically against the current, already-cleaned repository", async () => {
    const { stdout } = await execFileAsync("node", [scriptPath], { cwd: repoRoot });
    expect(stdout).toContain("Unused-template check passed");
  });

  it("fails when a confirmed-dead template directory and an unsupported lockfile reappear", async () => {
    await mkdir(decoyDir, { recursive: true });
    await writeFile(decoyFile, "// reintroduced template file\n");
    await writeFile(decoyLockfile, "");

    await expect(execFileAsync("node", [scriptPath], { cwd: repoRoot })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("src/components/ui was reintroduced"),
    });
  });
});
