import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextPackFormat, validateContextPackFormat } from "../src/context-pack-format.mjs";
import { buildContextPack } from "../src/context-pack.mjs";

describe("ContextPackFormatV1", () => {
  it("describes the portable ContextPack receipt contract", () => {
    const format = buildContextPackFormat();

    assert.equal(format.schema, "ContextPackFormatV1");
    assert.equal(format.receipt_schema, "ContextPackReceiptV1");
    assert.ok(format.required_top_level_fields.includes("source_evidence"));
    assert.ok(format.compatible_gate_statuses.includes("verified-publishable"));
    assert.equal(format.json_schema.properties.schema.const, "ContextPackReceiptV1");
  });

  it("validates a generated ContextPack receipt without source text", () => {
    const pack = buildContextPack([
      "ERROR E_FORMAT_104 in src/context-pack.mjs",
      "ContextPackReceiptV1 must preserve E_FORMAT_104.",
      "Done when: ContextPackFormatV1 lint passes."
    ].join("\n"), {
      label: "format.txt",
      keep: ["E_FORMAT_104", "ContextPackReceiptV1"],
      expect: ["E_FORMAT_104", "ContextPackReceiptV1"],
      expectRegex: ["ContextPackFormatV1"]
    });

    const validation = validateContextPackFormat(pack);

    assert.equal(validation.schema, "ContextPackFormatValidationV1");
    assert.equal(validation.status, "verified-context-pack-format");
    assert.equal(validation.verified, true);
    assert.deepEqual(validation.failures, []);
  });

  it("flags receipts that break portable format invariants", () => {
    const pack = buildContextPack("ERROR E_FORMAT_104\nDone when: safe.", {
      keep: ["E_FORMAT_104"],
      expect: ["E_FORMAT_104"]
    });
    const broken = structuredClone(pack.receipt);
    broken.critical_anchors.retention_percent = 99;
    broken.source.hash = "sha256:bad";

    const validation = validateContextPackFormat(broken);

    assert.equal(validation.status, "context-pack-format-needs-review");
    assert.equal(validation.verified, false);
    assert.ok(validation.failures.some((failure) => failure.check === "critical-anchor-retention-100"));
    assert.ok(validation.failures.some((failure) => failure.check === "source-hash-sha256"));
  });

  it("flags receipts with insensitive acceptance oracles", () => {
    const pack = buildContextPack([
      "DEBUG first repeated marker.",
      "DEBUG second repeated marker.",
      "KEEP_ANCHOR remains."
    ].join("\n"), {
      keep: ["KEEP_ANCHOR"],
      expectRegex: ["DEBUG"],
      targetPercent: 90,
      expansionTargets: []
    });

    const validation = validateContextPackFormat(pack);

    assert.equal(validation.status, "context-pack-format-needs-review");
    assert.equal(validation.verified, false);
    assert.ok(validation.failures.some((failure) => failure.check === "acceptance-oracle-source-sensitivity"));
  });

  it("CLI exposes schema and lints a receipt file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-context-pack-format-"));
    const pack = buildContextPack("ERROR E_FORMAT_104\nDone when: safe.", {
      keep: ["E_FORMAT_104"],
      expect: ["E_FORMAT_104"]
    });
    const receiptPath = path.join(root, "pack.json");
    await fs.writeFile(receiptPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

    const schema = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "receipt",
      "schema",
      "--json"
    ], {
      encoding: "utf8"
    });
    assert.equal(schema.status, 0, schema.stderr);
    assert.equal(JSON.parse(schema.stdout).schema, "ContextPackFormatV1");

    const lint = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "receipt",
      "lint",
      "--receipt",
      receiptPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(lint.status, 0, lint.stderr);
    assert.equal(JSON.parse(lint.stdout).status, "verified-context-pack-format");
  });
});
