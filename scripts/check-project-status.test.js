import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "check-project-status.mjs");
const projectStatusPath = path.join(repoRoot, "docs", "PROJECT_STATUS.md");
const roadmapPath = path.join(repoRoot, "docs", "V2_ROADMAP.md");
const adrPath = path.join(repoRoot, "docs", "decisions", "ADR-0009-local-first-evaluation-harness.md");
const dataFlowPath = path.join(repoRoot, "docs", "architecture", "DATA_FLOW.md");
const statusPaths = [projectStatusPath, roadmapPath, adrPath, dataFlowPath];

async function runScript() {
  return execFileAsync("node", [scriptPath], { cwd: repoRoot });
}

/**
 * The guard intentionally reads the actual committed documents. These tests
 * make focused temporary edits and restore every file after each assertion.
 */
describe("scripts/check-project-status.mjs", () => {
  let originals = null;

  async function captureOriginals() {
    if (originals === null) {
      originals = await Promise.all(statusPaths.map((file) => readFile(file, "utf8")));
    }
  }

  async function appendProjectStatus(text) {
    await captureOriginals();
    await writeFile(projectStatusPath, `${originals[0]}\n${text}\n`);
  }

  async function restoreOriginals() {
    if (originals !== null) {
      await Promise.all(statusPaths.map((file, index) => writeFile(file, originals[index])));
      originals = null;
    }
  }

  afterEach(async () => {
    await restoreOriginals();
  });

  it("passes against the committed current-state documentation", async () => {
    const { stdout } = await runScript();
    expect(stdout).toContain("Project-status check passed");
  });

  it("rejects an active result: PASSED claim", async () => {
    await appendProjectStatus("result: PASSED");
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("result: PASSED"),
    });
  });

  it("rejects active 629/309 totals", async () => {
    await appendProjectStatus("Verification: 629 total tests (309 evaluation tests).");
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("629 total tests"),
    });
  });

  it("rejects active 642/322 totals", async () => {
    await appendProjectStatus("Verification: 642 total tests (322 evaluation tests).");
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("642 total tests"),
    });
  });

  it("allows stale values in a clearly marked historical section", async () => {
    await appendProjectStatus("## Historical verification (superseded)\nresult: PASSED\n629 total tests (309 evaluation tests).");
    const { stdout } = await runScript();
    expect(stdout).toContain("Project-status check passed");
  });

  it("rejects a stale risk-score claim under the current monitored heading", async () => {
    await appendProjectStatus("## Current verification details\nrisk_adjusted_score: 0–100");
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("risk_adjusted_score: 0–100"),
    });
  });

  it("rejects a stale risk-score claim under a sibling active heading", async () => {
    await appendProjectStatus("# Active sibling status\nrisk_adjusted_score: 0–100");
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("risk_adjusted_score: 0–100"),
    });
  });

  it("allows a historical signed-score statement while requiring the current signed declaration", async () => {
    await appendProjectStatus("## Previous baseline (superseded)\nrisk_adjusted_score: 0–100");
    const { stdout } = await runScript();
    expect(stdout).toContain("Project-status check passed");
  });

  it("rejects a missing current run-state declaration", async () => {
    await captureOriginals();
    await Promise.all(statusPaths.map(async (file, index) =>
      writeFile(file, originals[index].replaceAll("clean_pass", "baseline-pending")),
    ));
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("clean_pass"),
    });
  });

  it("rejects missing current total declarations", async () => {
    await captureOriginals();
    await Promise.all(statusPaths.map(async (file, index) =>
      writeFile(file, originals[index].replaceAll("671 total tests", "total pending")),
    ));
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("671 total tests"),
    });
  });

  it("rejects an active claim that SR-P3A-001 remains unfixed", async () => {
    await appendProjectStatus("SR-P3A-001 remains unfixed.");
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("SR-P3A-001 remains unfixed"),
    });
  });

  it("requires the active declaration that Phase 3B remains unstarted", async () => {
    await captureOriginals();
    await Promise.all(statusPaths.map(async (file, index) =>
      writeFile(file, originals[index].replaceAll("Phase 3B has not started", "Phase 3B status pending")),
    ));
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Phase 3B unstarted"),
    });
  });

  it("requires SR-P3A-002 to remain separately tracked", async () => {
    await captureOriginals();
    await Promise.all(statusPaths.map(async (file, index) =>
      writeFile(file, originals[index].replaceAll("SR-P3A-002", "separate-issue-pending")),
    ));
    await expect(runScript()).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("separate SR-P3A-002 tracking"),
    });
  });

  it("restores temporary documentation even when an assertion fails", async () => {
    await captureOriginals();
    const originalProjectStatus = originals[0];
    await writeFile(projectStatusPath, `${originalProjectStatus}\n# Active sibling status\nrisk_adjusted_score: 0–100\n`);

    let assertionFailure;
    try {
      const { stdout } = await runScript();
      expect(stdout).toContain("this assertion intentionally fails");
    } catch (error) {
      assertionFailure = error;
    } finally {
      await restoreOriginals();
    }

    expect(assertionFailure).toBeDefined();
    expect(await readFile(projectStatusPath, "utf8")).toBe(originalProjectStatus);
  });
});
