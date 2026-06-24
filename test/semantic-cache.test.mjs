import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { addSemanticCacheEntry, lookupSemanticCache } from "../src/semantic-cache.mjs";

describe("Verified semantic cache", () => {
  it("reuses a cached ContextPack only when dependencies and oracle match", async () => {
    const root = await makeSemanticCacheFixture();
    const add = await addSemanticCacheEntry(root, {
      query: "alpha",
      file: "src/alpha.mjs",
      oracle: ["npm test"],
      riskProfile: "strict",
      targetPercent: 10,
      keep: ["alpha"]
    });
    assert.equal(add.entry.context_pack.receipt.context_selection.policy.risk_profile, "strict");
    assert.equal(add.entry.context_pack.receipt.context_selection.effective_target_percent, 50);

    const hit = await lookupSemanticCache(root, {
      query: "alpha",
      oracle: ["npm test"]
    });
    assert.equal(hit.schema, "VerifiedSemanticCacheLookupResultV1");
    assert.equal(hit.hit, true);
    assert.equal(hit.best.verification.dependencies_ok, true);
    assert.equal(hit.best.verification.oracle_ok, true);
    assert.equal(hit.best.verification.exact_inventory_match, true);
    assert.equal(hit.verification_policy.schema, "SemanticCacheVerificationPolicyV1");
    assert.equal(hit.verification_policy.mode, "adaptive");
    assert.equal(hit.best.required_similarity, 0.3);

    const wrongOracle = await lookupSemanticCache(root, {
      query: "alpha",
      oracle: ["npm run lint"]
    });
    assert.equal(wrongOracle.hit, false);
    assert.ok(wrongOracle.evaluated[0].verification.reasons.includes("oracle-mismatch"));
  });

  it("requires matching ContextPack expectations for semantic cache reuse", async () => {
    const root = await makeSemanticCacheFixture();
    const add = await addSemanticCacheEntry(root, {
      query: "alpha",
      file: "src/alpha.mjs",
      expect: ["return 1;"],
      expectRegex: ["alpha\\(\\)"]
    });

    assert.equal(add.entry.context_pack.receipt.acceptance_oracle.delivered.success, true);
    assert.ok(add.entry.acceptance_oracle.context_expectations.hash);

    const hit = await lookupSemanticCache(root, {
      query: "alpha",
      expect: ["return 1;"],
      expectRegex: ["alpha\\(\\)"]
    });
    assert.equal(hit.hit, true);
    assert.equal(hit.best.verification.context_expectations_ok, true);

    const missingExpectations = await lookupSemanticCache(root, {
      query: "alpha"
    });
    assert.equal(missingExpectations.hit, false);
    assert.ok(missingExpectations.evaluated[0].verification.reasons.includes("context-expectations-required-but-not-provided"));

    const wrongExpectations = await lookupSemanticCache(root, {
      query: "alpha",
      expect: ["return 2;"],
      expectRegex: ["alpha\\(\\)"]
    });
    assert.equal(wrongExpectations.hit, false);
    assert.ok(wrongExpectations.evaluated[0].verification.reasons.includes("context-expectations-mismatch"));
  });

  it("rejects reuse when a dependency file changes", async () => {
    const root = await makeSemanticCacheFixture();
    await addSemanticCacheEntry(root, {
      query: "alpha",
      file: "src/alpha.mjs",
      oracle: ["npm test"]
    });

    await fs.writeFile(path.join(root, "src/alpha.mjs"), [
      "export function alpha() {",
      "  return 2;",
      "}"
    ].join("\n"));

    const result = await lookupSemanticCache(root, {
      query: "alpha",
      oracle: ["npm test"]
    });

    assert.equal(result.hit, false);
    assert.ok(result.evaluated[0].verification.reasons.includes("changed-file:src/alpha.mjs"));
  });

  it("uses an adaptive similarity policy without allowing unrelated cache reuse", async () => {
    const root = await makeSemanticCacheFixture();
    await addSemanticCacheEntry(root, {
      query: "alpha",
      file: "src/alpha.mjs",
      oracle: ["npm test"],
      expect: ["return 1;"]
    });

    const relaxed = await lookupSemanticCache(root, {
      query: "alpha helper",
      oracle: ["npm test"],
      expect: ["return 1;"]
    });
    assert.equal(relaxed.hit, true);
    assert.equal(relaxed.verification_policy.required_similarity, 0.5);
    assert.equal(relaxed.best.required_similarity, 0.3);
    assert.ok(relaxed.best.verification.reasons.includes("exact-inventory-match"));

    const tooDistant = await lookupSemanticCache(root, {
      query: "alpha beta gamma delta",
      oracle: ["npm test"],
      expect: ["return 1;"]
    });
    assert.equal(tooDistant.hit, false);
    assert.ok(tooDistant.evaluated[0].verification.reasons.includes("query-similarity-below-threshold:0.25<0.3"));
  });

  it("requires matching tool fingerprints for cache reuse", async () => {
    const root = await makeSemanticCacheFixture();
    const add = await addSemanticCacheEntry(root, {
      query: "alpha",
      file: "src/alpha.mjs",
      oracle: ["npm test"],
      expect: ["return 1;"],
      toolVersion: ["node-test=1"]
    });

    assert.equal(add.entry.tool_fingerprint.schema, "SemanticCacheToolFingerprintV1");
    assert.ok(add.entry.tool_fingerprint.fingerprint_hash.startsWith("sha256:"));

    const hit = await lookupSemanticCache(root, {
      query: "alpha",
      oracle: ["npm test"],
      expect: ["return 1;"],
      toolVersion: ["node-test=1"]
    });
    assert.equal(hit.hit, true);
    assert.equal(hit.best.verification.tool_fingerprint_ok, true);

    const mismatch = await lookupSemanticCache(root, {
      query: "alpha",
      oracle: ["npm test"],
      expect: ["return 1;"],
      toolVersion: ["node-test=2"]
    });
    assert.equal(mismatch.hit, false);
    assert.ok(mismatch.evaluated[0].verification.reasons.includes("tool-fingerprint-mismatch"));
  });

  it("verifies registered ContextPacks before reusing a semantic cache hit", async () => {
    const root = await makeSemanticCacheFixture();
    const add = await addSemanticCacheEntry(root, {
      query: "alpha",
      file: "src/alpha.mjs",
      oracle: ["npm test"],
      expect: ["return 1;"],
      registry: "context-pack-registry.json"
    });

    assert.equal(add.entry.context_pack.registry.schema, "SemanticCacheContextPackRegistryContractV1");
    assert.equal(add.entry.context_pack.registry.status, "registered-and-verified");
    assert.equal(add.entry.context_pack.registry.receipt_verification_status, "verified-receipt");

    const hit = await lookupSemanticCache(root, {
      query: "alpha",
      oracle: ["npm test"],
      expect: ["return 1;"]
    });
    assert.equal(hit.hit, true);
    assert.equal(hit.best.verification.context_pack_registry_ok, true);
    assert.equal(hit.best.verification.context_pack_registry_status, "verified-context-pack-id");
    assert.equal(hit.best.verification.context_pack_registry.receipt_verification_status, "verified-receipt");

    await fs.unlink(path.join(root, "context-pack-registry.json"));
    const missingRegistry = await lookupSemanticCache(root, {
      query: "alpha",
      oracle: ["npm test"],
      expect: ["return 1;"]
    });
    assert.equal(missingRegistry.hit, false);
    assert.ok(missingRegistry.evaluated[0].verification.reasons.includes("context-pack-registry-context-pack-id-not-found"));
  });

  it("CLI semantic-cache add and lookup work together", async () => {
    const root = await makeSemanticCacheFixture();
    const add = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "semantic-cache",
      "add",
      root,
      "--query",
      "alpha",
      "--file",
      "src/alpha.mjs",
      "--oracle",
      "npm test",
      "--tool-version",
      "node-test=1",
      "--registry",
      "context-pack-registry.json",
      "--json"
    ], {
      encoding: "utf8"
    });
    assert.equal(add.status, 0, add.stderr);
    const addPayload = JSON.parse(add.stdout);
    assert.equal(addPayload.schema, "VerifiedSemanticCacheAddResultV1");
    assert.equal(addPayload.entry.context_pack.registry.status, "registered-and-verified");

    const lookup = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "semantic-cache",
      "lookup",
      root,
      "--query",
      "alpha",
      "--oracle",
      "npm test",
      "--tool-version",
      "node-test=1",
      "--json"
    ], {
      encoding: "utf8"
    });
    assert.equal(lookup.status, 0, lookup.stderr);
    assert.equal(JSON.parse(lookup.stdout).hit, true);
  });
});

async function makeSemanticCacheFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-semantic-cache-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src/alpha.mjs"), [
    "export function alpha() {",
    "  return 1;",
    "}"
  ].join("\n"));
  await fs.writeFile(path.join(root, "src/beta.mjs"), [
    "export function beta() {",
    "  return 2;",
    "}"
  ].join("\n"));
  return root;
}
