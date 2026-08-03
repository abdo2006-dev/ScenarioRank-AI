#!/usr/bin/env node
/** Deliberate, local-only release-integrity update with review provenance. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs, assertAllowedArgs, single, showHelp, failWith } from "./args.js";
import { DEFAULT_BENCHMARK_ID, REPO_ROOT } from "../datasets/loadBenchmark.js";
import { benchmarkContentDigest, RELEASE_REGISTRY_PATH, readReleaseRegistry } from "../datasets/releasedBenchmarkIntegrity.js";

const HELP = `
eval:update-integrity — deliberately record a reviewed benchmark release

Usage:
  npm run eval:update-integrity -- --benchmark decision-benchmark-v1 --reason "reviewed change"

This command never commits or contacts a network. Confirm whether a change is
semantic or cosmetic before running it; normal validation never changes locks.
`;

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  assertAllowedArgs(parsed, { flags: ["help"], values: ["benchmark", "reason"], singleValues: ["benchmark", "reason"] });
  if (parsed.flags.help) showHelp(HELP);
  const benchmarkId = single(parsed.values, "benchmark") ?? DEFAULT_BENCHMARK_ID;
  const reason = single(parsed.values, "reason")?.trim();
  if (!reason) throw new Error("--reason is required and must be nonempty; confirm the release change with a reviewer first.");
  const benchmarkDir = path.join(REPO_ROOT, "evals", "datasets", benchmarkId);
  const manifest = JSON.parse(await readFile(path.join(benchmarkDir, "manifest.json"), "utf8"));
  const registry = await readReleaseRegistry();
  const prior = registry.records
    .filter((record) => record.benchmark_id === manifest.benchmark_id)
    .at(-1);
  if (prior && prior.benchmark_version === manifest.benchmark_version && prior.metadata_revision === manifest.metadata_revision) {
    throw new Error("Refusing integrity update: change benchmark_version for semantic changes or metadata_revision for cosmetic changes first.");
  }
  const digest = await benchmarkContentDigest(benchmarkDir, manifest);
  const timestamp = new Date().toISOString();
  const record = {
    benchmark_id: manifest.benchmark_id,
    benchmark_version: manifest.benchmark_version,
    schema_version: manifest.schema_version,
    metadata_revision: manifest.metadata_revision,
    previous_digest: prior?.digest ?? null,
    digest,
    reason,
    timestamp,
  };
  const localPath = path.join(benchmarkDir, "release-integrity.json");
  const local = {
    benchmark_id: manifest.benchmark_id,
    benchmark_version: manifest.benchmark_version,
    schema_version: manifest.schema_version,
    metadata_revision: manifest.metadata_revision,
    digest,
  };
  process.stdout.write(`Will write:\n  - evals/datasets/${benchmarkId}/release-integrity.json\n  - evals/datasets/released-benchmark-registry.json\n`);
  await writeFile(localPath, `${JSON.stringify(local, null, 2)}\n`);
  await writeFile(RELEASE_REGISTRY_PATH, `${JSON.stringify({ records: [...registry.records, record] }, null, 2)}\n`);
  process.stdout.write(`Updated ${benchmarkId}: ${prior?.digest ?? "none"} -> ${digest}\n`);
}

main().catch(failWith);
