import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildContextPack } from "../src/context-pack.mjs";
import { formatTaskOutcomeReport, recordTaskOutcome, runTaskOutcome } from "../src/task-outcome.mjs";

describe("TaskOutcomeReceiptV1", () => {
  it("records a successful task output with an output oracle", async () => {
    const outcome = await recordTaskOutcome({
      command: "npm test",
      exitCode: 0,
      outputText: "tests passed\nTASK_OK\n",
      expectOutput: ["TASK_OK"]
    });

    assert.equal(outcome.schema, "TaskOutcomeReceiptV1");
    assert.equal(outcome.gate.status, "verified-task-outcome");
    assert.equal(outcome.output_oracle.result.success, true);
    assert.equal(outcome.output_oracle.sensitivity.success, true);
    assert.equal(outcome.gate.requirements.output_oracle_sensitivity_success, true);
    assert.equal(outcome.result.exit_code, 0);
    assert.equal(outcome.output_oracle.result.matched_count, 1);
  });

  it("links task success to a verified ContextPack receipt", async () => {
    const source = [
      "AUTH_RESET_TOKEN_EXPIRED",
      "Done when: Auth reset test passes",
      "src/auth/session.ts:42"
    ].join("\n");
    const pack = buildContextPack(source, {
      label: "auth-reset.txt",
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["src/auth/.+\\.ts"]
    });
    const outcome = await recordTaskOutcome({
      command: "npm test",
      exitCode: 0,
      outputText: "PASS auth reset\nTASK_OK\n",
      expectOutput: ["TASK_OK"],
      receipt: pack,
      sourceText: source,
      contextText: pack.context.text
    });

    assert.equal(outcome.gate.verified, true);
    assert.equal(outcome.context_pack.context_pack_id, pack.contextPackId);
    assert.equal(outcome.context_pack.receipt_verification.status, "verified-receipt");
  });

  it("flags missing output expectations as a task outcome review", async () => {
    const outcome = await recordTaskOutcome({
      command: "npm test",
      exitCode: 0,
      outputText: "tests passed\n",
      expectOutput: ["TASK_OK"]
    });

    assert.equal(outcome.gate.status, "task-outcome-needs-review");
    assert.ok(outcome.gate.reasons.includes("output-oracle-missing:TASK_OK"));
  });

  it("flags broad output regex oracles as insensitive", async () => {
    const outcome = await recordTaskOutcome({
      command: "npm test",
      exitCode: 0,
      outputText: "PASS suite-a\nTASK_OK first\nPASS suite-b\nTASK_OK second\n",
      expectOutputRegex: ["TASK_OK"]
    });

    assert.equal(outcome.output_oracle.result.success, true);
    assert.equal(outcome.output_oracle.sensitivity.success, false);
    assert.deepEqual(outcome.output_oracle.sensitivity.missed, ["/TASK_OK/"]);
    assert.equal(outcome.gate.status, "task-outcome-needs-review");
    assert.ok(outcome.gate.reasons.includes("output-oracle-insensitive:/TASK_OK/"));
    assert.equal(outcome.gate.requirements.output_oracle_sensitivity_success, false);
    assert.match(formatTaskOutcomeReport(outcome), /nicht sensitiv: \/TASK_OK\//);
  });

  it("runs a local command and captures a verified outcome", async () => {
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify("console.log('TASK_OK')")}`;
    const outcome = await runTaskOutcome({
      command,
      expectOutput: ["TASK_OK"],
      timeoutMs: 5000
    });

    assert.equal(outcome.gate.status, "verified-task-outcome");
    assert.equal(outcome.result.exit_code, 0);
    assert.equal(outcome.output_oracle.result.success, true);
    assert.equal(outcome.output_oracle.sensitivity.success, true);
  });

  it("CLI task run emits JSON and exits successfully", () => {
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify("console.log('CLI_TASK_OK')")}`;
    const result = spawnSync(process.execPath, [
      "bin/codex-sparkompass.mjs",
      "task",
      "run",
      ".",
      "--command",
      command,
      "--expect-output",
      "CLI_TASK_OK",
      "--json"
    ], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "TaskOutcomeReceiptV1");
    assert.equal(payload.gate.status, "verified-task-outcome");
  });
});
