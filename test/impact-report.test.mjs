import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSparkompassImpactReport, formatSparkompassImpactReport } from "../src/impact-report.mjs";
import { runPilot } from "../src/pilot-run.mjs";

describe("SparkompassImpactReportV1", () => {
  it("reports empty ledgers without claiming verified impact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-empty-"));
    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: "missing-savings.json",
      taskOutcomeLedger: "missing-task.json",
      handoffLedger: "missing-handoff.json",
      promptPreparationLedger: "missing-prompt-preparation.json"
    });

    assert.equal(report.schema, "SparkompassImpactReportV1");
    assert.equal(report.gate.status, "impact-ledger-empty");
    assert.equal(report.gate.verified, false);
    assert.equal(report.impact.combined_savings_percent, 0);
    assert.equal(report.impact.sendable_prompt_savings_percent, 0);
    assert.ok(report.gate.warnings.includes("no-prompt-preparation-ledger-entries"));
    assert.match(formatSparkompassImpactReport(report), /impact-ledger-empty/);
  });

  it("combines pilot ledgers into a verified impact report", async () => {
    const ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-pilot-"));
    const pilot = await runPilot(".", {
      ledgerDir,
      maxPackFiles: 1
    });
    const report = await buildSparkompassImpactReport(".", {
      savingsLedger: pilot.ledger_paths.savings,
      taskOutcomeLedger: pilot.ledger_paths.taskOutcome,
      handoffLedger: pilot.ledger_paths.handoff,
      promptPreparationLedger: pilot.ledger_paths.promptPreparation
    });

    assert.equal(report.gate.status, "verified-impact");
    assert.equal(report.quality.verified_packs, 1);
    assert.equal(report.quality.verified_handoffs, 1);
    assert.equal(report.quality.verified_prompt_preparations, 1);
    assert.equal(report.quality.verified_tasks, 1);
    assert.ok(report.impact.combined_saved_tokens > 0);
    assert.ok(report.impact.sendable_prompt_saved_tokens > 0);
    assert.equal(report.ledgers.prompt_preparation.schema, "PromptPreparationLedgerV1");
    assert.ok(report.bars.combined_context_savings.includes("gespart"));
    assert.ok(report.bars.sendable_prompt_savings.includes("gespart"));
  });

  it("CLI impact emits JSON and a human report", async () => {
    const ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-cli-"));
    const pilot = await runPilot(".", {
      ledgerDir,
      maxPackFiles: 1
    });
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "impact",
      ".",
      "--savings-ledger",
      pilot.ledger_paths.savings,
      "--task-outcome-ledger",
      pilot.ledger_paths.taskOutcome,
      "--handoff-ledger",
      pilot.ledger_paths.handoff,
      "--prompt-preparation-ledger",
      pilot.ledger_paths.promptPreparation,
      "--json"
    ], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024
    });

    assert.equal(json.status, 0, json.stderr);
    const payload = JSON.parse(json.stdout);
    assert.equal(payload.schema, "SparkompassImpactReportV1");
    assert.equal(payload.gate.status, "verified-impact");
    assert.equal(payload.quality.verified_prompt_preparations, 1);

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "impact",
      ".",
      "--savings-ledger",
      pilot.ledger_paths.savings,
      "--task-outcome-ledger",
      pilot.ledger_paths.taskOutcome,
      "--handoff-ledger",
      pilot.ledger_paths.handoff,
      "--prompt-preparation-ledger",
      pilot.ledger_paths.promptPreparation
    ], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /SparkompassImpactReportV1/);
    assert.match(human.stdout, /Kombinierte Kontext-Ersparnis/);
    assert.match(human.stdout, /Sendbare Prompt-Ersparnis/);
  });
});
