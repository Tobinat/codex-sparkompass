import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildContextPack } from "../src/context-pack.mjs";

describe("ContextPack Receipt v1", () => {
  it("keeps critical anchors and emits source evidence", () => {
    const source = [
      "2026-06-23 ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes.",
      "Noise that can be removed.",
      "More repeated noise."
    ].join("\n");

    const pack = buildContextPack(source, {
      label: "auth.log",
      mode: "log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"]
    });

    assert.equal(pack.receipt.schema, "ContextPackReceiptV1");
    assert.equal(pack.receipt.critical_anchors.retention_percent, 100);
    assert.equal(pack.receipt.anchor_classes.schema, "AnchorClassBreakdownV1");
    assert.ok(pack.receipt.critical_anchors.classes.some((entry) => entry.class === "keep" && entry.retention_percent === 100));
    assert.ok(pack.receipt.critical_anchors.classes.some((entry) => entry.class === "path" && entry.retention_percent === 100));
    assert.ok(pack.receipt.critical_anchors.classes.some((entry) => entry.class === "error-code" && entry.retention_percent === 100));
    assert.equal(pack.receipt.source_evidence.coverage, 1);
    assert.equal(pack.receipt.gate.status, "verified-publishable");
    assert.equal(pack.fallbackUsed, false);
    assert.match(pack.context.text, /AUTH_RESET_TOKEN_EXPIRED/);
  });

  it("records and enforces an acceptance oracle in the receipt", () => {
    const source = [
      "ERROR E_AUTH_104",
      "first failing frame: src/auth/token_service.py:117",
      "Done when: refresh does not retry without refresh_token"
    ].join("\n");

    const pack = buildContextPack(source, {
      label: "auth-stacktrace.log",
      mode: "log",
      targetPercent: 35,
      keep: ["E_AUTH_104"],
      expect: ["E_AUTH_104"],
      expectRegex: ["src/auth/token_service\\.py:117"]
    });

    assert.equal(pack.receipt.acceptance_oracle.enabled, true);
    assert.equal(pack.receipt.acceptance_oracle.type, "contains-and-regex");
    assert.equal(pack.receipt.acceptance_oracle.source.success, true);
    assert.equal(pack.receipt.acceptance_oracle.delivered.success, true);
    assert.equal(pack.receipt.acceptance_oracle.delivered.matched_count, 2);
    assert.equal(pack.receipt.acceptance_oracle.sensitivity.source.success, true);
    assert.equal(pack.receipt.acceptance_oracle.sensitivity.delivered.success, true);
    assert.equal(pack.receipt.gate.requirements.acceptance_oracle_sensitivity, true);
    assert.equal(pack.receipt.gate.requirements.acceptance_oracle_success, true);
  });

  it("keeps broad insensitive oracles out of the verified gate", () => {
    const source = [
      "DEBUG first repeated log marker.",
      "DEBUG second repeated log marker.",
      "KEEP_ANCHOR remains."
    ].join("\n");

    const pack = buildContextPack(source, {
      label: "broad-oracle.log",
      targetPercent: 90,
      expansionTargets: [],
      keep: ["KEEP_ANCHOR"],
      expectRegex: ["DEBUG"]
    });

    assert.equal(pack.receipt.acceptance_oracle.source.success, true);
    assert.equal(pack.receipt.acceptance_oracle.sensitivity.source.success, false);
    assert.deepEqual(pack.receipt.acceptance_oracle.sensitivity.source.missed, ["/DEBUG/"]);
    assert.equal(pack.receipt.gate.status, "acceptance-oracle-source-insensitive");
    assert.ok(pack.receipt.fallback.reasons.includes("source-acceptance-oracle-insensitive"));
    assert.equal(pack.context.text, source);
  });

  it("falls back when the compact context misses an expected fact", () => {
    const expected = "ordinary sentence should be expected";
    const source = [
      "IMPORTANT_ANCHOR survives",
      ...Array.from({ length: 100 }, (_, index) => (
        index === 73
          ? expected
          : `noise ${index} with filler text that can be removed and does not matter`
      ))
    ].join("\n");

    const pack = buildContextPack(source, {
      label: "oracle-sensitive.txt",
      targetPercent: 10,
      expansionTargets: [],
      keep: ["IMPORTANT_ANCHOR"],
      expect: [expected]
    });

    assert.equal(pack.fallbackUsed, true);
    assert.equal(pack.fallbackMode, "full-context");
    assert.equal(pack.receipt.gate.status, "fallback-full-context");
    assert.ok(pack.receipt.fallback.reasons.includes("acceptance-oracle-miss"));
    assert.equal(pack.receipt.acceptance_oracle.source.success, true);
    assert.equal(pack.receipt.acceptance_oracle.delivered.success, true);
    assert.equal(pack.receipt.acceptance_oracle.sensitivity.delivered.success, true);
    assert.equal(pack.context.text, source);
  });

  it("expands context before using full context when a larger budget verifies", () => {
    const source = [
      "AUTH_RESET_TOKEN_EXPIRED bleibt als kritischer Anker erhalten.",
      ...Array.from({ length: 24 }, (_, index) => (
        `Optionaler Hinweis "--variant-${index}" mit viel erklärendem Fülltext.`
      ))
    ].join("\n");

    const pack = buildContextPack(source, {
      label: "critical.txt",
      targetPercent: 10,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });

    assert.equal(pack.fallbackUsed, true);
    assert.equal(pack.fallbackMode, "expanded-context");
    assert.equal(pack.receipt.gate.status, "verified-expanded-context");
    assert.match(pack.receipt.fallback.reasons.join(","), /risky-compression/);
    assert.equal(pack.receipt.uncertainties.length, 0);
    assert.ok(pack.receipt.context_selection.delivered_target_percent > 10);
    assert.ok(pack.receipt.context_selection.attempts.some((attempt) => attempt.status === "uncertain"));
    assert.ok(pack.receipt.context_selection.attempts.some((attempt) => attempt.status === "verified"));
    assert.equal(pack.receipt.context_selection.attempts.some((attempt) => "compressed" in attempt), false);
    assert.notEqual(pack.context.text, source);
  });

  it("falls back to full context when no expanded attempt verifies", () => {
    const source = [
      "AUTH_RESET_TOKEN_EXPIRED bleibt als kritischer Anker erhalten.",
      ...Array.from({ length: 24 }, (_, index) => (
        `Optionaler Hinweis "--variant-${index}" mit viel erklärendem Fülltext.`
      ))
    ].join("\n");

    const pack = buildContextPack(source, {
      label: "critical.txt",
      targetPercent: 10,
      expansionTargets: [],
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });

    assert.equal(pack.fallbackUsed, true);
    assert.equal(pack.fallbackMode, "full-context");
    assert.equal(pack.receipt.gate.status, "fallback-full-context");
    assert.equal(pack.receipt.ersparnis_prozent, 0);
    assert.equal(pack.receipt.saved_tokens, 0);
    assert.equal(pack.receipt.savings.delivered.percent, 0);
    assert.ok(pack.receipt.savings.compact.percent > 0);
    assert.match(pack.receipt.fallback.reasons.join(","), /full-context-required/);
    assert.ok(pack.receipt.uncertainties.length > 0);
    assert.equal(pack.context.text, source);
  });

  it("applies strict risk profile before selecting context", () => {
    const source = [
      "E_AUTH_104 muss erhalten bleiben.",
      "DEBUG noise",
      "DEBUG noise",
      "Done when: sicherer Auth-Flow"
    ].join("\n");

    const pack = buildContextPack(source, {
      label: "security.log",
      targetPercent: 10,
      riskProfile: "strict",
      keep: ["E_AUTH_104"]
    });

    assert.equal(pack.receipt.context_selection.policy.risk_profile, "strict");
    assert.equal(pack.receipt.context_selection.requested_target_percent, 10);
    assert.equal(pack.receipt.context_selection.effective_target_percent, 50);
    assert.equal(pack.receipt.context_selection.attempts[0].target_percent, 50);
    assert.equal(pack.receipt.critical_anchors.retention_percent, 100);
  });

  it("CLI pack emits a receipt", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "pack",
      "--text",
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect-regex",
      "src/auth/session\\.ts",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const pack = JSON.parse(result.stdout);
    assert.equal(pack.receipt.schema, "ContextPackReceiptV1");
    assert.equal(pack.receipt.critical_anchors.retention_percent, 100);
    assert.equal(pack.receipt.acceptance_oracle.delivered.success, true);
    assert.equal(pack.receipt.acceptance_oracle.sensitivity.delivered.success, true);
  });

  it("CLI pack supports auto-target calibration before building a receipt", () => {
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      ...Array.from({ length: 80 }, (_, index) => (
        `debug noise ${index} repeated filler text that can disappear safely`
      )),
      "Done when: Auth reset test passes"
    ].join("\n");
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "pack",
      "--text",
      source,
      "--target",
      "auto",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--keep",
      "src/auth/session.ts",
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect-regex",
      "src/auth/session\\.ts",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const pack = JSON.parse(result.stdout);
    assert.equal(pack.autoTarget.status, "verified-auto-target");
    assert.equal(pack.autoTarget.oracle_gate, "verified-oracle");
    assert.equal(pack.autoTarget.explicit_oracle_present, true);
    assert.equal(pack.receipt.context_selection.auto_target.selected_target_percent, 10);
    assert.equal(pack.receipt.context_selection.auto_target.savings_gate, "verified-additional-saving");
    assert.equal(pack.receipt.context_selection.auto_target.selected_not_more_tokens_than_baseline, true);
    assert.ok(pack.receipt.context_selection.auto_target.additional_saved_tokens_vs_baseline > 0);
    assert.equal(pack.receipt.gate.status, "verified-publishable");
    assert.equal(pack.receipt.acceptance_oracle.delivered.success, true);
    assert.equal(pack.receipt.acceptance_oracle.sensitivity.delivered.success, true);
  });

  it("CLI pack honors risk profiles", () => {
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "pack",
      "--text",
      "E_AUTH_104\nDEBUG noise\nDone when: safe",
      "--target",
      "10",
      "--risk-profile",
      "strict",
      "--keep",
      "E_AUTH_104",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const pack = JSON.parse(result.stdout);
    assert.equal(pack.receipt.context_selection.policy.risk_profile, "strict");
    assert.equal(pack.receipt.context_selection.effective_target_percent, 50);
  });
});
