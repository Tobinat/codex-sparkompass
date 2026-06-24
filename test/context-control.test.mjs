import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextControlReport } from "../src/context-control.mjs";

describe("ContextControlReportV1", () => {
  it("combines plan, envelope, readiness, evidence, and handoff hashes", async () => {
    const report = await buildContextControlReport(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    assert.equal(report.schema, "ContextControlReportV1");
    assert.equal(report.readiness.status, "ready-for-handoff");
    assert.equal(report.readiness.verified, true);
    assert.equal(report.gates.plan.status, "verified-plan");
    assert.equal(report.gates.envelope.status, "verified-envelope");
    assert.equal(report.gates.delta_coverage.status, "not-used");
    assert.equal(report.gates.delta_coverage.verified, true);
    assert.equal(report.gates.risk_controls.status, "risk-controls-satisfied");
    assert.ok(["covered-immediately", "requires-evidence-load"].includes(report.gates.requirements.status));
    assert.equal(report.artifacts.plan.schema, "ContextPlanV1");
    assert.equal(report.artifacts.envelope.schema, "ContextEnvelopeV1");
    assert.ok(report.budget.prompt_tokens > 0);
    assert.ok(report.lanes.immediate_context.count > 0);
    assert.ok(report.evidence_protocol.immediate.every((entry) => entry.load_hint.includes("sparkompass_load_evidence")));
    assert.ok(report.evidence_protocol.immediate.every((entry) => entry.source_hash_load_hint.includes("sparkompass_load_source_hash")));
    assert.ok(report.evidence_protocol.on_demand.every((entry) => entry.source_hash_load_hint.includes("sparkompass_load_source_hash")));
    assert.deepEqual(report.handoff.send_order, [
      "stable-prefix-0001",
      "semi-stable-prefix-0001",
      "variable-tail-0001",
      "variable-tail-0002"
    ]);
    assert.ok(report.next_actions.some((action) => action.includes("send_order")));
    assert.ok(report.next_actions.some((action) => action.includes("source hash")));
  });

  it("marks missing must-survive facts as a blocking readiness warning", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-control-missing-"));
    await fs.writeFile(path.join(root, "sample.mjs"), "export function otherThing() { return true; }\n");

    const report = await buildContextControlReport(root, {
      goal: "otherThing",
      expect: ["MISSING_CONTROL_FACT"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    assert.equal(report.readiness.status, "needs-review");
    assert.equal(report.readiness.verified, false);
    assert.ok(report.readiness.blocking_warnings.includes("required-expectation-missing"));
    assert.ok(report.readiness.blocking_warnings.includes("must-survive-facts-missing"));
  });

  it("CLI control emits JSON and a human report", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "control",
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
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const report = JSON.parse(json.stdout);
    assert.equal(report.schema, "ContextControlReportV1");
    assert.equal(report.readiness.status, "ready-for-handoff");

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "control",
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
      "1"
    ], {
      encoding: "utf8"
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /ContextControlReportV1/);
    assert.match(human.stdout, /Sofort Laden/);
    assert.match(human.stdout, /Bei Bedarf Nachladen/);
    assert.match(human.stdout, /Handoff/);
    assert.match(human.stdout, /Prompt-Cache-Status/);
    assert.match(human.stdout, /Delta-Coverage/);
    assert.match(human.stdout, /Risiko-Policy/);
  });
});
