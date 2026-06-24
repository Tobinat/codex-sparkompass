import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextControlReport } from "../src/context-control.mjs";
import { buildContextEvidenceAudit, buildContextEvidenceAuditFromControl, formatContextEvidenceAuditReport } from "../src/evidence-audit.mjs";

describe("ContextEvidenceAuditV1", () => {
  it("verifies planned control evidence against current source hashes", async () => {
    const audit = await buildContextEvidenceAudit(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      maxEvidence: 80
    });

    assert.equal(audit.schema, "ContextEvidenceAuditV1");
    assert.equal(audit.gate.status, "verified-evidence-audit");
    assert.equal(audit.gate.verified, true);
    assert.ok(audit.totals.evidence_checked > 0);
    assert.equal(audit.totals.failed, 0);
    assert.ok(audit.evidence.every((item) => item.verified));

    const report = formatContextEvidenceAuditReport(audit);
    assert.match(report, /ContextEvidenceAuditV1/);
    assert.match(report, /Gate: verified-evidence-audit/);
  });

  it("flags stale evidence hashes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-evidence-audit-"));
    const file = path.join(root, "feature.mjs");
    await fs.writeFile(file, "export function authFlow() { return 'old'; }\n");
    const control = await buildContextControlReport(root, {
      goal: "authFlow",
      budget: 80
    });
    await fs.writeFile(file, "export function authFlow() { return 'new'; }\n");

    const audit = await buildContextEvidenceAuditFromControl(control);

    assert.equal(audit.gate.status, "evidence-audit-needs-review");
    assert.equal(audit.totals.failed, 1);
    assert.equal(audit.evidence[0].status, "hash-mismatch");
  });

  it("CLI evidence-audit emits JSON and a human report", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "evidence-audit",
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
    assert.equal(audit.schema, "ContextEvidenceAuditV1");
    assert.equal(audit.gate.status, "verified-evidence-audit");

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "evidence-audit",
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
    assert.match(human.stdout, /ContextEvidenceAuditV1/);
    assert.match(human.stdout, /Evidence geprüft/);
  });
});
