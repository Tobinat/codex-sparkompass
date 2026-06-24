import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildCodexUsageLedgerReport, buildCodexUsageReceipt, compareCodexUsageFiles, compareCodexUsageReceipts, formatCodexUsageComparisonReport, formatCodexUsageLedgerReport, formatCodexUsageReceipt, recordCodexUsageFromJsonl } from "../src/codex-usage.mjs";

const SAMPLE_JSONL = [
  JSON.stringify({ type: "thread.started", thread_id: "thread_1" }),
  JSON.stringify({
    type: "turn.completed",
    thread_id: "thread_1",
    turn_id: "turn_1",
    model: "gpt-5.5",
    usage: {
      input_tokens: 24763,
      cached_input_tokens: 24448,
      output_tokens: 122,
      reasoning_output_tokens: 0
    }
  })
].join("\n");

const COMPACT_JSONL = [
  JSON.stringify({
    type: "turn.completed",
    usage: {
      input_tokens: 12000,
      cached_input_tokens: 6000,
      output_tokens: 80,
      reasoning_output_tokens: 5
    }
  })
].join("\n");

describe("CodexOfficialUsageReceiptV1", () => {
  it("extracts documented turn.completed usage from Codex JSONL", () => {
    const receipt = buildCodexUsageReceipt(SAMPLE_JSONL, {
      sourceFile: "codex-run.jsonl",
      label: "smoke"
    });

    assert.equal(receipt.schema, "CodexOfficialUsageReceiptV1");
    assert.equal(receipt.gate.status, "verified-codex-official-usage");
    assert.equal(receipt.official_usage.totals.events, 1);
    assert.equal(receipt.official_usage.totals.input_tokens, 24763);
    assert.equal(receipt.official_usage.totals.cached_input_tokens, 24448);
    assert.equal(receipt.official_usage.totals.output_tokens, 122);
    assert.equal(receipt.official_usage.totals.total_tokens, 24885);
    assert.equal(receipt.official_usage.totals.cached_input_percent, 99);
    assert.equal(receipt.official_usage.invariants.status, "verified-usage-invariants");
    assert.equal(receipt.official_usage.invariants.verified, true);
    assert.match(formatCodexUsageReceipt(receipt), /verified-codex-official-usage/);
  });

  it("flags JSONL without official usage events for review", () => {
    const receipt = buildCodexUsageReceipt(JSON.stringify({ type: "thread.started" }));

    assert.equal(receipt.gate.status, "codex-usage-needs-review");
    assert.ok(receipt.gate.reasons.includes("no-turn-completed-usage-events"));
  });

  it("compares baseline and optimized official usage receipts", () => {
    const comparison = compareCodexUsageReceipts(
      buildCodexUsageReceipt(SAMPLE_JSONL, { label: "raw" }),
      buildCodexUsageReceipt(COMPACT_JSONL, { label: "compact" })
    );

    assert.equal(comparison.schema, "CodexOfficialUsageComparisonV1");
    assert.equal(comparison.gate.status, "verified-codex-official-usage-comparison");
    assert.equal(comparison.savings.total_saved_tokens, 12805);
    assert.equal(comparison.savings.input_saved_tokens, 12763);
    assert.equal(comparison.savings.output_saved_tokens, 42);
    assert.match(formatCodexUsageComparisonReport(comparison), /Offiziell gemessene Gesamt-Ersparnis/);
  });

  it("treats reasoning output as a sub-bucket of output tokens", () => {
    const receipt = buildCodexUsageReceipt(COMPACT_JSONL, { label: "compact" });

    assert.equal(receipt.official_usage.totals.total_tokens, 12080);
    assert.equal(receipt.official_usage.totals.total_tokens_formula, "input_tokens + output_tokens");
  });

  it("flags impossible usage invariants for review", () => {
    const receipt = buildCodexUsageReceipt(JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 120,
        output_tokens: 10,
        reasoning_output_tokens: 12
      }
    }));

    assert.equal(receipt.gate.status, "codex-usage-needs-review");
    assert.ok(receipt.gate.reasons.includes("cached-input-exceeds-input"));
    assert.ok(receipt.gate.reasons.includes("reasoning-output-exceeds-output"));
    assert.equal(receipt.official_usage.invariants.status, "usage-invariants-need-review");
    assert.ok(receipt.official_usage.invariants.failed_checks.includes("cached_input_tokens_lte_input_tokens"));
  });

  it("flags event-level invariant failures even when totals look valid", () => {
    const receipt = buildCodexUsageReceipt([
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 120,
          output_tokens: 100,
          reasoning_output_tokens: 20
        }
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 0,
          output_tokens: 100,
          reasoning_output_tokens: 0
        }
      })
    ].join("\n"));

    assert.equal(receipt.official_usage.totals.cached_input_tokens, 120);
    assert.equal(receipt.official_usage.totals.input_tokens, 200);
    assert.equal(receipt.gate.status, "codex-usage-needs-review");
    assert.ok(receipt.gate.reasons.includes("usage-event-cached-input-exceeds-input"));
    assert.equal(receipt.official_usage.invariants.failed_checks.includes("event_cached_input_tokens_lte_input_tokens"), true);
  });
});

