import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-toolchain.mjs");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageLockPath = path.join(repoRoot, "package-lock.json");

async function runScript() {
  return execFileAsync("node", [scriptPath], { cwd: repoRoot });
}

/**
 * Regression coverage for the Phase 2C toolchain guard
 * (docs/security/DEPENDENCY_AUDIT.md, "Phase 2C update"). This spawns the
 * real script against the real repository tree, mutating the tracked
 * package.json/package-lock.json in place for each failure case and
 * always restoring the original content in `afterEach` — the guard's job
 * is to inspect actual installed/locked state, not a mock.
 */
describe("scripts/check-toolchain.mjs", () => {
  let restorePackageJson = null;
  let restorePackageLock = null;

  afterEach(async () => {
    if (restorePackageJson !== null) {
      await writeFile(packageJsonPath, restorePackageJson);
      restorePackageJson = null;
    }
    if (restorePackageLock !== null) {
      await writeFile(packageLockPath, restorePackageLock);
      restorePackageLock = null;
    }
  });

  it("passes deterministically against the current, already-migrated repository", async () => {
    const { stdout } = await runScript();
    expect(stdout).toContain("Toolchain check passed");
    expect(stdout).toContain("vite 6.4.3");
    expect(stdout).toMatch(/esbuild 0\.25\.\d+/);
  });

  it("fails when the locked vite version is below the approved patched floor", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/vite"].version = "6.4.2";
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("below the approved patched floor"),
    });
  });

  it("fails when the locked vite version is on an undocumented major line", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/vite"].version = "7.0.0";
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("needs its own documented decision"),
    });
  });

  it("fails when the locked esbuild version is below the patched floor", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/esbuild"].version = "0.24.2";
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("below the patched floor"),
    });
  });

  it("fails when a nested vite copy diverges from the top-level resolved version", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/some-lib/node_modules/vite"] = { version: "5.4.21" };
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("diverging from the top-level vite"),
    });
  });

  it("fails when package-lock.json root name no longer matches package.json", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.name = "some-other-name";
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("does not match package.json name"),
    });
  });

  it("fails when package.json's declared vite range no longer targets the approved major", async () => {
    const original = await readFile(packageJsonPath, "utf8");
    restorePackageJson = original;
    const packageJson = JSON.parse(original);
    packageJson.devDependencies.vite = "^5.4.19";
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("does not target the approved 6.x line"),
    });
  });
});
