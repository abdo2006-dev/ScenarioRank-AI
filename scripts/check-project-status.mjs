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
  "docs/architecture/DATA_FLOW.md",
];

const requiredCurrentChecks = [
  { label: "clean_pass", pattern: /\bclean_pass\b/i },
  { label: "fixture machinery: passed", pattern: /fixture machinery:\s*passed/i },
  { label: "16 clean cases", pattern: /\b16 clean cases\b/i },
  { label: "0 known-defect observations", pattern: /\b0 known-defect observations\b/i },
  { label: "0 affected executions", pattern: /\b0 affected executions\b/i },
  { label: "0 unexpected failures", pattern: /\b0 unexpected failures\b/i },
  { label: "0 unexpected defect resolutions", pattern: /\b0 unexpected defect resolutions\b/i },
  { label: "105 frontend tests", pattern: /\b105 frontend tests\b/i },
  { label: "237 server tests", pattern: /\b237 server tests\b/i },
  { label: "329 evaluation tests", pattern: /\b329 evaluation tests\b/i },
  { label: "671 total tests", pattern: /\b671 total tests\b/i },
  { label: "signed risk-adjusted score", pattern: /risk_adjusted_score`?\s*(?::|is)\s*(?:a\s+)?`?-100[–-]100/i },
  { label: "Phase 3B unstarted", pattern: /phase 3b (?:remains|has) not started/i },
  { label: "separate SR-P3A-002 tracking", pattern: /SR-P3A-002/i },
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
  /risk_adjusted_score.{0,80}\b0\s*(?:-|–|—|to)\s*100\b/i,
  /(?:all|aggregate) scores (?:are|:)?\s*0\s*(?:-|–|—|to)\s*100\b/i,
  /phase 3b (?:is )?(?:started|complete|completed)\b/i,
  /SR-P3A-001 (?:is |remains )?(?:open|unfixed)\b/i,
  /benchmark (?:version )?1\.0\.0(?:\s+is)?\s+(?:the )?current/i,
];

const historicalHeading = /\b(historical|superseded|previous baseline|earlier phase)\b/i;

/**
 * Classifies every line from its Markdown-heading ancestry. A sibling heading
 * replaces the previous heading at its level, so current text never inherits
 * historical status from an earlier sibling section.
 */
function classifyHistoricalLines(lines) {
  const ancestry = [];
  return lines.map((line) => {
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) {
      const level = heading[1].length;
      ancestry.length = level - 1;
      ancestry[level - 1] = historicalHeading.test(line);
    }
    return historicalHeading.test(line) || ancestry.some(Boolean);
  });
}

const violations = [];
const documents = await Promise.all(
  statusDocuments.map(async (relativePath) => ({
    relativePath,
    contents: await readFile(path.resolve(relativePath), "utf8"),
  })),
);
const classifiedDocuments = documents.map(({ relativePath, contents }) => {
  const lines = contents.split(/\r?\n/);
  return { relativePath, lines, historical: classifyHistoricalLines(lines) };
});
const activeStatusText = classifiedDocuments
  .flatMap(({ lines, historical }) => lines.filter((_, index) => !historical[index]))
  .join("\n");

for (const { label, pattern } of requiredCurrentChecks) {
  if (!pattern.test(activeStatusText)) {
    violations.push(`Missing current Phase 3A declaration: "${label}".`);
  }
}

for (const { relativePath, lines, historical } of classifiedDocuments) {
  lines.forEach((line, index) => {
    for (const pattern of stalePatterns) {
      if (pattern.test(line) && !historical[index]) {
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
