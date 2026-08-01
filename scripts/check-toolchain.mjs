import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Phase 2C migrated Vite from the vulnerable 5.x line to the minimum
 * patched 6.x release (docs/security/DEPENDENCY_AUDIT.md, "Phase 2C
 * update"). This guard inspects the installed/locked toolchain state
 * deterministically from package.json and package-lock.json only (no
 * network access) so a later dependency change can't silently regress
 * below the patched floor or jump to an undocumented major line.
 *
 * Bumping the approved floor or ceiling below is itself the "documented
 * migration decision" this guard requires: it must be a deliberate,
 * reviewed change to this file (with its own dependency-audit update),
 * not a side effect of an unrelated `npm install` or `npm audit fix`.
 */
const APPROVED_VITE_MAJOR = 6;
const MINIMUM_VITE_VERSION = [6, 4, 3];
const MINIMUM_ESBUILD_VERSION = [0, 25, 0];

function parseVersion(raw) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw ?? "");
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function formatVersion(parts) {
  return parts.join(".");
}

const violations = [];

const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(path.resolve("package-lock.json"), "utf8"));

if (typeof packageLock.lockfileVersion !== "number" || packageLock.lockfileVersion < 2) {
  violations.push(
    `package-lock.json lockfileVersion is missing or unsupported (${JSON.stringify(packageLock.lockfileVersion)}). Expected the npm v7+ "packages" lockfile format (lockfileVersion >= 2).`,
  );
}

if (packageLock.name !== packageJson.name) {
  violations.push(
    `package-lock.json root name "${packageLock.name}" does not match package.json name "${packageJson.name}".`,
  );
}

if (packageLock.version !== packageJson.version) {
  violations.push(
    `package-lock.json root version "${packageLock.version}" does not match package.json version "${packageJson.version}".`,
  );
}

const rootLockEntry = packageLock.packages?.[""];
if (!rootLockEntry) {
  violations.push('package-lock.json is missing its root packages[""] entry.');
} else {
  if (rootLockEntry.name !== packageJson.name) {
    violations.push(
      `package-lock.json packages[""] name "${rootLockEntry.name}" does not match package.json name "${packageJson.name}".`,
    );
  }
  if (rootLockEntry.version !== packageJson.version) {
    violations.push(
      `package-lock.json packages[""] version "${rootLockEntry.version}" does not match package.json version "${packageJson.version}".`,
    );
  }
}

const viteEntry = packageLock.packages?.["node_modules/vite"];
const installedVite = parseVersion(viteEntry?.version);

if (!installedVite) {
  violations.push(
    'package-lock.json has no resolved "node_modules/vite" entry — is vite installed?',
  );
} else {
  if (installedVite[0] !== APPROVED_VITE_MAJOR) {
    violations.push(
      `Installed vite is ${formatVersion(installedVite)} (major ${installedVite[0]}), but this repository has only reviewed and approved Vite ${APPROVED_VITE_MAJOR}.x (docs/security/DEPENDENCY_AUDIT.md, "Phase 2C update"). A Vite ${installedVite[0]}.x migration needs its own documented decision — update MINIMUM_VITE_VERSION/APPROVED_VITE_MAJOR in this script as part of that review, not as a side effect of an unrelated dependency change.`,
    );
  } else if (compareVersions(installedVite, MINIMUM_VITE_VERSION) < 0) {
    violations.push(
      `Installed vite is ${formatVersion(installedVite)}, below the approved patched floor ${formatVersion(MINIMUM_VITE_VERSION)} (GHSA-fx2h-pf6j-xcff / GHSA-4w7w-66w2-5vf9 / GHSA-v6wh-96g9-6wx3 — docs/security/DEPENDENCY_AUDIT.md).`,
    );
  }

  const declaredViteRange = packageJson.devDependencies?.vite;
  if (
    typeof declaredViteRange === "string" &&
    !declaredViteRange.includes(`${APPROVED_VITE_MAJOR}.`)
  ) {
    violations.push(
      `package.json declares vite "${declaredViteRange}", which does not target the approved ${APPROVED_VITE_MAJOR}.x line.`,
    );
  }

  for (const [key, entry] of Object.entries(packageLock.packages ?? {})) {
    if (key === "node_modules/vite" || !key.endsWith("/vite")) continue;
    const nestedVersion = parseVersion(entry?.version);
    if (nestedVersion && compareVersions(nestedVersion, installedVite) !== 0) {
      violations.push(
        `${key} resolves to vite ${formatVersion(nestedVersion)}, diverging from the top-level vite ${formatVersion(installedVite)}. Exactly one supported Vite version must be installed.`,
      );
    }
  }
}

const esbuildEntry = packageLock.packages?.["node_modules/esbuild"];
const installedEsbuild = parseVersion(esbuildEntry?.version);

if (!installedEsbuild) {
  violations.push(
    'package-lock.json has no resolved "node_modules/esbuild" entry — is esbuild installed?',
  );
} else if (compareVersions(installedEsbuild, MINIMUM_ESBUILD_VERSION) < 0) {
  violations.push(
    `Installed esbuild is ${formatVersion(installedEsbuild)}, below the patched floor ${formatVersion(MINIMUM_ESBUILD_VERSION)} (GHSA-67mh-4wv8-2f99 — docs/security/DEPENDENCY_AUDIT.md).`,
  );
}

if (violations.length > 0) {
  console.error(`Toolchain check failed: ${violations.length} problem(s) found.`);
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Toolchain check passed: vite ${formatVersion(installedVite)} (>= ${formatVersion(MINIMUM_VITE_VERSION)}, ${APPROVED_VITE_MAJOR}.x only), esbuild ${formatVersion(installedEsbuild)} (>= ${formatVersion(MINIMUM_ESBUILD_VERSION)}), package-lock.json root metadata consistent.`,
  );
}
