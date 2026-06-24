import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextEnvelope } from "../src/context-envelope.mjs";
import { appendEnvelopeToLedger, buildEnvelopeLedgerReport } from "../src/envelope-ledger.mjs";

describe("ContextEnvelopeLedgerV1", () => {
  it("records prefix reuse across envelope runs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-envelope-ledger-"));
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableHelper() { return 'same'; }",
      "export function targetFlow() { return stableHelper(); }"
    ].join("\n"));
    const ledgerPath = path.join(root, "envelope-ledger.json");
    const first = await buildContextEnvelope(root, {
      goal: "targetFlow stableHelper",
      budget: 120,
      minCachePrefixTokens: 1
    });
    const second = await buildContextEnvelope(root, {
      goal: "targetFlow stableHelper",
      budget: 120,
      minCachePrefixTokens: 1
    });

    const write1 = await appendEnvelopeToLedger(root, first, {
      out: ledgerPath
    });
    const write2 = await appendEnvelopeToLedger(root, second, {
      out: ledgerPath
    });
    const report = await buildEnvelopeLedgerReport(root, {
      ledger: ledgerPath
    });

    assert.equal(write1.schema, "EnvelopeLedgerWriteResultV1");
    assert.equal(write1.entry.prefix_reuse_status, "not-compared");
    assert.equal(write2.entry.prefix_reuse_status, "full-prefix-reusable");
    assert.equal(report.schema, "ContextEnvelopeLedgerV1");
    assert.equal(report.totals.entries, 2);
    assert.equal(report.totals.full_prefix_reuse_count, 1);
    assert.ok(report.totals.estimated_reused_prefix_tokens > 0);
    assert.ok(report.totals.prefix_reuse_percent > 0);
  });

  it("CLI envelope can append to and report an envelope ledger", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-cli-envelope-ledger-"));
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableHelper() { return 'same'; }",
      "export function targetFlow() { return stableHelper(); }"
    ].join("\n"));
    const ledgerPath = path.join(root, "envelope-ledger.json");
    const cli = path.resolve("bin/codex-sparkompass.mjs");
    const first = spawnSync(process.execPath, [
      cli,
      "envelope",
      root,
      "--goal",
      "targetFlow stableHelper",
      "--budget",
      "120",
      "--min-cache-prefix-tokens",
      "1",
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });
    const second = spawnSync(process.execPath, [
      cli,
      "envelope",
      root,
      "--goal",
      "targetFlow stableHelper",
      "--budget",
      "120",
      "--min-cache-prefix-tokens",
      "1",
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });
    const report = spawnSync(process.execPath, [
      cli,
      "envelope-ledger",
      "report",
      root,
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).ledger.entry.prefix_reuse_status, "not-compared");
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).ledger.entry.prefix_reuse_status, "full-prefix-reusable");
    assert.equal(report.status, 0, report.stderr);
    assert.equal(JSON.parse(report.stdout).totals.entries, 2);
  });
});
