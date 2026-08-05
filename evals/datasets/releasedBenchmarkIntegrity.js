/**
 * Content locks for released development benchmarks. The lock deliberately
 * lives in the repository-level registry: changing a released case and its
 * local integrity declaration together still fails until the explicit update
 * command records reviewed provenance in that external release record.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Filled from the reviewed v1 corpus; new benchmark versions require a new key. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RELEASE_REGISTRY_PATH = path.join(HERE, "released-benchmark-registry.json");

export async function readReleaseRegistry() {
  const registry = JSON.parse(await readFile(RELEASE_REGISTRY_PATH, "utf8"));
  if (!Array.isArray(registry.records)) throw new Error("Released benchmark registry is invalid.");
  return registry;
}

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
  const registry = await readReleaseRegistry();
  const external = registry.records.find((record) =>
    record.benchmark_id === manifest.benchmark_id &&
    record.benchmark_version === manifest.benchmark_version &&
    record.schema_version === manifest.schema_version &&
    record.metadata_revision === manifest.metadata_revision,
  );
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
  if (!external || external.digest !== expected) {
    throw new Error(
      `Released benchmark ${key} does not match the repository-level release registry. ` +
        "Use the explicit eval:update-integrity command after reviewer confirmation; normal validation never updates release records.",
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
