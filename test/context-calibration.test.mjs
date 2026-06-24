import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { calibrateContext } from "../src/context-calibration.mjs";

describe("ContextCalibrationV1", () => {
  it("finds the smallest directly verified target for a risk profile", () => {
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
    assert.equal(calibration.verified, true);
    assert.equal(calibration.policy.risk_profile, "strict");
    assert.equal(calibration.search.min_target_percent, 50);
    assert.equal(calibration.selected.effective_target_percent, 50);
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

    assert.equal(calibration.verified, true);
    assert.equal(calibration.attempts[0].verified, false);
    assert.ok(calibration.attempts[0].reasons.includes("acceptance-oracle-miss"));
    assert.equal(calibration.attempts[0].acceptance_oracle_success, false);
    assert.ok(calibration.attempts[0].acceptance_oracle_missing.includes(expected));
    assert.equal(calibration.selected.acceptance_oracle_success, true);
    assert.match(calibration.recommendation.command_hint, /--expect/);
    assert.match(calibration.recommendation.command_hint, /--expect-regex/);
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
    assert.equal(calibration.verified, true);
    assert.equal(calibration.selected.acceptance_oracle_success, true);
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
    assert.equal(report.status, 0, report.stderr);
    assert.match(report.stdout, /Context Calibration v1/);
    assert.match(report.stdout, /Empfohlene Zielgröße/);
  });
});
