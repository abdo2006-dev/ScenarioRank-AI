import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Phase 2B-2 confirmed every path below has zero importers from the active
 * app entrypoints (src/main.tsx, src/App.tsx, src/pages/, src/features/decision/)
 * before deleting it. This guard fails fast if any of it is reintroduced
 * without an equally deliberate review, and if a second package-manager
 * lockfile returns after the npm-only decision (docs/decisions/ADR-0007-npm-only-lockfile.md).
 */
const deadPaths = [
  "src/components/ui",
  "src/components/NavLink.tsx",
  "src/hooks/use-mobile.tsx",
  "src/hooks/use-toast.ts",
  "src/lib/utils.ts",
  "src/App.css",
  "components.json",
  "playwright.config.ts",
  "playwright-fixture.ts",
];

const unsupportedLockfiles = ["bun.lock", "bun.lockb"];

/** The generated-template identity this project has since renamed away from. */
const generatedPackageName = "vite_react_shadcn_ts";

/**
 * A correction pass confirmed the active public demo (public/demo.html)
 * still described the retired award-build architecture (Anthropic Claude,
 * a seven-agent pipeline, "Bias Review"). It was rewritten to describe the
 * current OpenAI/gpt-5-mini, up-to-four-logical-stage pipeline instead —
 * see docs/security/DEPENDENCY_AUDIT.md and docs/PROJECT_STATUS.md. This
 * list catches the stale terms reappearing in the active demo; historical
 * documentation may still reference them by name.
 */
const stalePublicDemoTerms = [
  "Claude",
  "Bias Agent",
  "Bias Review",
  "Role Agent",
  "Scenario Agent",
  "Candidate Scoring Agent",
  "Decision Agent",
  "seven-stage agent pipeline",
];

/**
 * Root providers Phase 2B-2 removed because nothing in the active app calls
 * them (docs/architecture/CURRENT_ARCHITECTURE.md). Reintroducing the import
 * without a deliberate decision would silently re-add dead dependencies.
 */
const removedAppImports = [
  "@tanstack/react-query",
  "@/components/ui/toaster",
  "@/components/ui/sonner",
  "@/components/ui/tooltip",
];

const removedDependencies = [
  "@hookform/resolvers",
  "@radix-ui/react-accordion",
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-label",
  "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-popover",
  "@radix-ui/react-progress",
  "@radix-ui/react-radio-group",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-slot",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toast",
  "@radix-ui/react-toggle",
  "@radix-ui/react-toggle-group",
  "@radix-ui/react-tooltip",
  "@tanstack/react-query",
  "class-variance-authority",
  "cmdk",
  "date-fns",
  "embla-carousel-react",
  "framer-motion",
  "input-otp",
  "lovable-tagger",
  "lucide-react",
  "next-themes",
  "react-day-picker",
  "react-hook-form",
  "react-resizable-panels",
  "recharts",
  "sonner",
  "vaul",
  "@tailwindcss/typography",
  "clsx",
  "tailwind-merge",
  "@playwright/test",
  "tailwindcss-animate",
];

const violations = [];

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

for (const deadPath of deadPaths) {
  if (await pathExists(path.resolve(deadPath))) {
    violations.push(
      `${deadPath} was reintroduced. Phase 2B-2 confirmed it was unreachable from every active entrypoint — see docs/security/DEPENDENCY_AUDIT.md.`,
    );
  }
}

for (const lockfile of unsupportedLockfiles) {
  if (await pathExists(path.resolve(lockfile))) {
    violations.push(
      `${lockfile} was reintroduced. npm is the only supported package manager for this repository — see docs/decisions/ADR-0007-npm-only-lockfile.md.`,
    );
  }
}

const appTsxPath = path.resolve("src/App.tsx");
if (await pathExists(appTsxPath)) {
  const appTsxContents = await readFile(appTsxPath, "utf8");
  for (const importSpecifier of removedAppImports) {
    if (appTsxContents.includes(importSpecifier)) {
      violations.push(
        `src/App.tsx imports "${importSpecifier}" again. Phase 2B-2 removed this root provider because no active component used it — see docs/architecture/CURRENT_ARCHITECTURE.md.`,
      );
    }
  }
}

const packageJsonPath = path.resolve("package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const declaredDependencies = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
]);

for (const dependency of removedDependencies) {
  if (declaredDependencies.has(dependency)) {
    violations.push(
      `package.json declares "${dependency}" again. Phase 2B-2 confirmed it was unused after the template cleanup — see docs/security/DEPENDENCY_AUDIT.md.`,
    );
  }
}

if (packageJson.name === generatedPackageName) {
  violations.push(
    `package.json "name" is back to the generated template identity "${generatedPackageName}". This project's package name was deliberately renamed — see docs/PROJECT_STATUS.md.`,
  );
}

const publicDemoPath = path.resolve("public/demo.html");
if (await pathExists(publicDemoPath)) {
  const publicDemoContents = await readFile(publicDemoPath, "utf8");
  for (const term of stalePublicDemoTerms) {
    if (publicDemoContents.toLowerCase().includes(term.toLowerCase())) {
      violations.push(
        `public/demo.html contains the stale term "${term}" again. The public demo was corrected to describe the current OpenAI/gpt-5-mini pipeline, not the retired award-build architecture — see docs/security/DEPENDENCY_AUDIT.md.`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(
    `Unused-template check failed: ${violations.length} confirmed-dead item(s) reappeared.`,
  );
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Unused-template check passed: ${deadPaths.length} dead path(s), ${unsupportedLockfiles.length} unsupported lockfile(s), ${removedAppImports.length} removed root-provider import(s), ${removedDependencies.length} removed dependency name(s), the generated package name, and ${stalePublicDemoTerms.length} stale public-demo term(s) all remain absent.`,
  );
}
