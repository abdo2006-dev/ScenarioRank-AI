import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-unused-template.mjs");

const decoyDir = path.join(repoRoot, "src", "components", "ui");
const decoyFile = path.join(decoyDir, "button.tsx");
const decoyLockfile = path.join(repoRoot, "bun.lockb");

const packageJsonPath = path.join(repoRoot, "package.json");
const publicDemoPath = path.join(repoRoot, "public", "demo.html");

const singleFileDecoys = [
  path.join(repoRoot, "src", "lib", "utils.ts"),
  path.join(repoRoot, "src", "App.css"),
  path.join(repoRoot, "components.json"),
  path.join(repoRoot, "playwright.config.ts"),
  path.join(repoRoot, "playwright-fixture.ts"),
];

async function cleanupDecoys() {
  await rm(decoyDir, { recursive: true, force: true });
  await rm(decoyLockfile, { force: true });
  for (const decoy of singleFileDecoys) {
    await rm(decoy, { force: true });
  }
}

async function runScript() {
  return execFileAsync("node", [scriptPath], { cwd: repoRoot });
}

/**
 * Regression coverage for the Phase 2B-2 reintroduction guard
 * (docs/security/DEPENDENCY_AUDIT.md). This spawns the real script against
 * the real repository tree rather than mocking the filesystem, since the
 * guard's entire job is to inspect actual paths and package.json/demo.html
 * contents. Tests that mutate a real tracked file (package.json,
 * public/demo.html) always restore the original content in `afterEach`.
 */
describe("scripts/check-unused-template.mjs", () => {
  let restorePackageJson = null;
  let restorePublicDemo = null;

  afterEach(async () => {
    await cleanupDecoys();
    if (restorePackageJson !== null) {
      await writeFile(packageJsonPath, restorePackageJson);
      restorePackageJson = null;
    }
    if (restorePublicDemo !== null) {
      await writeFile(publicDemoPath, restorePublicDemo);
      restorePublicDemo = null;
    }
  });

  it("passes deterministically against the current, already-cleaned repository", async () => {
    const { stdout } = await runScript();
    expect(stdout).toContain("Unused-template check passed");
  });

  it("fails when a confirmed-dead template directory and an unsupported lockfile reappear", async () => {
    await mkdir(decoyDir, { recursive: true });
    await writeFile(decoyFile, "// reintroduced template file\n");
    await writeFile(decoyLockfile, "");

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("src/components/ui was reintroduced"),
    });
  });

  it.each([
    ["src/lib/utils.ts", "export function cn() {}\n"],
    ["src/App.css", ".logo {}\n"],
    ["components.json", "{}\n"],
    ["playwright.config.ts", "export default {}\n"],
    ["playwright-fixture.ts", "export {}\n"],
  ])("fails when %s reappears", async (relativePath, contents) => {
    const decoyPath = path.join(repoRoot, relativePath);
    await mkdir(path.dirname(decoyPath), { recursive: true });
    await writeFile(decoyPath, contents);

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(`${relativePath} was reintroduced`),
    });
  });

  it("fails when package.json declares a removed dependency again", async () => {
    const original = await readFile(packageJsonPath, "utf8");
    restorePackageJson = original;
    const packageJson = JSON.parse(original);
    packageJson.dependencies.clsx = "^2.1.1";
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('package.json declares "clsx" again'),
    });
  });

  it("fails when package.json name reverts to the generated template identity", async () => {
    const original = await readFile(packageJsonPath, "utf8");
    restorePackageJson = original;
    const packageJson = JSON.parse(original);
    packageJson.name = "vite_react_shadcn_ts";
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("generated template identity"),
    });
  });

  it("fails when public/demo.html reintroduces stale architecture terminology", async () => {
    const original = await readFile(publicDemoPath, "utf8");
    restorePublicDemo = original;
    await writeFile(publicDemoPath, `${original}\n<!-- Built with Anthropic Claude -->\n`);

    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('stale term "Claude"'),
    });
  });
});
