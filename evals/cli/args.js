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
 * @returns {{ flags: Record<string, true>, values: Record<string, string[]>, positional: string[] }}
 */
export function parseArgs(argv) {
  const flags = {};
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
  }

  return { flags, values, positional };
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
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${label} "${raw}". It must be an integer.`);
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
