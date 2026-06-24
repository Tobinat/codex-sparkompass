import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextInventory } from "../src/inventory.mjs";
import { loadSourceByHash } from "../src/source-hash.mjs";

describe("SourceHashEvidenceV1", () => {
  it("loads a bounded source excerpt by source_hash", async () => {
    const root = await createFixture();
    const unit = await findUnit(root, "alphaProbe");
    const evidence = await loadSourceByHash(root, {
      sourceHash: unit.source_hash,
      contextLines: 1
    });

    assert.equal(evidence.schema, "SourceHashEvidenceV1");
    assert.equal(evidence.gate.status, "verified-source-hash-evidence");
    assert.equal(evidence.gate.verified, true);
    assert.equal(evidence.matches.length, 1);
    assert.equal(evidence.matches[0].source_hash_match, true);
    assert.equal(evidence.matches[0].file, "src/probe.mjs");
    assert.match(evidence.matches[0].text, /alphaProbe/);
    assert.ok(evidence.matches[0].line_start <= evidence.matches[0].line);
    assert.ok(evidence.matches[0].line_end >= evidence.matches[0].line);
  });

  it("returns a review gate when a source_hash is not found", async () => {
    const root = await createFixture();
    const evidence = await loadSourceByHash(root, {
      sourceHash: `sha256:${"0".repeat(64)}`
    });

    assert.equal(evidence.schema, "SourceHashEvidenceV1");
    assert.equal(evidence.gate.status, "source-hash-not-found");
    assert.equal(evidence.gate.verified, false);
    assert.deepEqual(evidence.matches, []);
    assert.ok(evidence.gate.reasons.includes("hash-not-found"));
  });

  it("exposes source hash loading through the CLI", async () => {
    const root = await createFixture();
    const unit = await findUnit(root, "alphaProbe");
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "source",
      root,
      "--source-hash",
      unit.source_hash,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "SourceHashEvidenceV1");
    assert.equal(payload.gate.status, "verified-source-hash-evidence");
    assert.match(payload.matches[0].text, /alphaProbe/);
  });
});

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-source-hash-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src/probe.mjs"), [
    "export function alphaProbe() {",
    "  return \"alpha\";",
    "}",
    "export const betaValue = 42;"
  ].join("\n"), "utf8");
  return root;
}

async function findUnit(root, name) {
  const inventory = await buildContextInventory(root);
  const unit = inventory.units.find((candidate) => candidate.name === name);
  assert.ok(unit, `Expected unit ${name}`);
  return unit;
}
