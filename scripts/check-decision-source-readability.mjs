import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceRoot = path.resolve("src/features/decision");
const maximumLineLength = 180;
const sourceExtensions = new Set([".ts", ".tsx"]);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(entryPath);
      }
      return sourceExtensions.has(path.extname(entry.name))
        ? [entryPath]
        : [];
    }),
  );

  return files.flat();
}

const violations = [];
const sourceFiles = await collectSourceFiles(sourceRoot);

for (const sourceFile of sourceFiles) {
  const contents = await readFile(sourceFile, "utf8");
  const lines = contents.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.length > maximumLineLength) {
      violations.push({
        file: path.relative(process.cwd(), sourceFile),
        line: index + 1,
        length: line.length,
      });
    }
  });
}

if (violations.length > 0) {
  console.error(
    `Decision source readability failed: ${violations.length} line(s) exceed ${maximumLineLength} characters.`,
  );
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} is ${violation.length} characters.`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `Decision source readability passed: ${sourceFiles.length} files, maximum ${maximumLineLength} characters per line.`,
  );
}
