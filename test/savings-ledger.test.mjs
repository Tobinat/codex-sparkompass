import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildCalibratedContextPack } from "../src/context-calibration.mjs";
import { buildContextPack } from "../src/context-pack.mjs";
import { appendReceiptToLedger, buildSavingsLedger, buildSavingsLedgerReport, formatSavingsLedgerReport } from "../src/savings-ledger.mjs";

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

  it("records Auto-Target savings gates across ContextPack receipts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-ledger-autotarget-"));
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      ...Array.from({ length: 80 }, (_, index) => (
        `debug noise ${index} repeated filler text that can disappear safely`
      )),
      "Done when: Auth reset test passes"
    ].join("\n");
    const pack = buildCalibratedContextPack(source, {
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["src/auth/session\\.ts"]
    });

    await appendReceiptToLedger(root, pack.receipt, {
      out: "ledger.json",
      runType: "test-auto-target"
    });
    const ledger = await buildSavingsLedgerReport(root, {
      ledger: "ledger.json"
    });

    assert.equal(ledger.totals.auto_target_entries, 1);
    assert.equal(ledger.totals.verified_auto_target_entries, 1);
    assert.equal(ledger.totals.verified_auto_target_oracle_entries, 1);
    assert.equal(ledger.totals.auto_target_oracle_gate_failures, 0);
    assert.ok(ledger.totals.auto_target_additional_saved_tokens > 0);
    assert.equal(ledger.entries[0].auto_target_oracle_gate, "verified-oracle");
    assert.equal(ledger.entries[0].auto_target_explicit_oracle_present, true);
    assert.equal(ledger.entries[0].auto_target_savings_gate, "verified-additional-saving");
    assert.match(formatSavingsLedgerReport(ledger), /Auto-Target/);
  });

  it("separates gross savings from quality-gated savings", () => {
    const ledger = buildSavingsLedger([
      buildSavingsEntry({
        gateStatus: "verified-publishable",
        originalTokens: 100,
        deliveredTokens: 40
      }),
      buildSavingsEntry({
        gateStatus: "acceptance-oracle-insensitive",
        originalTokens: 100,
        deliveredTokens: 10
      })
    ]);

    assert.equal(ledger.totals.entries, 2);
    assert.equal(ledger.totals.verified_entries, 1);
    assert.equal(ledger.totals.quality_gated_saving_entries, 1);
    assert.equal(ledger.totals.needs_review_entries, 1);
    assert.equal(ledger.totals.delivered_saved_tokens, 150);
    assert.equal(ledger.totals.delivered_savings_percent, 75);
    assert.equal(ledger.totals.verified_delivered_saved_tokens, 60);
    assert.equal(ledger.totals.verified_delivered_savings_percent, 60);
    assert.equal(ledger.totals.quality_gated_delivered_saved_tokens, 60);
    assert.equal(ledger.totals.quality_gated_delivered_savings_percent, 60);
    assert.match(formatSavingsLedgerReport(ledger), /Qualitätsgegatede positive Ersparnis/);
  });

  it("counts verified expanded ContextPacks as quality-gated savings", () => {
    const ledger = buildSavingsLedger([
      buildSavingsEntry({
        gateStatus: "verified-expanded-context",
        originalTokens: 100,
        deliveredTokens: 55,
        fallbackUsed: true,
        fallbackMode: "expanded-context"
      }),
      buildSavingsEntry({
        gateStatus: "fallback-full-context",
        originalTokens: 100,
        deliveredTokens: 100,
        fallbackUsed: true,
        fallbackMode: "full-context"
      })
    ]);

    assert.equal(ledger.totals.entries, 2);
    assert.equal(ledger.totals.verified_entries, 2);
    assert.equal(ledger.totals.quality_gated_saving_entries, 1);
    assert.equal(ledger.totals.needs_review_entries, 0);
    assert.equal(ledger.totals.expanded_contexts, 1);
    assert.equal(ledger.totals.full_context_fallbacks, 1);
    assert.equal(ledger.totals.verified_delivered_saved_tokens, 45);
    assert.equal(ledger.totals.verified_delivered_savings_percent, 23);
    assert.equal(ledger.totals.quality_gated_delivered_saved_tokens, 45);
    assert.equal(ledger.totals.quality_gated_delivered_savings_percent, 45);
  });

  it("does not count zero-savings verified ContextPacks as quality-gated savings", () => {
    const ledger = buildSavingsLedger([
      buildSavingsEntry({
        gateStatus: "verified-publishable",
        originalTokens: 100,
        deliveredTokens: 100
      })
    ]);

    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.verified_entries, 1);
    assert.equal(ledger.totals.quality_gated_saving_entries, 0);
    assert.equal(ledger.totals.needs_review_entries, 0);
    assert.equal(ledger.totals.delivered_saved_tokens, 0);
    assert.equal(ledger.totals.verified_original_tokens, 100);
    assert.equal(ledger.totals.verified_delivered_tokens, 100);
    assert.equal(ledger.totals.verified_delivered_saved_tokens, 0);
    assert.equal(ledger.totals.verified_delivered_savings_percent, 0);
    assert.equal(ledger.totals.quality_gated_original_tokens, 0);
    assert.equal(ledger.totals.quality_gated_delivered_tokens, 0);
    assert.equal(ledger.totals.quality_gated_delivered_saved_tokens, 0);
    assert.equal(ledger.totals.quality_gated_delivered_savings_percent, 0);
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

function buildSavingsEntry({
  gateStatus,
  originalTokens,
  deliveredTokens,
  fallbackUsed = false,
  fallbackMode = "compact-context"
}) {
  return {
    schema: "SavingsLedgerEntryV1",
    entry_id: `${gateStatus}-${originalTokens}-${deliveredTokens}`,
    label: gateStatus,
    gate_status: gateStatus,
    quality_status: "ok",
    fallback_used: fallbackUsed,
    fallback_mode: fallbackMode,
    original_tokens: originalTokens,
    compact_tokens: deliveredTokens,
    delivered_tokens: deliveredTokens,
    delivered_saved_tokens: Math.max(0, originalTokens - deliveredTokens),
    critical_anchor_retention_percent: 100,
    source_evidence_coverage_percent: 100
  };
}
