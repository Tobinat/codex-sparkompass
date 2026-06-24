import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { runShadowComparison } from "../src/shadow.mjs";

describe("ShadowRunV1", () => {
  it("compares full and Sparkompass context against the same oracle", () => {
    const shadow = runShadowComparison([
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes.",
      "Noise that can be compressed."
    ].join("\n"), {
      label: "auth.log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED", "Done when: Auth reset test passes."]
    });

    assert.equal(shadow.schema, "ShadowRunV1");
    assert.equal(shadow.full_context.success, true);
    assert.equal(shadow.sparkompass_context.success, true);
    assert.equal(shadow.comparison.regression, false);
    assert.equal(shadow.comparison.oracle_sensitive, true);
    assert.equal(shadow.comparison.counterfactuals_detected, shadow.comparison.counterfactuals.length);
    assert.equal(shadow.gate.status, "verified-shadow");
    assert.ok(shadow.comparison.tokens_per_successful_case > 0);
  });

  it("supports regex expectations in the deterministic acceptance oracle", () => {
    const shadow = runShadowComparison([
      "ERROR E_AUTH_104",
      "first failing frame: src/auth/token_service.py:117",
      "Done when: refresh does not retry without refresh_token"
    ].join("\n"), {
      label: "auth-stacktrace.log",
      targetPercent: 35,
      keep: ["E_AUTH_104", "refresh_token"],
      expect: ["E_AUTH_104"],
      expectRegex: ["src/auth/token_service\\.py:117"]
    });

    assert.equal(shadow.oracle.type, "contains-and-regex");
    assert.equal(shadow.full_context.success, true);
    assert.equal(shadow.sparkompass_context.success, true);
    assert.equal(shadow.gate.status, "verified-shadow");
    assert.ok(shadow.oracle.expectations.some((item) => item.type === "regex"));
  });

  it("flags a regression when Sparkompass context misses a full-context expectation", () => {
    const shadow = runShadowComparison([
      "IMPORTANT_ANCHOR survives because it is protected.",
      "This ordinary sentence is only expected by the shadow oracle.",
      "Noise that can be compressed.",
      "More noise."
    ].join("\n"), {
      label: "notes.txt",
      targetPercent: 10,
      expansionTargets: [],
      keep: ["IMPORTANT_ANCHOR"],
      expect: ["IMPORTANT_ANCHOR", "This ordinary sentence is only expected by the shadow oracle."]
    });

    assert.equal(shadow.full_context.success, true);
    assert.equal(shadow.sparkompass_context.success, false);
    assert.equal(shadow.comparison.regression, true);
    assert.equal(shadow.gate.status, "shadow-regression");
    assert.ok(shadow.gate.reasons.includes("sparkompass-context-regression"));
  });

  it("CLI shadow emits a verified gate and fails on regression", () => {
    const regressionText = [
      "IMPORTANT_ANCHOR survives",
      ...Array.from({ length: 100 }, (_, index) => (
        index === 73
          ? "ordinary sentence should be expected"
          : `noise ${index} with filler text that can be removed and does not matter`
      ))
    ].join("\n");
    const verified = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "shadow",
      "--text",
      "ERROR AUTH_RESET_TOKEN_EXPIRED\nDone when: safe",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect",
      "Done when: safe",
      "--expect-regex",
      "Done when:\\s+safe"
    ], {
      encoding: "utf8"
    });

    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /Sparkompass Shadow Run/);
    assert.match(verified.stdout, /Gate: verified-shadow/);

    const regression = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "shadow",
      "--text",
      regressionText,
      "--target",
      "10",
      "--keep",
      "IMPORTANT_ANCHOR",
      "--expect",
      "IMPORTANT_ANCHOR",
      "--expect",
      "ordinary sentence should be expected"
    ], {
      encoding: "utf8"
    });

    assert.equal(regression.status, 2);
    assert.match(regression.stdout, /Gate: shadow-regression/);
  });
});
