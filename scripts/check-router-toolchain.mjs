import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Phase 2D migrated routing from the vulnerable react-router-dom@6.x line to
 * react-router@7.18.2 (Declarative Mode only — BrowserRouter/Routes/Route/
 * useLocation), removing react-router-dom entirely rather than keeping both
 * packages installed (docs/security/DEPENDENCY_AUDIT.md, "Phase 2D update").
 * This guard inspects the installed/locked/source state deterministically
 * from package.json, package-lock.json, and tracked source files only (no
 * network access), so a later dependency change can't silently reintroduce
 * React Router 6, jump to React Router 8, install a duplicate router major,
 * or leave a stray react-router-dom import behind.
 *
 * Bumping the approved floor/ceiling below is itself the "documented
 * migration decision" this guard requires: it must be a deliberate,
 * reviewed change to this file (with its own dependency-audit update), not
 * a side effect of an unrelated `npm install` or `npm audit fix`.
 */
const APPROVED_ROUTER_MAJOR = 7;
const MINIMUM_ROUTER_VERSION = [7, 13, 0];
const ROUTER_MAJOR_CEILING = 8;
const REMOVED_ROUTER_PACKAGE = "react-router-dom";
const MINIMUM_NODE_MAJOR = 20;
const MINIMUM_REACT_MAJOR = 18;
const SOURCE_DIRS = ["src", "shared"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

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

async function collectSourceFiles(rootDir) {
  const files = [];
  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        await walk(fullPath);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files;
}

const violations = [];

const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(path.resolve("package-lock.json"), "utf8"));

// --- Installed/locked react-router version ---
const routerEntry = packageLock.packages?.["node_modules/react-router"];
const installedRouter = parseVersion(routerEntry?.version);

if (!installedRouter) {
  violations.push(
    'package-lock.json has no resolved "node_modules/react-router" entry — is react-router installed?',
  );
} else {
  if (installedRouter[0] !== APPROVED_ROUTER_MAJOR) {
    violations.push(
      `Installed react-router is ${formatVersion(installedRouter)} (major ${installedRouter[0]}), but this repository has only reviewed and approved React Router ${APPROVED_ROUTER_MAJOR}.x (docs/security/DEPENDENCY_AUDIT.md, "Phase 2D update"). A React Router ${installedRouter[0]}.x migration needs its own documented decision — update MINIMUM_ROUTER_VERSION/APPROVED_ROUTER_MAJOR in this script as part of that review, not as a side effect of an unrelated dependency change.`,
    );
  } else if (compareVersions(installedRouter, MINIMUM_ROUTER_VERSION) < 0) {
    violations.push(
      `Installed react-router is ${formatVersion(installedRouter)}, below the approved patched floor ${formatVersion(MINIMUM_ROUTER_VERSION)} (GHSA-wrjc-x8rr-h8h6 / GHSA-337j-9hxr-rhxg / GHSA-jjmj-jmhj-qwj2 — docs/security/DEPENDENCY_AUDIT.md).`,
    );
  }

  if (installedRouter[0] >= ROUTER_MAJOR_CEILING) {
    violations.push(
      `Installed react-router is ${formatVersion(installedRouter)}, at or above the React Router ${ROUTER_MAJOR_CEILING}.x ceiling. React Router 8 was deliberately not adopted in Phase 2D (out of scope) — see docs/PROJECT_STATUS.md.`,
    );
  }

  const declaredRouterRange = packageJson.dependencies?.["react-router"];
  if (
    typeof declaredRouterRange === "string" &&
    !declaredRouterRange.includes(`${APPROVED_ROUTER_MAJOR}.`)
  ) {
    violations.push(
      `package.json declares react-router "${declaredRouterRange}", which does not target the approved ${APPROVED_ROUTER_MAJOR}.x line.`,
    );
  }

  const rootLockDependencies = packageLock.packages?.[""]?.dependencies ?? {};
  const rootLockRouterRange = rootLockDependencies["react-router"];
  if (rootLockRouterRange !== declaredRouterRange) {
    violations.push(
      `package-lock.json root dependencies["react-router"] ("${rootLockRouterRange}") does not agree with package.json dependencies["react-router"] ("${declaredRouterRange}").`,
    );
  }

  // No duplicate/incompatible router major anywhere in the dependency graph.
  for (const [key, entry] of Object.entries(packageLock.packages ?? {})) {
    if (key === "node_modules/react-router" || !key.endsWith("/react-router")) continue;
    const nestedVersion = parseVersion(entry?.version);
    if (nestedVersion && nestedVersion[0] !== installedRouter[0]) {
      violations.push(
        `${key} resolves to react-router ${formatVersion(nestedVersion)}, a different major version than the top-level react-router ${formatVersion(installedRouter)}. Exactly one React Router major must be installed.`,
      );
    }
  }
}

