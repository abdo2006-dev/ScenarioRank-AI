import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Current Phase 3A declarations are intentionally checked as committed text,
 * not calculated by running tests. This keeps the documentation reviewable,
 * deterministic, and network-free while preventing superseded Phase 3A
 * baseline wording from returning to active status sections.
 */
const statusDocuments = [
  "docs/PROJECT_STATUS.md",
  "docs/V2_ROADMAP.md",
  "docs/decisions/ADR-0009-local-first-evaluation-harness.md",
];

const requiredCurrentStatements = [
  "clean_pass",
  "fixture machinery: passed",
  "16 clean cases",
  "0 known-defect observations",
  "0 affected executions",
  "0 unexpected failures",
  "0 unexpected defect resolutions",
  "105 frontend tests",
  "231 server tests",
  "329 evaluation tests",
  "665 total tests",
];

const stalePatterns = [
  /result:\s*passed\b/i,
  /16\/16\s+(?:cases?\s+)?(?:clean\s+)?pass(?:ed|es)\b/i,
  /\b629\s+(?:total\s+)?tests\b/i,
  /\b309\s+(?:evaluation\s+)?tests\b/i,
  /\b642\s+(?:total\s+)?tests\b/i,
  /\b322\s+(?:evaluation\s+)?tests\b/i,
  /\bpass_with_known_defects\b/i,
  /\b12\s+clean\s+cases\b/i,
  /\b8\s+known-defect\s+observations\b/i,
  /\b4\s+affected\s+executions\b/i,
  /SR-P3A-001 remains unfixed/i,
];

function isHistoricalContext(lines, index) {
  const line = lines[index];
  if (/\b(historical|superseded)\b/i.test(line)) return true;

  let childHeadingLevel = Number.POSITIVE_INFINITY;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const heading = /^(#{1,6})\s/.exec(lines[cursor]);
    if (heading && heading[1].length <= childHeadingLevel) {
      if (/\b(historical|superseded)\b/i.test(lines[cursor])) return true;
      childHeadingLevel = heading[1].length;
      // A current top-level section cannot inherit historical context from a
      // preceding sibling section.
      if (childHeadingLevel === 1) return false;
    }
  }
  return false;
}

const violations = [];
const documents = await Promise.all(
  statusDocuments.map(async (relativePath) => ({
    relativePath,
    contents: await readFile(path.resolve(relativePath), "utf8"),
  })),
);
const allCurrentStatusText = documents.map(({ contents }) => contents).join("\n");

for (const statement of requiredCurrentStatements) {
  if (!allCurrentStatusText.toLowerCase().includes(statement)) {
    violations.push(`Missing current Phase 3A declaration: "${statement}".`);
  }
}

for (const { relativePath, contents } of documents) {
  const lines = contents.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of stalePatterns) {
      if (pattern.test(line) && !isHistoricalContext(lines, index)) {
        violations.push(
          `${relativePath}:${index + 1} contains stale active Phase 3A status text: "${line.trim()}". Mark earlier evidence under a Historical or Superseded heading instead.`,
        );
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`Project-status check failed: ${violations.length} documentation issue(s).`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Project-status check passed: ${statusDocuments.length} current-status document(s) contain the committed Phase 3A baseline and no stale active totals.`,
  );
}
