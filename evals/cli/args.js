/**
 * @file Minimal CLI argument parsing (Phase 3A evaluation harness).
 *
 * Dependency-free by design: the repository already declines to add packages
 * for jobs this small, and an evaluation harness that pulls in a CLI framework
 * would add supply-chain surface for no capability.
 *
 * Output rules these commands follow (docs/evaluation/RUNBOOK.md):
 *   - no ANSI escape codes, so output stays greppable and diffable;
 *   - errors name the fix, not just the problem;
 *   - a required failure exits nonzero.
 */

/**
 * Parses `--flag`, `--key value`, and `--key=value`. Repeated keys collect
 * into an array, which is how `--case a --case b` works.
 * @param {string[]} argv
 * @returns {{ flags: Record<string, true>, flagCounts: Record<string, number>, values: Record<string, string[]>, positional: string[] }}
 */
export function parseArgs(argv) {
  const flags = {};
  const flagCounts = {};
  const values = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf("=");
    if (equals !== -1) {
      const key = body.slice(0, equals);
      const value = body.slice(equals + 1);
      (values[key] ??= []).push(value);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      (values[body] ??= []).push(next);
      index += 1;
      continue;
    }
    flags[body] = true;
    flagCounts[body] = (flagCounts[body] ?? 0) + 1;
  }

  return { flags, flagCounts, values, positional };
}

/**
 * Rejects misspelled, positional, and value/flag-shape mistakes before a CLI
 * performs any work. A harness must never quietly treat an unknown option as
 * permission to run a different command (especially a whole benchmark run).
 */
export function assertAllowedArgs(parsed, { flags = [], values = [], singleValues = [] }) {
  const allowedFlags = new Set(flags);
  const allowedValues = new Set(values);
  const unknown = [
    ...Object.keys(parsed.flags),
    ...Object.keys(parsed.values),
  ].filter((key) => !allowedFlags.has(key) && !allowedValues.has(key));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.map((key) => `--${key}`).join(", ")}. Run with --help to see supported options.`);
  }

  const valuesUsedAsFlags = Object.keys(parsed.flags).filter((key) => allowedValues.has(key));
  if (valuesUsedAsFlags.length > 0) {
    throw new Error(`Option(s) require a value: ${valuesUsedAsFlags.map((key) => `--${key}`).join(", ")}.`);
  }
  const flagsUsedAsValues = Object.keys(parsed.values).filter((key) => allowedFlags.has(key));
  if (flagsUsedAsValues.length > 0) {
    throw new Error(`Option(s) do not accept a value: ${flagsUsedAsValues.map((key) => `--${key}`).join(", ")}.`);
  }
  const duplicateFlags = Object.entries(parsed.flagCounts ?? {}).filter(([, count]) => count > 1).map(([key]) => key);
  if (duplicateFlags.length > 0) {
    throw new Error(`Option(s) may be used only once: ${duplicateFlags.map((key) => `--${key}`).join(", ")}. Run with --help to see supported options.`);
  }
  const duplicateValues = singleValues.filter((key) => (parsed.values[key]?.length ?? 0) > 1);
  if (duplicateValues.length > 0) {
    throw new Error(`Option(s) may be supplied only once: ${duplicateValues.map((key) => `--${key}`).join(", ")}. Run with --help to see supported options.`);
  }
  if (parsed.positional.length > 0) {
    throw new Error(`Unexpected positional argument(s): ${parsed.positional.join(", ")}. Run with --help to see supported options.`);
  }
}

/** @returns {string|undefined} the last value given for a key */
export function single(values, key) {
  const list = values[key];
  return list === undefined ? undefined : list[list.length - 1];
}

/** @returns {string[]} every value given for a key */
export function many(values, key) {
  return values[key] ?? [];
}

/**
 * Parses an integer option, rejecting anything that is not exactly an integer.
 * `--repetitions 2.5` silently becoming 2 would be worse than an error.
 * @param {string|undefined} raw
 * @param {string} label
 * @param {number} fallback
 */
export function integerOption(raw, label, fallback) {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid ${label} "${raw}". It must be a decimal integer.`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${label} "${raw}". It must be a safe decimal integer.`);
  }
  return parsed;
}

/**
 * Prints help and exits 0. Help is always available and never requires a
 * valid configuration to reach.
 * @param {string} text
 */
export function showHelp(text) {
  process.stdout.write(`${text.trimEnd()}\n`);
  process.exit(0);
}

/**
 * Reports a failure the way the runbook promises: a plain message on stderr
 * and a nonzero exit status.
 * @param {unknown} error
 * @param {number} [code]
 */
export function failWith(error, code = 1) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(code);
}