// --- No React Router 6 package (react-router-dom) remains anywhere ---
if (packageJson.dependencies?.[REMOVED_ROUTER_PACKAGE] || packageJson.devDependencies?.[REMOVED_ROUTER_PACKAGE]) {
  violations.push(
    `package.json still declares "${REMOVED_ROUTER_PACKAGE}". Phase 2D's chosen package strategy (Option A) removed it after migrating every active import to "react-router" — see docs/security/DEPENDENCY_AUDIT.md.`,
  );
}

for (const key of Object.keys(packageLock.packages ?? {})) {
  if (key === `node_modules/${REMOVED_ROUTER_PACKAGE}` || key.endsWith(`/${REMOVED_ROUTER_PACKAGE}`)) {
    violations.push(
      `package-lock.json still resolves "${key}". Phase 2D removed "${REMOVED_ROUTER_PACKAGE}" entirely — a lingering lockfile entry means the removal is incomplete or something reintroduced it as a dependency.`,
    );
  }
}

// --- Active source imports come from the selected v7 package strategy ---
// Matches a real import/require specifier, not incidental mentions of the
// package name in comments, string assertions, or regression-test literals.
const removedPackageImportPattern = new RegExp(
  `(?:from\\s+|require\\()["']${REMOVED_ROUTER_PACKAGE}["']`,
);
for (const sourceDir of SOURCE_DIRS) {
  const files = await collectSourceFiles(path.resolve(sourceDir));
  for (const file of files) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx") || file.endsWith(".test.js")) {
      continue;
    }
    const contents = await readFile(file, "utf8");
    if (removedPackageImportPattern.test(contents)) {
      violations.push(
        `${path.relative(process.cwd(), file)} still imports "${REMOVED_ROUTER_PACKAGE}". Active router imports must come from "react-router" (Phase 2D package strategy).`,
      );
    }
  }
}

// --- React / React DOM / Node baselines remain compatible with react-router@7 ---
const reactEntry = packageLock.packages?.["node_modules/react"];
const reactDomEntry = packageLock.packages?.["node_modules/react-dom"];
const installedReact = parseVersion(reactEntry?.version);
const installedReactDom = parseVersion(reactDomEntry?.version);

if (!installedReact || installedReact[0] < MINIMUM_REACT_MAJOR) {
  violations.push(
    `Installed react is ${installedReact ? formatVersion(installedReact) : "missing"}, below react-router@7's required React ${MINIMUM_REACT_MAJOR}+ peer dependency.`,
  );
}
if (!installedReactDom || installedReactDom[0] < MINIMUM_REACT_MAJOR) {
  violations.push(
    `Installed react-dom is ${installedReactDom ? formatVersion(installedReactDom) : "missing"}, below react-router@7's required React DOM ${MINIMUM_REACT_MAJOR}+ peer dependency.`,
  );
}

const nodeVersionMatch = /^v?(\d+)\./.exec(process.version);
const runningNodeMajor = nodeVersionMatch ? Number(nodeVersionMatch[1]) : null;
if (runningNodeMajor === null || runningNodeMajor < MINIMUM_NODE_MAJOR) {
  violations.push(
    `Running Node is ${process.version}, below react-router@7's required Node ${MINIMUM_NODE_MAJOR}+ engine requirement.`,
  );
}

// --- Vite baseline (Phase 2C) is unaffected by the router migration ---
const viteEntry = packageLock.packages?.["node_modules/vite"];
if (!viteEntry) {
  violations.push(
    'package-lock.json has no resolved "node_modules/vite" entry — the Phase 2C Vite baseline appears to have been removed.',
  );
}

if (violations.length > 0) {
  console.error(`Router toolchain check failed: ${violations.length} problem(s) found.`);
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Router toolchain check passed: react-router ${formatVersion(installedRouter)} (>= ${formatVersion(MINIMUM_ROUTER_VERSION)}, ${APPROVED_ROUTER_MAJOR}.x only), no "${REMOVED_ROUTER_PACKAGE}" package or import remains, react ${formatVersion(installedReact)}/react-dom ${formatVersion(installedReactDom)} >= ${MINIMUM_REACT_MAJOR}, Node ${process.version} >= ${MINIMUM_NODE_MAJOR}, package.json/package-lock.json root dependency agree.`,
  );
}
