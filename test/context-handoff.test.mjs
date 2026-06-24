import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextHandoffReceipt, formatContextHandoffReceipt } from "../src/context-handoff.mjs";

describe("ContextHandoffReceiptV1", () => {
  it("turns a control-plane preflight into a visible handoff receipt", async () => {
    const receipt = await buildContextHandoffReceipt(".", {
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    assert.equal(receipt.schema, "ContextHandoffReceiptV1");
    assert.equal(receipt.gate.status, "verified-handoff");
    assert.equal(receipt.gate.verified, true);
    assert.equal(receipt.quality_contract.plan_gate, "verified-plan");
    assert.equal(receipt.quality_contract.envelope_gate, "verified-envelope");
    assert.ok(receipt.savings.inventory_tokens > receipt.savings.start_prompt_tokens);
    assert.ok(receipt.savings.start_context_savings_percent > 0);
    assert.match(receipt.savings.visible_bar, /gespart/);
    assert.ok(receipt.start_prompt.text.includes("Stable Prefix"));
    assert.ok(receipt.start_prompt.text.includes("Variable Tail"));
    assert.ok(receipt.handoff.full_prompt_hash.startsWith("sha256:"));
    assert.match(receipt.quality_contract.evidence_protocol, /source hash/);
    assert.ok(receipt.on_demand_index.evidence.every((entry) => entry.source_hash_load_hint.includes("sparkompass_load_source_hash")));
    assert.ok(receipt.on_demand_index.text.includes("raw=sparkompass_load_source_hash"));
    assert.ok(receipt.next_actions.some((action) => action.includes("start_prompt.text")));
    assert.ok(receipt.next_actions.some((action) => action.includes("sparkompass_load_source_hash")));
  });

  it("keeps missing must-survive facts as a blocking handoff gate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-handoff-missing-"));
    await fs.writeFile(path.join(root, "sample.mjs"), "export function otherThing() { return true; }\n");

    const receipt = await buildContextHandoffReceipt(root, {
      goal: "otherThing",
      expect: ["MISSING_HANDOFF_FACT"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    assert.equal(receipt.gate.status, "handoff-needs-review");
    assert.equal(receipt.gate.verified, false);
    assert.ok(receipt.gate.blocking_warnings.includes("required-expectation-missing"));
    assert.deepEqual(receipt.quality_contract.must_survive.missing, ["MISSING_HANDOFF_FACT"]);
  });

  it("keeps strict deferred risk units as a blocking handoff gate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-handoff-risk-"));
    await fs.writeFile(path.join(root, "risk.mjs"), [
      `export function authTokenDeleteForceExpensive() { return "${"x".repeat(900)}"; }`,
      "export function auth() { return true; }"
    ].join("\n"));

    const receipt = await buildContextHandoffReceipt(root, {
      goal: "auth token delete",
      budget: 50,
      riskProfile: "strict",
      minCachePrefixTokens: 1
    });

    assert.equal(receipt.gate.status, "handoff-needs-review");
    assert.equal(receipt.gate.verified, false);
    assert.equal(receipt.quality_contract.risk_controls.status, "risk-review-required");
    assert.ok(receipt.quality_contract.risk_controls.deferred_risk_units >= 1);
    assert.ok(receipt.gate.blocking_warnings.includes("strict-risk-unit-deferred"));
  });

  it("formats a compact human report and CLI output", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "handoff",
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
    const receipt = JSON.parse(json.stdout);
    assert.equal(receipt.schema, "ContextHandoffReceiptV1");
    assert.equal(receipt.gate.status, "verified-handoff");

    const report = formatContextHandoffReceipt(receipt);
    assert.match(report, /ContextHandoffReceiptV1/);
    assert.match(report, /Sichtbare Startkontext-Ersparnis/);
    assert.match(report, /Qualitätsvertrag/);
    assert.match(report, /raw=sparkompass_load_source_hash/);
    assert.doesNotMatch(report, /## Startprompt/);

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "handoff",
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
      "--print-prompt"
    ], {
      encoding: "utf8"
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /ContextHandoffReceiptV1/);
    assert.match(human.stdout, /## Startprompt/);
    assert.match(human.stdout, /Stable Prefix/);
  });
});
