import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextAblationAudit, formatContextAblationAuditReport } from "../src/context-ablation.mjs";

describe("ContextAblationAuditV1", () => {
  it("identifies oracle-critical immediate context units", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-ablation-"));
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function helperAuthFlow() { return true; }",
      "export function targetFactAuthFlow() { return helperAuthFlow(); }"
    ].join("\n"));

    const audit = await buildContextAblationAudit(root, {
      goal: "targetFactAuthFlow helperAuthFlow",
      expect: ["targetFactAuthFlow"],
      budget: 120
    });

    assert.equal(audit.schema, "ContextAblationAuditV1");
    assert.equal(audit.gate.status, "verified-ablation-audit");
    assert.equal(audit.oracle.baseline_success, true);
    assert.equal(audit.oracle.counterfactuals_detected, audit.oracle.counterfactuals);
    assert.ok(audit.ablations.some((item) => item.name === "targetFactAuthFlow" && item.status === "oracle-critical"));
    assert.ok(audit.totals.ablation_safe_candidates >= 1);

    const report = formatContextAblationAuditReport(audit);
    assert.match(report, /ContextAblationAuditV1/);
    assert.match(report, /Gate: verified-ablation-audit/);
  });

  it("requires an explicit oracle", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-ablation-no-oracle-"));
    await fs.writeFile(path.join(root, "feature.mjs"), "export function authFlow() { return true; }\n");

    const audit = await buildContextAblationAudit(root, {
      goal: "authFlow",
      budget: 120
    });

    assert.equal(audit.gate.status, "ablation-audit-needs-review");
    assert.ok(audit.gate.reasons.includes("oracle-missing"));
    assert.ok(audit.gate.warnings.includes("ablation-audit-needs-oracle"));
  });

  it("CLI ablation-audit emits JSON and a human report", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "ablation-audit",
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
    const audit = JSON.parse(json.stdout);
    assert.equal(audit.schema, "ContextAblationAuditV1");
    assert.equal(audit.gate.status, "verified-ablation-audit");

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "ablation-audit",
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
    assert.match(human.stdout, /ContextAblationAuditV1/);
    assert.match(human.stdout, /Oracle-kritische Einheiten/);
  });
});
