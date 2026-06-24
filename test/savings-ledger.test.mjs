import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextPack } from "../src/context-pack.mjs";
import { appendReceiptToLedger, buildSavingsLedgerReport, formatSavingsLedgerReport } from "../src/savings-ledger.mjs";

describe("SavingsLedgerV1", () => {
  it("records delivered savings instead of compact-candidate savings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-ledger-"));
    const source = [
      "AUTH_RESET_TOKEN_EXPIRED bleibt als kritischer Anker erhalten.",
      ...Array.from({ length: 24 }, (_, index) => (
        `Optionaler Hinweis "--variant-${index}" mit viel erklärendem Fülltext.`
      ))
    ].join("\n");
    const pack = buildContextPack(source, {
      label: "fallback.txt",
      targetPercent: 10,
      expansionTargets: [],
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });

    assert.equal(pack.receipt.gate.status, "fallback-full-context");
    assert.equal(pack.receipt.savings.delivered.percent, 0);
    assert.ok(pack.receipt.savings.compact.percent > 0);

    const write = await appendReceiptToLedger(root, pack.receipt, {
      out: "ledger.json",
      runType: "test"
    });
    const ledger = await buildSavingsLedgerReport(root, {
      ledger: "ledger.json"
    });

    assert.equal(write.schema, "SavingsLedgerWriteResultV1");
    assert.equal(ledger.schema, "SavingsLedgerV1");
    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.delivered_savings_percent, 0);
    assert.equal(ledger.totals.delivered_saved_tokens, 0);
    assert.ok(ledger.totals.compact_savings_percent > 0);
    assert.equal(ledger.totals.full_context_fallbacks, 1);
    assert.match(formatSavingsLedgerReport(ledger), /Echte Ersparnis/);
  });

  it("CLI pack can append to a ledger and report it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-ledger-cli-"));
    const ledgerPath = path.join(root, "savings-ledger.json");
    const pack = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "pack",
      "--text",
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts\nDone when: safe",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(pack.status, 0, pack.stderr);
    const parsed = JSON.parse(pack.stdout);
    assert.equal(parsed.ledger.schema, "SavingsLedgerWriteResultV1");
    assert.equal(parsed.ledger.path, ledgerPath);

    const report = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "ledger",
      "report",
      ".",
      "--ledger",
      ledgerPath
    ], {
      encoding: "utf8"
    });

    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /SavingsLedgerV1/);
    assert.match(report.stdout, /Einträge: 1/);
    assert.match(report.stdout, /Echte Ersparnis/);
  });
});
