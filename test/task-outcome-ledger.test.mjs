import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { appendTaskOutcomeToLedger, buildTaskOutcomeLedgerReport, formatTaskOutcomeLedgerReport } from "../src/task-outcome-ledger.mjs";
import { recordTaskOutcome } from "../src/task-outcome.mjs";

describe("TaskOutcomeLedgerV1", () => {
  it("records verified and review task outcomes with token-per-task metrics", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-task-ledger-"));
    const ledgerPath = path.join(root, "task-outcome-ledger.json");
    const verified = await recordTaskOutcome({
      rootPath: root,
      command: "npm test",
      exitCode: 0,
      outputText: "PASS\nTASK_OK\n",
      expectOutput: ["TASK_OK"]
    });
    const review = await recordTaskOutcome({
      rootPath: root,
      command: "npm test",
      exitCode: 1,
      outputText: "FAIL\n",
      expectOutput: ["TASK_OK"]
    });

    const write = await appendTaskOutcomeToLedger(root, verified, {
      out: ledgerPath,
      runType: "test"
    });
    await appendTaskOutcomeToLedger(root, review, {
      out: ledgerPath,
      runType: "test"
    });
    const ledger = await buildTaskOutcomeLedgerReport(root, {
      ledger: ledgerPath
    });

    assert.equal(write.schema, "TaskOutcomeLedgerWriteResultV1");
    assert.equal(ledger.schema, "TaskOutcomeLedgerV1");
    assert.equal(ledger.totals.entries, 2);
    assert.equal(ledger.totals.verified_tasks, 1);
    assert.equal(ledger.totals.needs_review_tasks, 1);
    assert.equal(ledger.totals.verification_rate_percent, 50);
    assert.equal(ledger.totals.review_rate_percent, 50);
    assert.equal(ledger.totals.failed_exit_tasks, 1);
    assert.equal(ledger.totals.output_oracle_failures, 1);
    assert.ok(ledger.totals.output_tokens_per_verified_task > 0);
    assert.ok(ledger.totals.p95_duration_ms >= 0);
    assert.deepEqual(ledger.totals.review_reasons, [
      { reason: "exit-code-mismatch:1!=0", count: 1 },
      { reason: "output-oracle-missing:TASK_OK", count: 1 }
    ]);
  });

  it("formats an empty and non-empty task outcome ledger report", async () => {
    const outcome = await recordTaskOutcome({
      command: "npm test",
      exitCode: 0,
      outputText: "TASK_OK\n",
      expectOutput: ["TASK_OK"]
    });
    const report = formatTaskOutcomeLedgerReport({
      schema: "TaskOutcomeLedgerV1",
      path: "task-ledger.json",
      totals: {
        entries: 1,
        verified_tasks: 1,
        needs_review_tasks: 0,
        verification_rate_percent: 100,
        review_rate_percent: 0,
        failed_exit_tasks: 0,
        output_oracle_failures: 0,
        receipt_verification_failures: 0,
        timed_out_tasks: 0,
        linked_context_packs: 0,
        output_tokens_per_verified_task: outcome.result.combined.estimated_tokens,
        context_tokens_per_verified_task: 0,
        p95_output_tokens: outcome.result.combined.estimated_tokens,
        p95_context_pack_delivered_tokens: 0,
        average_duration_ms: 0,
        p95_duration_ms: 0,
        review_reasons: []
      },
      entries: [{
        command_text: "npm test",
        gate_status: "verified-task-outcome",
        exit_code: 0,
        expected_exit_code: 0,
        output_tokens: outcome.result.combined.estimated_tokens
      }]
    });

    assert.match(report, /TaskOutcomeLedgerV1/);
    assert.match(report, /Verifizierte Tasks: 1/);
    assert.match(report, /Verifikationsrate: 100%/);
    assert.match(report, /Output-Tokens pro verifiziertem Task/);
    assert.match(report, /Review-Gründe: keine/);
  });

  it("CLI task --ledger and task-ledger report work together", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-cli-task-ledger-"));
    const ledgerPath = path.join(root, "task-outcome-ledger.json");
    const run = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "task",
      "record",
      root,
      "--command",
      "npm test",
      "--exit-code",
      "0",
      "--output-text",
      "TASK_OK",
      "--expect-output",
      "TASK_OK",
      "--ledger",
      ledgerPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(run.status, 0, run.stderr);
    const outcome = JSON.parse(run.stdout);
    assert.equal(outcome.schema, "TaskOutcomeReceiptV1");
    assert.equal(outcome.ledger.schema, "TaskOutcomeLedgerWriteResultV1");

    const report = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "task-ledger",
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
    assert.equal(ledger.schema, "TaskOutcomeLedgerV1");
    assert.equal(ledger.totals.entries, 1);
    assert.equal(ledger.totals.verified_tasks, 1);
  });
});
