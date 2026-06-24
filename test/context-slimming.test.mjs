import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextSlimmingPlan, formatContextSlimmingPlanReport } from "../src/context-slimming.mjs";

describe("ContextSlimmingPlanV1", () => {
  it("moves ablation-safe immediate units to on-demand while keeping oracle-critical units", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-slim-"));
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function helperAuthFlow() { return true; }",
      "export function targetFactAuthFlow() { return helperAuthFlow(); }"
    ].join("\n"));

    const slimming = await buildContextSlimmingPlan(root, {
      goal: "targetFactAuthFlow helperAuthFlow",
      expect: ["targetFactAuthFlow"],
      budget: 120
    });

    assert.equal(slimming.schema, "ContextSlimmingPlanV1");
    assert.equal(slimming.gate.status, "verified-slimming-plan");
    assert.equal(slimming.ablation_audit.gate, "verified-ablation-audit");
    assert.ok(slimming.proposal.keep_immediate.some((item) => item.name === "targetFactAuthFlow"));
    assert.ok(slimming.proposal.move_to_on_demand.some((item) => item.name === "helperAuthFlow"));
    assert.ok(slimming.budget.additional_saved_tokens > 0);
    assert.ok(slimming.budget.proposed_immediate_tokens < slimming.budget.original_immediate_tokens);

    const report = formatContextSlimmingPlanReport(slimming);
    assert.match(report, /ContextSlimmingPlanV1/);
    assert.match(report, /verified-slimming-plan/);
    assert.match(report, /Nach On-Demand verschieben/);
  });

  it("requires an oracle-backed ablation audit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-slim-no-oracle-"));
    await fs.writeFile(path.join(root, "feature.mjs"), "export function authFlow() { return true; }\n");

    const slimming = await buildContextSlimmingPlan(root, {
      goal: "authFlow",
      budget: 120
    });

    assert.equal(slimming.gate.status, "slimming-plan-needs-review");
    assert.ok(slimming.gate.blockers.includes("ablation-audit-not-verified"));
  });

  it("CLI slim emits JSON and a human report", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "slim",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--expect",
      "compressText",
      "--budget",
      "120",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const slimming = JSON.parse(json.stdout);
    assert.equal(slimming.schema, "ContextSlimmingPlanV1");
    assert.equal(slimming.gate.status, "verified-slimming-plan");

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "slim",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--expect",
      "compressText",
      "--budget",
      "120"
    ], {
      encoding: "utf8"
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /ContextSlimmingPlanV1/);
    assert.match(human.stdout, /Zusatzersparnis im Sofortkontext/);
  });
});