describe("CodexOfficialUsageLedgerV1", () => {
  it("records official Codex usage receipts and reports totals", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-codex-usage-"));
    const jsonlPath = path.join(root, "codex-run.jsonl");
    const ledgerPath = path.join(root, "codex-usage-ledger.json");
    await fs.writeFile(jsonlPath, SAMPLE_JSONL, "utf8");

    const receipt = await recordCodexUsageFromJsonl(root, {
      file: jsonlPath,
      ledger: ledgerPath,
      label: "sample-run"
    });
    const ledger = await buildCodexUsageLedgerReport(root, {
      ledger: ledgerPath
    });

    assert.equal(receipt.schema, "CodexOfficialUsageReceiptV1");
    assert.equal(receipt.ledger.schema, "CodexOfficialUsageLedgerWriteResultV1");
    assert.equal(ledger.schema, "CodexOfficialUsageLedgerV1");
    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.verified_entries, 1);
    assert.equal(ledger.totals.input_tokens, 24763);
    assert.equal(ledger.totals.cached_input_tokens, 24448);
    assert.match(formatCodexUsageLedgerReport(ledger), /CodexOfficialUsageLedgerV1/);
  });

  it("CLI codex-usage record and report work together", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-cli-codex-usage-"));
    const jsonlPath = path.join(root, "codex-run.jsonl");
    const ledgerPath = path.join(root, "codex-usage-ledger.json");
    await fs.writeFile(jsonlPath, SAMPLE_JSONL, "utf8");

    const record = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "codex-usage",
      "record",
      root,
      "--file",
      jsonlPath,
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(record.status, 0, record.stderr);
    const receipt = JSON.parse(record.stdout);
    assert.equal(receipt.gate.status, "verified-codex-official-usage");

    const report = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "codex-usage",
      "report",
      root,
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(report.status, 0, report.stderr);
    const ledger = JSON.parse(report.stdout);
    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.total_tokens, 24885);
  });

  it("CLI codex-usage compare emits an official usage comparison", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-cli-codex-usage-compare-"));
    const baselinePath = path.join(root, "raw.jsonl");
    const optimizedPath = path.join(root, "compact.jsonl");
    await fs.writeFile(baselinePath, SAMPLE_JSONL, "utf8");
    await fs.writeFile(optimizedPath, COMPACT_JSONL, "utf8");

    const result = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "codex-usage",
      "compare",
      root,
      "--baseline",
      baselinePath,
      "--optimized",
      optimizedPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const comparison = JSON.parse(result.stdout);
    assert.equal(comparison.schema, "CodexOfficialUsageComparisonV1");
    assert.equal(comparison.savings.total_savings_percent, 51);
  });

  it("compares official usage files directly", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-codex-usage-compare-"));
    const baselinePath = path.join(root, "raw.jsonl");
    const optimizedPath = path.join(root, "compact.jsonl");
    await fs.writeFile(baselinePath, SAMPLE_JSONL, "utf8");
    await fs.writeFile(optimizedPath, COMPACT_JSONL, "utf8");

    const comparison = await compareCodexUsageFiles(root, {
      baseline: baselinePath,
      optimized: optimizedPath
    });

    assert.equal(comparison.gate.verified, true);
    assert.equal(comparison.optimized.total_tokens, 12080);
  });
});
