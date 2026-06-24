import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextHandoffReceipt } from "../src/context-handoff.mjs";
import { appendHandoffToLedger, buildHandoffLedgerReport, formatHandoffLedgerReport } from "../src/handoff-ledger.mjs";

describe("ContextHandoffLedgerV1", () => {
  it("records verified handoff receipts and reports estimated start-context savings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-handoff-ledger-"));
    const ledgerPath = path.join(root, "handoff-ledger.json");
    const first = await buildContextHandoffReceipt(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });
    const second = await buildContextHandoffReceipt(".", {
      goal: "ContextHandoffReceipt documentation",
      file: ["src/context-handoff.mjs"],
      expect: ["ContextHandoffReceiptV1"],
      budget: 160,
      minCachePrefixTokens: 1
    });

    await appendHandoffToLedger(".", first, {
      out: ledgerPath,
      runType: "test"
    });
    const write = await appendHandoffToLedger(".", second, {
      out: ledgerPath,
      runType: "test"
    });
    const ledger = await buildHandoffLedgerReport(".", {
      ledger: ledgerPath
    });

    assert.equal(write.schema, "ContextHandoffLedgerWriteResultV1");
    assert.equal(ledger.schema, "ContextHandoffLedgerV1");
    assert.equal(ledger.totals.entries, 2);
    assert.equal(ledger.totals.verified_handoffs, 2);
    assert.ok(ledger.totals.start_context_saved_tokens > 0);
    assert.ok(ledger.totals.start_context_savings_percent > 0);
    assert.ok(ledger.entries.every((entry) => entry.full_prompt_hash.startsWith("sha256:")));
  });

  it("formats a compact human report", async () => {
    const receipt = await buildContextHandoffReceipt(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });
    const ledger = {
      schema: "ContextHandoffLedgerV1",
      path: null,
      totals: {
        entries: 1,
        verified_handoffs: 1,
        needs_review_handoffs: 0,
        inventory_tokens: receipt.savings.inventory_tokens,
        start_prompt_tokens: receipt.savings.start_prompt_tokens,
        start_context_saved_tokens: receipt.savings.start_context_saved_tokens,
        start_context_savings_percent: receipt.savings.start_context_savings_percent,
        p95_start_prompt_tokens: receipt.savings.start_prompt_tokens,
        p95_saved_tokens: receipt.savings.start_context_saved_tokens,
        on_demand_evidence_count: receipt.quality_contract.on_demand_evidence_count,
        prompt_cache_ready_count: 1,
        prompt_cache_below_threshold_count: 0,
        blocked_handoffs: 0
      },
      entries: [{
        goal: receipt.task_profile.goal,
        gate_status: receipt.gate.status,
        inventory_tokens: receipt.savings.inventory_tokens,
        start_prompt_tokens: receipt.savings.start_prompt_tokens,
        start_context_saved_tokens: receipt.savings.start_context_saved_tokens,
        start_context_savings_percent: receipt.savings.start_context_savings_percent,
        on_demand_evidence_count: receipt.quality_contract.on_demand_evidence_count
      }]
    };
    const report = formatHandoffLedgerReport(ledger);

    assert.match(report, /ContextHandoffLedgerV1/);
    assert.match(report, /Geschätzte Startkontext-Ersparnis/);
    assert.match(report, /Verifizierte Handoffs/);
  });

  it("CLI handoff --ledger and handoff-ledger report work together", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-handoff-cli-ledger-"));
    const ledgerPath = path.join(root, "handoff-ledger.json");
    const handoff = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "handoff",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--expect",
      "compressText",
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

    assert.equal(handoff.status, 0, handoff.stderr);
    const receipt = JSON.parse(handoff.stdout);
    assert.equal(receipt.schema, "ContextHandoffReceiptV1");
    assert.equal(receipt.ledger.schema, "ContextHandoffLedgerWriteResultV1");

    const report = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "handoff-ledger",
      "report",
      ".",
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(report.status, 0, report.stderr);
    const ledger = JSON.parse(report.stdout);
    assert.equal(ledger.schema, "ContextHandoffLedgerV1");
    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.verified_handoffs, 1);
  });
});
