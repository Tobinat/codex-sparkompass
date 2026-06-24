import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildContextBOM, formatContextBOMReport } from "../src/context-bom.mjs";

describe("ContextBOMV1", () => {
  it("summarizes planned context by lane, file, decision, risk, and requirements", async () => {
    const bom = await buildContextBOM(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120
    });

    assert.equal(bom.schema, "ContextBOMV1");
    assert.equal(bom.gate.status, "verified-bom");
    assert.equal(bom.risk_controls.schema, "ContextPlanRiskControlsV1");
    assert.ok(bom.budget.immediate_tokens <= bom.budget.requested_tokens);
    assert.ok(bom.lanes.immediate_context.units > 0);
    assert.ok(bom.files.some((file) => file.file === "src/compressor.mjs"));
    assert.ok(bom.types.some((type) => type.units > 0));
    assert.ok(bom.decisions.some((decision) => decision.decision.startsWith("immediate:")));
    assert.equal(bom.source_plan.decision_trace, "verified-decision-trace");
    assert.equal(bom.decision_trace.schema, "ContextDecisionTraceV1");
    assert.equal(bom.decision_trace.status, "verified-decision-trace");
    assert.equal(bom.must_survive.enabled, true);
    assert.equal(bom.must_survive.covered, 1);
    assert.ok(bom.evidence_protocol.immediate_evidence.length > 0);
    assert.ok(bom.evidence_protocol.immediate_evidence.every((entry) => entry.source_hash_load_hint.includes("sparkompass_load_source_hash")));
    assert.ok(bom.evidence_protocol.on_demand_evidence.every((entry) => entry.source_hash_load_hint.includes("sparkompass_load_source_hash")));
    assert.ok(bom.next_actions.some((action) => action.includes("sparkompass control")));
  });

  it("formats a compact human BOM report", async () => {
    const bom = await buildContextBOM(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      budget: 120
    });
    const report = formatContextBOMReport(bom);

    assert.match(report, /ContextBOMV1/);
    assert.match(report, /Lane-Mix/);
    assert.match(report, /Top-Dateien/);
    assert.match(report, /Entscheidungsklassen/);
    assert.match(report, /Risiko-Policy/);
    assert.match(report, /Decision Trace/);
  });

  it("CLI bom emits JSON and a human report", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "bom",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--budget",
      "120",
      "--expect",
      "compressText",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const bom = JSON.parse(json.stdout);
    assert.equal(bom.schema, "ContextBOMV1");
    assert.equal(bom.gate.status, "verified-bom");
    assert.equal(bom.decision_trace.status, "verified-decision-trace");

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "bom",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--budget",
      "120"
    ], {
      encoding: "utf8"
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /ContextBOMV1/);
    assert.match(human.stdout, /Decision Trace/);
    assert.match(human.stdout, /Risikoregister/);
  });
});
