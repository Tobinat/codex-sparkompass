import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { compressText } from "../src/compressor.mjs";

const FIXTURE_DIR = path.resolve("test/fixtures");

describe("compression fixtures", () => {
  it("keeps log error anchors while saving tokens", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "error-log.txt"), "utf8");
    const result = compressText(source, {
      label: "error-log.txt",
      mode: "log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"]
    });

    assert.match(result.text, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.match(result.text, /src\/auth\/session\.ts/);
    assert.match(result.text, /Done when: Auth reset test passes/);
    assert.ok(result.savings.percent >= 25);
    assert.notEqual(result.quality.status, "riskant");
  });

  it("keeps markdown commands and quality terms", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "plan.md"), "utf8");
    const result = compressText(source, {
      label: "plan.md",
      mode: "markdown",
      targetPercent: 40,
      keep: ["sparkompass compress", "--keep AUTH_RESET_TOKEN_EXPIRED", "Qualität"]
    });

    assert.match(result.text, /sparkompass compress/);
    assert.match(result.text, /--keep AUTH_RESET_TOKEN_EXPIRED/);
    assert.match(result.text, /Qualität/);
    assert.ok(result.quality.anchorRetentionPercent >= 75);
  });

  it("reports critical anchor retention by class for dangerous CLI flags", () => {
    const source = [
      "Deployment reminder:",
      "Never run git push --force without a reviewed rollback plan.",
      "Keep AUTH_RESET_TOKEN_EXPIRED and src/auth/session.ts in the handoff.",
      "Repeated explanatory noise that can be shortened."
    ].join("\n");
    const result = compressText(source, {
      label: "deploy-note.md",
      mode: "markdown",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const cliClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "cli-option");
    const errorClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "error-code");
    const pathClass = result.quality.criticalAnchorClasses.find((entry) => entry.class === "path");

    assert.match(result.text, /--force/);
    assert.equal(cliClass.retention_percent, 100);
    assert.equal(errorClass.retention_percent, 100);
    assert.equal(pathClass.retention_percent, 100);
  });

  it("keeps code exports and named functions", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "code-sample.mjs"), "utf8");
    const result = compressText(source, {
      label: "code-sample.mjs",
      mode: "code",
      targetPercent: 35,
      keep: ["compressText", "formatCompressionReport"]
    });

    assert.match(result.text, /export function compressText/);
    assert.match(result.text, /export function formatCompressionReport/);
    assert.ok(result.savings.percent >= 20);
    assert.notEqual(result.quality.status, "riskant");
  });

  it("does not treat routine log levels as critical code anchors", () => {
    const source = fs.readFileSync(path.join(FIXTURE_DIR, "failure-corpus", "stacktrace-cutoff.log"), "utf8");
    const result = compressText(source, {
      label: "stacktrace-cutoff.log",
      mode: "log",
      targetPercent: 35,
      keep: ["E_AUTH_104", "first failing frame: src/auth/token_service.py:117", "repeated 68 times", "refresh_token"]
    });

    assert.match(result.text, /E_AUTH_104/);
    assert.match(result.text, /first failing frame: src\/auth\/token_service\.py:117/);
    assert.match(result.text, /repeated 68 times/);
    assert.ok(result.savings.percent >= 50);
    assert.ok(result.quality.missingCriticalAnchors.every((anchor) => !["DEBUG", "INFO"].includes(anchor)));
  });
});
