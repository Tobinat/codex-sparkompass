import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildPromptPreparation } from "../src/prompt-prepare.mjs";
import { appendPromptPreparationToLedger, buildPromptPreparationLedger, buildPromptPreparationLedgerReport, formatPromptPreparationLedgerReport } from "../src/prompt-preparation-ledger.mjs";

describe("PromptPreparationLedgerV1", () => {
  it("records sendable prompt savings across prompt preparations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-prompt-prep-ledger-"));
    const ledgerPath = path.join(root, "prompt-preparation-ledger.json");
    const first = buildPromptPreparation(buildLargePrompt("AUTH_RESET_TOKEN_EXPIRED"), {
      goal: "Auth-Reset reparieren",
      autoTarget: true,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const second = buildPromptPreparation(buildLargePrompt("PAYMENT_RETRY_BACKOFF"), {
      goal: "Payment-Retry reparieren",
      autoTarget: true,
      keep: ["PAYMENT_RETRY_BACKOFF"],
      expect: ["PAYMENT_RETRY_BACKOFF"]
    });

    await appendPromptPreparationToLedger(root, first, {
      out: ledgerPath,
      runType: "test"
    });
    const write = await appendPromptPreparationToLedger(root, second, {
      out: ledgerPath,
      runType: "test"
    });
    const ledger = await buildPromptPreparationLedgerReport(root, {
      ledger: ledgerPath
    });

    assert.equal(write.schema, "PromptPreparationLedgerWriteResultV1");
    assert.equal(ledger.schema, "PromptPreparationLedgerV1");
    assert.equal(ledger.totals.entries, 2);
    assert.equal(ledger.totals.verified_preparations, 2);
    assert.ok(ledger.totals.sendable_prompt_saved_tokens > 0);
    assert.ok(ledger.totals.sendable_prompt_savings_percent > 0);
    assert.equal(ledger.totals.auto_target_entries, 2);
    assert.equal(ledger.totals.verified_auto_target_entries, 2);
    assert.equal(ledger.totals.verified_auto_target_oracle_entries, 2);
    assert.equal(ledger.totals.auto_target_oracle_gate_failures, 0);
    assert.ok(ledger.totals.auto_target_additional_saved_tokens > 0);
    assert.ok(ledger.entries.every((entry) => entry.auto_target_oracle_gate === "verified-oracle"));
    assert.ok(ledger.entries.every((entry) => entry.auto_target_explicit_oracle_present === true));
    assert.ok(ledger.entries.every((entry) => entry.auto_target_savings_gate === "verified-additional-saving"));
    assert.ok(ledger.entries.every((entry) => entry.sendable_prompt_hash.startsWith("sha256:")));
    assert.match(formatPromptPreparationLedgerReport(ledger), /Sendbarer Prompt/);
    assert.match(formatPromptPreparationLedgerReport(ledger), /Auto-Target/);
  });

  it("CLI prompt-prepare --ledger and prompt-ledger report work together", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-prompt-prep-ledger-cli-"));
    const ledgerPath = path.join(root, "prompt-preparation-ledger.json");
    const prepare = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "prompt-prepare",
      "--text",
      buildLargePrompt("AUTH_RESET_TOKEN_EXPIRED"),
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(prepare.status, 0, prepare.stderr);
    const preparation = JSON.parse(prepare.stdout);
    assert.equal(preparation.schema, "SparkompassPromptPreparationV1");
    assert.equal(preparation.ledger.schema, "PromptPreparationLedgerWriteResultV1");
    assert.equal(preparation.ledger.path, ledgerPath);

    const report = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "prompt-ledger",
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
    assert.equal(ledger.schema, "PromptPreparationLedgerV1");
    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.verified_preparations, 1);
  });

  it("separates gross sendable savings from quality-gated sendable savings", () => {
    const ledger = buildPromptPreparationLedger([
      buildPromptPrepEntry({
        verified: true,
        inputTokens: 100,
        sendableTokens: 50
      }),
      buildPromptPrepEntry({
        verified: false,
        inputTokens: 100,
        sendableTokens: 20
      })
    ]);

    assert.equal(ledger.totals.entries, 2);
    assert.equal(ledger.totals.verified_preparations, 1);
    assert.equal(ledger.totals.needs_review_preparations, 1);
    assert.equal(ledger.totals.sendable_prompt_saved_tokens, 130);
    assert.equal(ledger.totals.sendable_prompt_savings_percent, 65);
    assert.equal(ledger.totals.verified_sendable_prompt_saved_tokens, 50);
    assert.equal(ledger.totals.verified_sendable_prompt_savings_percent, 50);
    assert.match(formatPromptPreparationLedgerReport(ledger), /Qualitätsgegateder sendbarer Prompt/);
  });

  it("keeps full-context fallbacks verified but out of quality-gated prompt savings", () => {
    const ledger = buildPromptPreparationLedger([
      buildPromptPrepEntry({
        verified: true,
        inputTokens: 100,
        sendableTokens: 50,
        gateStatus: "verified-compact-prompt"
      }),
      buildPromptPrepEntry({
        verified: true,
        inputTokens: 100,
        sendableTokens: 100,
        gateStatus: "verified-full-context-fallback",
        fallbackUsed: true,
        fallbackMode: "full-context"
      })
    ]);

    assert.equal(ledger.totals.entries, 2);
    assert.equal(ledger.totals.verified_preparations, 2);
    assert.equal(ledger.totals.quality_gated_prompt_saving_preparations, 1);
    assert.equal(ledger.totals.full_context_fallbacks, 1);
    assert.equal(ledger.totals.sendable_prompt_saved_tokens, 50);
    assert.equal(ledger.totals.sendable_prompt_savings_percent, 25);
    assert.equal(ledger.totals.verified_input_tokens, 100);
    assert.equal(ledger.totals.verified_sendable_prompt_tokens, 50);
    assert.equal(ledger.totals.verified_sendable_prompt_saved_tokens, 50);
    assert.equal(ledger.totals.verified_sendable_prompt_savings_percent, 50);
    assert.match(formatPromptPreparationLedgerReport(ledger), /Qualitätsgegatede sparende Vorbereitungen: 1/);
  });

  it("does not count zero-savings verified prompt preparations as quality-gated prompt savings", () => {
    const ledger = buildPromptPreparationLedger([
      buildPromptPrepEntry({
        verified: true,
        inputTokens: 100,
        sendableTokens: 100,
        gateStatus: "verified-compact-prompt"
      })
    ]);

    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.verified_preparations, 1);
    assert.equal(ledger.totals.quality_gated_prompt_saving_preparations, 0);
    assert.equal(ledger.totals.needs_review_preparations, 0);
    assert.equal(ledger.totals.sendable_prompt_saved_tokens, 0);
    assert.equal(ledger.totals.verified_input_tokens, 0);
    assert.equal(ledger.totals.verified_sendable_prompt_tokens, 0);
    assert.equal(ledger.totals.verified_sendable_prompt_saved_tokens, 0);
    assert.equal(ledger.totals.verified_sendable_prompt_savings_percent, 0);
  });
});

