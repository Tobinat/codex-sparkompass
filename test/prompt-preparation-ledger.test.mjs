import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildPromptPreparation } from "../src/prompt-prepare.mjs";
import { appendPromptPreparationToLedger, buildPromptPreparationLedgerReport, formatPromptPreparationLedgerReport } from "../src/prompt-preparation-ledger.mjs";

describe("PromptPreparationLedgerV1", () => {
  it("records sendable prompt savings across prompt preparations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-prompt-prep-ledger-"));
    const ledgerPath = path.join(root, "prompt-preparation-ledger.json");
    const first = buildPromptPreparation(buildLargePrompt("AUTH_RESET_TOKEN_EXPIRED"), {
      goal: "Auth-Reset reparieren",
      keep: ["AUTH_RESET_TOKEN_EXPIRED"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const second = buildPromptPreparation(buildLargePrompt("PAYMENT_RETRY_BACKOFF"), {
      goal: "Payment-Retry reparieren",
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
    assert.ok(ledger.entries.every((entry) => entry.sendable_prompt_hash.startsWith("sha256:")));
    assert.match(formatPromptPreparationLedgerReport(ledger), /Sendbarer Prompt/);
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
});

function buildLargePrompt(anchor) {
  return [
    "# Ziel",
    `Bitte behebe ${anchor} in src/auth/session.mjs.`,
    "Done when: npm test ist grün und der relevante Test bleibt stabil.",
    ...Array.from({ length: 80 }, (_, index) => `Hintergrundnotiz ${index}: allgemeiner Verlauf ohne neue Entscheidung.`)
  ].join("\n");
}
