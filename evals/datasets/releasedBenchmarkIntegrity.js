/**
 * Content locks for released development benchmarks. The lock deliberately
 * lives outside a benchmark directory: changing a released case and its local
 * manifest together must still fail until a reviewer explicitly creates a new
 * benchmark version and updates this release registry.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Filled from the reviewed v1 corpus; new benchmark versions require a new key. */
export const RELEASED_BENCHMARK_DIGESTS = Object.freeze({
  "decision-benchmark-v1@1.0.0": "c59afa0c0362a69e7f03f3c6ef9511e9c8987dd766085b096061d6fc8efa60f8",
});

/** Canonical JSON: object-key order and whitespace never affect a release. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function benchmarkContentDigest(benchmarkDir, manifest) {
  const files = ["manifest.json", "rubric.json", ...manifest.case_ids.map((id) => `cases/${id}.json`)];
  const hash = createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update("\0");
    const parsed = JSON.parse(await readFile(path.join(benchmarkDir, relativePath), "utf8"));
    hash.update(canonicalJson(parsed));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function assertReleasedBenchmarkIntegrity(benchmarkDir, manifest) {
  const key = `${manifest.benchmark_id}@${manifest.benchmark_version}`;
  const releasePath = path.join(benchmarkDir, "release-integrity.json");
  let release;
  try {
    release = JSON.parse(await readFile(releasePath, "utf8"));
  } catch {
    throw new Error(`Released benchmark ${key} is missing a valid release-integrity.json file.`);
  }
  const expected = release.digest;
  if (
    release.benchmark_id !== manifest.benchmark_id ||
    release.benchmark_version !== manifest.benchmark_version ||
    release.schema_version !== manifest.schema_version ||
    release.metadata_revision !== manifest.metadata_revision ||
    typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)
  ) {
    throw new Error(`Released benchmark ${key} has an invalid release-integrity.json declaration.`);
  }
  if (!expected) {
    throw new Error(
      `Released benchmark ${key} has no reviewed content lock. ` +
        "Add the reviewed version and digest to the release registry before it can run.",
    );
  }
  const actual = await benchmarkContentDigest(benchmarkDir, manifest);
  if (actual !== expected) {
    throw new Error(
      `Released benchmark ${key} does not match its reviewed content lock. ` +
        "Do not edit released case meaning in place: create a new benchmark version and add its reviewed digest to the release registry.",
    );
  }
}
