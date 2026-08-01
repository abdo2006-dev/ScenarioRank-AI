import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-router-toolchain.mjs");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageLockPath = path.join(repoRoot, "package-lock.json");

async function runScript() {
  return execFileAsync("node", [scriptPath], { cwd: repoRoot });
}

/**
 * Regression coverage for the Phase 2D router toolchain guard
 * (docs/security/DEPENDENCY_AUDIT.md, "Phase 2D update"). This spawns the
 * real script against the real repository tree, mutating the tracked
 * package.json/package-lock.json (and, for the source-import case, a
 * scratch source file) in place for each failure case and always restoring
 * the original state in `afterEach` — the guard's job is to inspect actual
 * installed/locked/source state, not a mock.
 */
describe("scripts/check-router-toolchain.mjs", () => {
  let restorePackageJson = null;
  let restorePackageLock = null;
  let scratchFilePath = null;

  afterEach(async () => {
    if (restorePackageJson !== null) {
      await writeFile(packageJsonPath, restorePackageJson);
      restorePackageJson = null;
    }
    if (restorePackageLock !== null) {
      await writeFile(packageLockPath, restorePackageLock);
      restorePackageLock = null;
    }
    if (scratchFilePath !== null) {
      await rm(scratchFilePath, { force: true });
      scratchFilePath = null;
    }
  });

  it("passes deterministically against the current, already-migrated repository", async () => {
    const { stdout } = await runScript();
    expect(stdout).toContain("Router toolchain check passed");
    expect(stdout).toMatch(/react-router 7\.\d+\.\d+/);
    expect(stdout).not.toContain("react-router-dom\" package or import remains, react-router-dom");
  });

  it("rejects React Router 6 (installed major regresses below the approved floor)", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/react-router"].version = "6.30.4";
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("only reviewed and approved React Router 7.x"),
    });
  });

  it("rejects React Router 8 (installed major is at or above the ceiling)", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/react-router"].version = "8.0.0";
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("React Router 8 was deliberately not adopted"),
    });
  });

  it("rejects a duplicate react-router-dom (React Router 6) package lingering in the lockfile", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/react-router-dom"] = {
      version: "6.30.4",
      resolved: "https://registry.npmjs.org/react-router-dom/-/react-router-dom-6.30.4.tgz",
    };
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('still resolves "node_modules/react-router-dom"'),
    });
  });

  it("rejects a duplicate/incompatible react-router major nested elsewhere in the dependency graph", async () => {
    const original = await readFile(packageLockPath, "utf8");
    restorePackageLock = original;
    const lock = JSON.parse(original);
    lock.packages["node_modules/some-lib/node_modules/react-router"] = { version: "6.30.4" };
    await writeFile(packageLockPath, JSON.stringify(lock, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("a different major version than the top-level react-router"),
    });
  });

  it("rejects an inconsistent active-source import of the removed react-router-dom package", async () => {
    scratchFilePath = path.join(repoRoot, "src", "__routerToolchainScratch.ts");
    await mkdir(path.dirname(scratchFilePath), { recursive: true });
    await writeFile(scratchFilePath, 'import { Link } from "react-router-dom";\nexport default Link;\n');

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('still imports "react-router-dom"'),
    });
  });

  it("rejects a package.json/package-lock.json root dependency mismatch for react-router", async () => {
    const original = await readFile(packageJsonPath, "utf8");
    restorePackageJson = original;
    const packageJson = JSON.parse(original);
    packageJson.dependencies["react-router"] = "^7.18.0";
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("does not agree with package.json dependencies"),
    });
  });

  it("rejects a package.json react-router range that no longer targets the approved major", async () => {
    const original = await readFile(packageJsonPath, "utf8");
    restorePackageJson = original;
    const packageJson = JSON.parse(original);
    packageJson.dependencies["react-router"] = "^6.30.4";
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("does not target the approved 7.x line"),
    });
  });

  it("rejects a reintroduced react-router-dom dependency declaration in package.json", async () => {
    const original = await readFile(packageJsonPath, "utf8");
    restorePackageJson = original;
    const packageJson = JSON.parse(original);
    packageJson.dependencies["react-router-dom"] = "^6.30.4";
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('package.json still declares "react-router-dom"'),
    });
  });
});
