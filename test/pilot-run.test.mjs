import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildPilotGate, formatPilotRunReport, runPilot } from "../src/pilot-run.mjs";

describe("SparkompassPilotRunV1", () => {
  it("records a verified pilot run across savings, prompt, task, envelope, and handoff ledgers", async () => {
    const ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-pilot-run-"));
    const pilot = await runPilot(".", {
      ledgerDir,
      targetPercent: 35,
      minSaving: 35,
      minAnchors: 75
    });

    assert.equal(pilot.schema, "SparkompassPilotRunV1");
    assert.equal(pilot.gate.status, "verified-pilot-run");
    assert.deepEqual(pilot.gate.blockers, []);
    assert.equal(pilot.metrics.savings_entries, 3);
    assert.equal(pilot.metrics.verified_savings_entries, 3);
    assert.equal(pilot.metrics.quality_gated_saving_entries, 3);
    assert.ok(pilot.metrics.quality_gated_delivered_saved_tokens > 0);
    assert.equal(pilot.metrics.verified_tasks, 1);
    assert.equal(pilot.metrics.verified_handoffs, 1);
    assert.equal(pilot.metrics.quality_gated_handoff_saving_handoffs, 1);
    assert.ok(pilot.metrics.quality_gated_start_context_saved_tokens > 0);
    assert.equal(pilot.metrics.verified_envelopes, 1);
    assert.equal(pilot.metrics.verified_prompt_preparations, 1);
    assert.equal(pilot.metrics.quality_gated_prompt_saving_preparations, 1);
    assert.ok(pilot.metrics.verified_sendable_prompt_saved_tokens > 0);
    assert.ok(pilot.metrics.verified_auto_target_packs > 0);
    assert.equal(pilot.metrics.prompt_preparation_auto_target_status, "verified-auto-target");
    assert.equal(pilot.metrics.prompt_preparation_auto_target_oracle_gate, "verified-oracle");
    assert.ok(pilot.metrics.auto_target_additional_saved_tokens > 0);
    assert.equal(pilot.artifacts.auto_target.prompt_preparation_verified, true);
    assert.equal(pilot.artifacts.auto_target.prompt_preparation_oracle_gate, "verified-oracle");
    assert.ok(pilot.artifacts.auto_target.verified_pack_auto_target_oracle_count > 0);
    assert.ok(pilot.artifacts.auto_target.total_additional_saved_tokens > 0);
    assert.ok(pilot.metrics.sendable_prompt_saved_tokens > 0);
    assert.ok(pilot.metrics.context_tokens_per_verified_task > 0);
    assert.match(pilot.ledger_paths.savings, /savings-ledger\.json$/);
    assert.match(pilot.ledger_paths.promptPreparation, /prompt-preparation-ledger\.json$/);
    assert.equal(pilot.artifacts.task_outcome.context_pack.receipt_verification.verified, true);

    const report = formatPilotRunReport(pilot);
    assert.match(report, /SparkompassPilotRunV1/);
    assert.match(report, /Gate: verified-pilot-run/);
    assert.match(report, /TaskOutcomeLedger/);
    assert.match(report, /PromptPreparationLedger/);
    assert.match(report, /1 sparend/);
    assert.match(report, /Auto-Target/);
  });

  it("CLI pilot emits JSON and writes ledgers to the requested directory", async () => {
    const ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-pilot-cli-"));
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "pilot",
      ".",
      "--ledger-dir",
      ledgerDir,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "SparkompassPilotRunV1");
    assert.equal(payload.gate.status, "verified-pilot-run");
    assert.equal(payload.metrics.verified_tasks, 1);
    assert.ok(payload.metrics.quality_gated_saving_entries > 0);
    assert.equal(payload.metrics.quality_gated_handoff_saving_handoffs, 1);
    assert.equal(payload.metrics.verified_prompt_preparations, 1);
    assert.equal(payload.metrics.quality_gated_prompt_saving_preparations, 1);
    assert.equal(payload.metrics.prompt_preparation_auto_target_status, "verified-auto-target");
    assert.equal(payload.metrics.prompt_preparation_auto_target_oracle_gate, "verified-oracle");
    assert.ok(payload.metrics.auto_target_additional_saved_tokens > 0);

    const ledgerFiles = await fs.readdir(ledgerDir);
    assert.ok(ledgerFiles.includes("savings-ledger.json"));
    assert.ok(ledgerFiles.includes("task-outcome-ledger.json"));
    assert.ok(ledgerFiles.includes("envelope-ledger.json"));
    assert.ok(ledgerFiles.includes("handoff-ledger.json"));
    assert.ok(ledgerFiles.includes("prompt-preparation-ledger.json"));
  });

  it("blocks verified pilot status when prompt preparation is safe but not saving", () => {
    const gateInput = buildVerifiedPilotGateInput();
    gateInput.ledgers.prompt_preparation.totals.quality_gated_prompt_saving_preparations = 0;

    const gate = buildPilotGate(gateInput);

    assert.equal(gate.status, "pilot-needs-review");
    assert.equal(gate.verified, false);
    assert.ok(gate.blockers.includes("no-quality-gated-prompt-saving-preparation"));
  });

  it("blocks verified pilot status when handoff is safe but not saving", () => {
    const gateInput = buildVerifiedPilotGateInput();
    gateInput.ledgers.handoff.totals.quality_gated_handoff_saving_handoffs = 0;

    const gate = buildPilotGate(gateInput);

    assert.equal(gate.status, "pilot-needs-review");
    assert.equal(gate.verified, false);
    assert.ok(gate.blockers.includes("no-quality-gated-handoff-saving"));
  });

  it("blocks verified pilot status when ContextPacks are safe but not saving", () => {
    const gateInput = buildVerifiedPilotGateInput();
    gateInput.ledgers.savings.totals.quality_gated_saving_entries = 0;

    const gate = buildPilotGate(gateInput);

    assert.equal(gate.status, "pilot-needs-review");
    assert.equal(gate.verified, false);
    assert.ok(gate.blockers.includes("no-quality-gated-savings-ledger-entry"));
  });
});

function buildVerifiedPilotGateInput() {
  return {
    dogfood: {
      gate: {
        publishable: true
      }
    },
    benchmark: {
      totals: {
        verified: true
      }
    },
    ledgers: {
      savings: {
        totals: {
          verified_entries: 1,
          quality_gated_saving_entries: 1
        }
      },
      task_outcome: {
        totals: {
          verified_tasks: 1
        }
      },
      envelope: {
        totals: {
          verified_envelopes: 1
        }
      },
      handoff: {
        totals: {
          verified_handoffs: 1,
          quality_gated_handoff_saving_handoffs: 1
        }
      },
      prompt_preparation: {
        totals: {
          verified_preparations: 1,
          quality_gated_prompt_saving_preparations: 1
        }
      }
    },
    scorecard: {
      release_readiness: {
        verified: true
      }
    },
    autoTargetEvidence: {
      prompt_preparation_verified: true
    }
  };
}
