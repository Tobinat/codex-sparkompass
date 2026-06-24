import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { formatPilotRunReport, runPilot } from "../src/pilot-run.mjs";

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
    assert.equal(pilot.metrics.verified_tasks, 1);
    assert.equal(pilot.metrics.verified_handoffs, 1);
    assert.equal(pilot.metrics.verified_envelopes, 1);
    assert.equal(pilot.metrics.verified_prompt_preparations, 1);
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
    assert.equal(payload.metrics.verified_prompt_preparations, 1);

    const ledgerFiles = await fs.readdir(ledgerDir);
    assert.ok(ledgerFiles.includes("savings-ledger.json"));
    assert.ok(ledgerFiles.includes("task-outcome-ledger.json"));
    assert.ok(ledgerFiles.includes("envelope-ledger.json"));
    assert.ok(ledgerFiles.includes("handoff-ledger.json"));
    assert.ok(ledgerFiles.includes("prompt-preparation-ledger.json"));
  });
});