function buildLargePrompt(anchor) {
  return [
    "# Ziel",
    `Bitte behebe ${anchor} in src/auth/session.mjs.`,
    "Done when: npm test ist grün und der relevante Test bleibt stabil.",
    ...Array.from({ length: 80 }, (_, index) => `Hintergrundnotiz ${index}: allgemeiner Verlauf ohne neue Entscheidung.`)
  ].join("\n");
}

function buildPromptPrepEntry({
  verified,
  inputTokens,
  sendableTokens,
  gateStatus,
  fallbackUsed = false,
  fallbackMode = "compact-context"
}) {
  const savedTokens = Math.max(0, inputTokens - sendableTokens);
  const savingsPercent = inputTokens ? Math.round((savedTokens / inputTokens) * 100) : 0;

  return {
    schema: "PromptPreparationLedgerEntryV1",
    entry_id: `${verified}-${inputTokens}-${sendableTokens}-${fallbackMode}`,
    label: verified ? "verified" : "review",
    gate_status: gateStatus || (verified ? "verified-compact-prompt" : "prompt-preparation-needs-review"),
    gate_verified: verified,
    gate_reasons: verified ? [] : ["prompt-preparation-needs-review"],
    fallback_used: fallbackUsed,
    fallback_mode: fallbackMode,
    input_tokens: inputTokens,
    delivered_context_tokens: sendableTokens,
    sendable_prompt_tokens: sendableTokens,
    delivered_context_saved_tokens: savedTokens,
    delivered_context_savings_percent: savingsPercent,
    sendable_prompt_saved_tokens: savedTokens,
    sendable_prompt_savings_percent: savingsPercent,
    critical_anchor_retention_percent: 100,
    source_evidence_coverage_percent: 100
  };
}
