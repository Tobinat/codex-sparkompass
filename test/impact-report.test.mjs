import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSparkompassImpactReport, formatSparkompassImpactReport } from "../src/impact-report.mjs";
import { runPilot } from "../src/pilot-run.mjs";
import { appendTaskOutcomeToLedger } from "../src/task-outcome-ledger.mjs";
import { recordTaskOutcome } from "../src/task-outcome.mjs";

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
    assert.equal(report.quality.quality_gated_pack_saving_entries, 1);
    assert.equal(report.quality.verified_handoffs, 1);
    assert.equal(report.quality.quality_gated_handoff_saving_handoffs, 1);
    assert.equal(report.quality.verified_prompt_preparations, 1);
    assert.equal(report.quality.verified_tasks, 1);
    assert.ok(report.impact.combined_saved_tokens > 0);
    assert.ok(report.impact.quality_gated_combined_saved_tokens > 0);
    assert.ok(report.impact.sendable_prompt_saved_tokens > 0);
    assert.equal(report.ledgers.prompt_preparation.schema, "PromptPreparationLedgerV1");
    assert.ok(report.bars.combined_context_savings.includes("gespart"));
    assert.ok(report.bars.sendable_prompt_savings.includes("gespart"));
  });

  it("blocks impact when handoffs are verified but not saving", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-handoff-zero-savings-"));
    const handoffLedgerPath = path.join(root, "handoff-ledger.json");
    await fs.writeFile(handoffLedgerPath, JSON.stringify({
      entries: [
        buildHandoffEntry({
          gateStatus: "verified-handoff",
          inventoryTokens: 100,
          startPromptTokens: 100
        })
      ]
    }), "utf8");

    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: "missing-savings.json",
      taskOutcomeLedger: "missing-task.json",
      handoffLedger: handoffLedgerPath,
      promptPreparationLedger: "missing-prompt-preparation.json"
    });

    assert.equal(report.gate.status, "impact-needs-review");
    assert.ok(report.gate.blockers.includes("no-quality-gated-handoff-saving-handoffs"));
    assert.equal(report.quality.verified_handoffs, 1);
    assert.equal(report.quality.quality_gated_handoff_saving_handoffs, 0);
    assert.equal(report.impact.start_context_saved_tokens, 0);
    assert.equal(report.impact.quality_gated_start_context_saved_tokens, 0);
    assert.equal(report.impact.verified_combined_saved_tokens, 0);
    assert.match(formatSparkompassImpactReport(report), /Handoffs \(0 sparend\)/);
  });

  it("blocks impact when ContextPacks are verified but not saving", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-pack-zero-savings-"));
    const savingsLedgerPath = path.join(root, "savings-ledger.json");
    await fs.writeFile(savingsLedgerPath, JSON.stringify({
      entries: [
        buildSavingsEntry({
          gateStatus: "verified-publishable",
          originalTokens: 100,
          deliveredTokens: 100
        })
      ]
    }), "utf8");

    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: savingsLedgerPath,
      taskOutcomeLedger: "missing-task.json",
      handoffLedger: "missing-handoff.json",
      promptPreparationLedger: "missing-prompt-preparation.json"
    });

    assert.equal(report.gate.status, "impact-needs-review");
    assert.ok(report.gate.blockers.includes("no-quality-gated-contextpack-saving-entries"));
    assert.equal(report.quality.verified_packs, 1);
    assert.equal(report.quality.quality_gated_pack_saving_entries, 0);
    assert.equal(report.impact.verified_delivered_context_pack_saved_tokens, 0);
    assert.equal(report.impact.quality_gated_delivered_context_pack_saved_tokens, 0);
    assert.equal(report.impact.quality_gated_combined_saved_tokens, 0);
    assert.match(formatSparkompassImpactReport(report), /Packs \(0 sparend\)/);
  });

  it("blocks impact when task output oracles are insensitive", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-task-sensitivity-"));
    const ledgerPath = path.join(root, "task-outcome-ledger.json");
    const outcome = await recordTaskOutcome({
      rootPath: root,
      command: "npm test",
      exitCode: 0,
      outputText: "PASS a\nTASK_OK first\nPASS b\nTASK_OK second\n",
      expectOutputRegex: ["TASK_OK"]
    });

    await appendTaskOutcomeToLedger(root, outcome, {
      out: ledgerPath,
      runType: "impact-test"
    });

    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: "missing-savings.json",
      taskOutcomeLedger: ledgerPath,
      handoffLedger: "missing-handoff.json",
      promptPreparationLedger: "missing-prompt-preparation.json"
    });

    assert.equal(report.gate.status, "impact-needs-review");
    assert.ok(report.gate.blockers.includes("task-output-oracle-sensitivity-failures"));
    assert.equal(report.ledgers.task_outcome.output_oracle_sensitivity_failures, 1);
    assert.equal(report.quality.output_oracle_sensitivity_failures, 1);
  });

  it("reports quality-gated savings separately from gross ledger savings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-verified-savings-"));
    const savingsLedgerPath = path.join(root, "savings-ledger.json");
    await fs.writeFile(savingsLedgerPath, JSON.stringify({
      entries: [
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
      ]
    }), "utf8");

    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: savingsLedgerPath,
      taskOutcomeLedger: "missing-task.json",
      handoffLedger: "missing-handoff.json",
      promptPreparationLedger: "missing-prompt-preparation.json"
    });

    assert.equal(report.gate.status, "impact-needs-review");
    assert.ok(report.gate.blockers.includes("savings-review-required"));
    assert.equal(report.impact.delivered_context_pack_saved_tokens, 150);
    assert.equal(report.impact.delivered_context_pack_savings_percent, 75);
    assert.equal(report.impact.verified_delivered_context_pack_saved_tokens, 60);
    assert.equal(report.impact.verified_delivered_context_pack_savings_percent, 60);
    assert.equal(report.impact.quality_gated_delivered_context_pack_saved_tokens, 60);
    assert.equal(report.impact.quality_gated_delivered_context_pack_savings_percent, 60);
    assert.equal(report.impact.verified_combined_saved_tokens, 60);
    assert.equal(report.impact.quality_gated_combined_saved_tokens, 60);
    assert.match(formatSparkompassImpactReport(report), /Qualitätsgegatede positive Kontext-Ersparnis/);
  });

  it("treats verified expanded ContextPacks as quality-gated impact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-expanded-savings-"));
    const savingsLedgerPath = path.join(root, "savings-ledger.json");
    await fs.writeFile(savingsLedgerPath, JSON.stringify({
      entries: [
        buildSavingsEntry({
          gateStatus: "verified-expanded-context",
          originalTokens: 100,
          deliveredTokens: 55,
          fallbackUsed: true,
          fallbackMode: "expanded-context"
        })
      ]
    }), "utf8");

    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: savingsLedgerPath,
      taskOutcomeLedger: "missing-task.json",
      handoffLedger: "missing-handoff.json",
      promptPreparationLedger: "missing-prompt-preparation.json"
    });

    assert.equal(report.gate.status, "verified-impact");
    assert.equal(report.quality.verified_packs, 1);
    assert.equal(report.quality.quality_gated_pack_saving_entries, 1);
    assert.equal(report.quality.review_packs, 0);
    assert.ok(!report.gate.blockers.includes("savings-review-required"));
    assert.equal(report.impact.verified_delivered_context_pack_saved_tokens, 45);
    assert.equal(report.impact.verified_delivered_context_pack_savings_percent, 45);
  });

  it("does not count prompt full-context fallbacks as quality-gated prompt savings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-prompt-full-fallback-"));
    const promptLedgerPath = path.join(root, "prompt-preparation-ledger.json");
    await fs.writeFile(promptLedgerPath, JSON.stringify({
      entries: [
        buildPromptPrepEntry({
          gateStatus: "verified-compact-prompt",
          inputTokens: 100,
          sendableTokens: 50
        }),
        buildPromptPrepEntry({
          gateStatus: "verified-full-context-fallback",
          inputTokens: 100,
          sendableTokens: 100,
          fallbackUsed: true,
          fallbackMode: "full-context"
        })
      ]
    }), "utf8");

    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: "missing-savings.json",
      taskOutcomeLedger: "missing-task.json",
      handoffLedger: "missing-handoff.json",
      promptPreparationLedger: promptLedgerPath
    });

    assert.equal(report.gate.status, "impact-needs-review");
    assert.ok(report.gate.blockers.includes("prompt-preparation-full-context-fallbacks-present"));
    assert.equal(report.quality.verified_prompt_preparations, 2);
    assert.equal(report.quality.quality_gated_prompt_saving_preparations, 1);
    assert.equal(report.impact.sendable_prompt_saved_tokens, 50);
    assert.equal(report.impact.sendable_prompt_savings_percent, 25);
    assert.equal(report.impact.verified_sendable_prompt_saved_tokens, 50);
    assert.equal(report.impact.verified_sendable_prompt_savings_percent, 50);
    assert.match(formatSparkompassImpactReport(report), /Prompts \(1 sparend\)/);
  });

  it("blocks impact when prompt preparations are verified but not saving", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-impact-prompt-zero-savings-"));
    const promptLedgerPath = path.join(root, "prompt-preparation-ledger.json");
    await fs.writeFile(promptLedgerPath, JSON.stringify({
      entries: [
        buildPromptPrepEntry({
          gateStatus: "verified-compact-prompt",
          inputTokens: 100,
          sendableTokens: 100
        })
      ]
    }), "utf8");

    const report = await buildSparkompassImpactReport(root, {
      savingsLedger: "missing-savings.json",
      taskOutcomeLedger: "missing-task.json",
      handoffLedger: "missing-handoff.json",
      promptPreparationLedger: promptLedgerPath
    });

    assert.equal(report.gate.status, "impact-needs-review");
    assert.ok(report.gate.blockers.includes("no-quality-gated-prompt-saving-preparations"));
    assert.equal(report.quality.verified_prompt_preparations, 1);
    assert.equal(report.quality.quality_gated_prompt_saving_preparations, 0);
    assert.equal(report.impact.sendable_prompt_saved_tokens, 0);
    assert.equal(report.impact.verified_sendable_prompt_saved_tokens, 0);
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

function buildHandoffEntry({
  gateStatus,
  inventoryTokens,
  startPromptTokens
}) {
  const savedTokens = Math.max(0, inventoryTokens - startPromptTokens);
  const savingsPercent = inventoryTokens ? Math.round((savedTokens / inventoryTokens) * 100) : 0;

  return {
    schema: "ContextHandoffLedgerEntryV1",
    entry_id: `${gateStatus}-${inventoryTokens}-${startPromptTokens}`,
    goal: gateStatus,
    gate_status: gateStatus,
    blocking_warnings: gateStatus === "verified-handoff" ? [] : ["review-required"],
    inventory_tokens: inventoryTokens,
    start_prompt_tokens: startPromptTokens,
    start_context_saved_tokens: savedTokens,
    start_context_savings_percent: savingsPercent,
    on_demand_evidence_count: 0,
    prompt_cache_status: "prefix-below-estimated-threshold"
  };
}

function buildPromptPrepEntry({
  gateStatus,
  inputTokens,
  sendableTokens,
  fallbackUsed = false,
  fallbackMode = "compact-context"
}) {
  const savedTokens = Math.max(0, inputTokens - sendableTokens);
  const savingsPercent = inputTokens ? Math.round((savedTokens / inputTokens) * 100) : 0;

  return {
    schema: "PromptPreparationLedgerEntryV1",
    entry_id: `${gateStatus}-${inputTokens}-${sendableTokens}`,
    label: gateStatus,
    gate_status: gateStatus,
    gate_verified: true,
    gate_reasons: [],
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
