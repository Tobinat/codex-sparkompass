import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { buildCalibratedContextPack, calibrateContext } from "../src/context-calibration.mjs";

describe("ContextCalibrationV1", () => {
  it("finds a compact diagnostic target but requires an oracle for verified calibration", () => {
    const calibration = calibrateContext([
      "E_AUTH_104 must stay.",
      "DEBUG noise",
      "DEBUG noise",
      "Done when: safe"
    ].join("\n"), {
      riskProfile: "strict",
      minTargetPercent: 10,
      maxTargetPercent: 90,
      stepPercent: 5,
      keep: ["E_AUTH_104"]
    });

    assert.equal(calibration.schema, "ContextCalibrationV1");
    assert.equal(calibration.status, "calibration-needs-oracle");
    assert.equal(calibration.verified, false);
    assert.equal(calibration.explicit_oracle_required, true);
    assert.equal(calibration.explicit_oracle_present, false);
    assert.equal(calibration.oracle_gate, "oracle-required");
    assert.equal(calibration.policy.risk_profile, "strict");
    assert.equal(calibration.search.min_target_percent, 50);
    assert.equal(calibration.candidate.effective_target_percent, 50);
    assert.equal(calibration.selected, null);
    assert.equal(calibration.recommendation.target_percent, null);
    assert.ok(calibration.attempts.every((attempt) => attempt.effective_target_percent >= 50));
  });

  it("uses acceptance expectations when searching the safe target", () => {
    const expected = "ordinary sentence should be expected";
    const calibration = calibrateContext([
      "IMPORTANT_ANCHOR survives",
      ...Array.from({ length: 100 }, (_, index) => (
        index === 73
          ? expected
          : `noise ${index} with filler text that can be removed and does not matter`
      ))
    ].join("\n"), {
      minTargetPercent: 10,
      maxTargetPercent: 30,
      stepPercent: 10,
      keep: ["IMPORTANT_ANCHOR"],
      expect: [expected],
      expectRegex: ["ordinary sentence"]
    });

    assert.equal(calibration.status, "verified-calibration");
    assert.equal(calibration.verified, true);
    assert.equal(calibration.explicit_oracle_present, true);
    assert.equal(calibration.oracle_gate, "verified-oracle");
    assert.equal(calibration.attempts[0].verified, false);
    assert.ok(calibration.attempts[0].reasons.includes("acceptance-oracle-miss"));
    assert.equal(calibration.attempts[0].acceptance_oracle_success, false);
    assert.ok(calibration.attempts[0].acceptance_oracle_missing.includes(expected));
    assert.equal(calibration.selected.acceptance_oracle_success, true);
    assert.equal(calibration.selected.acceptance_oracle_sensitivity_success, true);
    assert.match(calibration.recommendation.command_hint, /--expect/);
    assert.match(calibration.recommendation.command_hint, /--expect-regex/);
  });

  it("keeps insensitive oracle candidates out of verified calibration", () => {
    const calibration = calibrateContext([
      "DEBUG first repeated log marker.",
      "DEBUG second repeated log marker.",
      "KEEP_ANCHOR remains."
    ].join("\n"), {
      minTargetPercent: 90,
      maxTargetPercent: 90,
      stepPercent: 5,
      keep: ["KEEP_ANCHOR"],
      expectRegex: ["DEBUG"]
    });

    assert.equal(calibration.status, "calibration-needs-full-context");
    assert.equal(calibration.verified, false);
    assert.equal(calibration.oracle_gate, "oracle-insensitive");
    assert.equal(calibration.candidate, null);
    assert.ok(calibration.attempts[0].reasons.includes("source-acceptance-oracle-insensitive"));
    assert.equal(calibration.attempts[0].acceptance_oracle_sensitivity_success, false);
    assert.deepEqual(calibration.attempts[0].acceptance_oracle_sensitivity_missed, ["/DEBUG/"]);
  });

  it("builds an auto-target ContextPack at the smallest verified target", () => {
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      ...Array.from({ length: 80 }, (_, index) => (
        `debug noise ${index} repeated filler text that can disappear safely`
      )),
      "Done when: Auth reset test passes"
    ].join("\n");

    const pack = buildCalibratedContextPack(source, {
      riskProfile: "balanced",
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["src/auth/session\\.ts"]
    });

    assert.equal(pack.receipt.gate.status, "verified-publishable");
    assert.equal(pack.receipt.context_selection.auto_target.schema, "ContextAutoTargetV1");
    assert.equal(pack.receipt.context_selection.auto_target.status, "verified-auto-target");
    assert.equal(pack.receipt.context_selection.auto_target.explicit_oracle_present, true);
    assert.equal(pack.receipt.context_selection.auto_target.oracle_gate, "verified-oracle");
    assert.equal(pack.receipt.context_selection.auto_target.baseline_target_percent, 35);
    assert.equal(pack.receipt.context_selection.auto_target.baseline_gate_status, "verified-publishable");
    assert.equal(pack.receipt.context_selection.auto_target.candidate_target_percent, 10);
    assert.equal(pack.receipt.context_selection.auto_target.selected_target_percent, 10);
    assert.equal(pack.receipt.context_selection.auto_target.selected_acceptance_oracle_success, true);
    assert.equal(pack.receipt.context_selection.auto_target.selected_acceptance_oracle_sensitivity_success, true);
    assert.equal(pack.receipt.context_selection.auto_target.selected_not_more_tokens_than_baseline, true);
    assert.equal(pack.receipt.context_selection.auto_target.savings_gate, "verified-additional-saving");
    assert.equal(pack.receipt.context_selection.auto_target.quality_contract.explicit_acceptance_oracle_present, true);
    assert.equal(pack.receipt.context_selection.auto_target.quality_contract.acceptance_oracle_success, true);
    assert.equal(pack.receipt.context_selection.auto_target.quality_contract.acceptance_oracle_sensitivity, true);
    assert.ok(pack.receipt.context_selection.auto_target.additional_saved_tokens_vs_baseline > 0);
    assert.ok(pack.receipt.context_selection.auto_target.baseline_delivered_tokens > pack.receipt.context_selection.auto_target.selected_delivered_tokens);
    assert.equal(pack.receipt.critical_anchors.retention_percent, 100);
    assert.equal(pack.receipt.acceptance_oracle.delivered.success, true);
  });

  it("does not verify or use aggressive auto-target candidates without an explicit oracle", () => {
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      ...Array.from({ length: 80 }, (_, index) => (
        `debug noise ${index} repeated filler text that can disappear safely`
      )),
      "Done when: Auth reset test passes"
    ].join("\n");

    const pack = buildCalibratedContextPack(source, {
      riskProfile: "balanced",
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"]
    });
    const autoTarget = pack.receipt.context_selection.auto_target;

    assert.equal(pack.receipt.gate.status, "verified-publishable");
    assert.equal(autoTarget.status, "auto-target-needs-oracle");
    assert.equal(autoTarget.explicit_oracle_required, true);
    assert.equal(autoTarget.explicit_oracle_present, false);
    assert.equal(autoTarget.oracle_gate, "oracle-required");
    assert.equal(autoTarget.savings_gate, "oracle-required");
    assert.equal(autoTarget.baseline_target_percent, 35);
    assert.equal(autoTarget.candidate_target_percent, 10);
    assert.equal(autoTarget.selected_target_percent, 35);
    assert.equal(autoTarget.additional_saved_tokens_vs_baseline, 0);
    assert.ok(autoTarget.candidate_additional_saved_tokens_vs_baseline > 0);
    assert.equal(autoTarget.quality_contract.explicit_acceptance_oracle_present, false);
    assert.equal(autoTarget.quality_contract.acceptance_oracle_success, null);
  });

  it("always measures the profile baseline when auto-targeting skips over it", () => {
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      ...Array.from({ length: 80 }, (_, index) => (
        `debug noise ${index} repeated filler text that can disappear safely`
      )),
      "Done when: Auth reset test passes"
    ].join("\n");

    const pack = buildCalibratedContextPack(source, {
      riskProfile: "balanced",
      autoStepPercent: 20,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["src/auth/session\\.ts"]
    });
    const autoTarget = pack.receipt.context_selection.auto_target;
    const attemptedTargets = autoTarget.attempts.map((attempt) => attempt.effective_target_percent);

    assert.ok(attemptedTargets.includes(35));
    assert.equal(autoTarget.baseline_target_percent, 35);
    assert.equal(autoTarget.baseline_gate_status, "verified-publishable");
    assert.equal(autoTarget.status, "verified-auto-target");
    assert.equal(autoTarget.oracle_gate, "verified-oracle");
    assert.equal(autoTarget.selected_not_more_tokens_than_baseline, true);
  });

  it("CLI calibrate emits JSON and a human report", () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "calibrate",
      "--text",
      "AUTH_RESET_TOKEN_EXPIRED\nNoise\nDone when: grün",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect-regex",
      "AUTH_RESET",
      "--json"
    ], {
      encoding: "utf8"
    });
    assert.equal(json.status, 0, json.stderr);
    const calibration = JSON.parse(json.stdout);
    assert.equal(calibration.schema, "ContextCalibrationV1");
    assert.equal(calibration.status, "verified-calibration");
    assert.equal(calibration.verified, true);
    assert.equal(calibration.oracle_gate, "verified-oracle");
    assert.equal(calibration.selected.acceptance_oracle_success, true);
    assert.equal(calibration.selected.acceptance_oracle_sensitivity_success, true);
    assert.match(calibration.recommendation.command_hint, /--expect "AUTH_RESET_TOKEN_EXPIRED"/);
    assert.match(calibration.recommendation.command_hint, /--expect-regex "AUTH_RESET"/);

    const report = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "calibrate",
      "--text",
      "AUTH_RESET_TOKEN_EXPIRED\nNoise\nDone when: grün",
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED"
    ], {
      encoding: "utf8"
    });
    assert.equal(report.status, 2, report.stderr);
    assert.match(report.stdout, /Context Calibration v1/);
    assert.match(report.stdout, /calibration-needs-oracle/);
    assert.match(report.stdout, /Oracle-Gate: oracle-required/);
    assert.match(report.stdout, /Empfohlene Zielgröße/);
    assert.match(report.stdout, /Kompakter Diagnose-Kandidat/);
  });
});
