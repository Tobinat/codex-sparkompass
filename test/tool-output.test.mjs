import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadToolOutputEvidence, summarizeToolOutput, writeToolOutputEvidence } from "../src/tool-output.mjs";

const SAMPLE_OUTPUT = [
  "pytest -q",
  "tests/test_auth.py::test_refresh_token FAILED",
  "2026-06-23T14:02:31.482Z ERROR E_AUTH_104 token refresh failed",
  "Traceback (most recent call last):",
  "  File \"src/auth/token_service.py\", line 117, in refresh_token",
  "AssertionError: refresh_token missing",
  "first failing frame: src/auth/token_service.py:117",
  "WARN retry repeated",
  "WARN retry repeated",
  "Done when: refresh does not retry without refresh_token",
  ...Array.from({ length: 80 }, (_, index) => `DEBUG noisy heartbeat line ${index} with repeated non-actionable output`)
].join("\n");

describe("ToolOutputSummaryV1", () => {
  it("summarizes command output with raw hash, errors, files, repeats, and savings", () => {
    const summary = summarizeToolOutput(SAMPLE_OUTPUT, {
      label: "pytest.log",
      command: "pytest -q",
      exitCode: 1
    });

    assert.equal(summary.schema, "ToolOutputSummaryV1");
    assert.equal(summary.command, "pytest -q");
    assert.equal(summary.status.failed, true);
    assert.equal(summary.status.exit_code, 1);
    assert.ok(summary.raw.hash.startsWith("sha256:"));
    assert.ok(summary.delivered.savings_percent > 0);
    assert.ok(summary.error_codes.includes("E_AUTH_104"));
    assert.ok(summary.failed_tests.includes("tests/test_auth.py::test_refresh_token"));
    assert.ok(summary.affected_files.some((item) => item.file === "src/auth/token_service.py" && item.line === 117));
    assert.ok(summary.repeated_lines.some((item) => item.count === 2 && item.text.includes("WARN retry repeated")));
    assert.match(summary.summary_text, /E_AUTH_104/);
    assert.match(summary.summary_text, /sparkompass|Rohdaten|sha256/);
  });

  it("CLI tool-output emits JSON and human report", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-tool-output-"));
    const logPath = path.join(root, "pytest.log");
    await fs.writeFile(logPath, SAMPLE_OUTPUT);

    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "tool-output",
      "--file",
      logPath,
      "--command",
      "pytest -q",
      "--exit-code",
      "1",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const parsed = JSON.parse(json.stdout);
    assert.equal(parsed.schema, "ToolOutputSummaryV1");
    assert.equal(parsed.status.failed, true);

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "tool-output",
      "--file",
      logPath,
      "--command",
      "pytest -q",
      "--exit-code",
      "1"
    ], {
      encoding: "utf8"
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /ToolOutputSummaryV1/);
    assert.match(human.stdout, /E_AUTH_104/);
    assert.match(human.stdout, /src\/auth\/token_service.py:117/);
  });

  it("stores raw output and loads a bounded verified excerpt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-tool-output-store-"));
    const summary = summarizeToolOutput(SAMPLE_OUTPUT, {
      label: "pytest.log",
      command: "pytest -q",
      exitCode: 1
    });
    const stored = await writeToolOutputEvidence(root, SAMPLE_OUTPUT, summary);
    const evidence = await loadToolOutputEvidence(root, {
      summary: stored.raw_ref.summary_path,
      pattern: "E_AUTH_104",
      contextLines: 2,
      maxLines: 6
    });

    assert.equal(evidence.schema, "ToolOutputEvidenceV1");
    assert.equal(evidence.hash_match, true);
    assert.equal(evidence.matched_line, 3);
    assert.match(evidence.text, /E_AUTH_104/);
    assert.ok(evidence.lines.length <= 6);

    const cliPath = path.resolve("bin/codex-sparkompass.mjs");
    const storedJson = spawnSync(process.execPath, [
      cliPath,
      "tool-output",
      "--text",
      SAMPLE_OUTPUT,
      "--command",
      "pytest -q",
      "--exit-code",
      "1",
      "--store",
      ".sparkompass/tool-output",
      "--json"
    ], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    assert.equal(storedJson.status, 0, storedJson.stderr);
    const cliSummary = JSON.parse(storedJson.stdout);

    const loadedJson = spawnSync(process.execPath, [
      cliPath,
      "tool-output",
      "load",
      "--summary",
      cliSummary.raw_ref.summary_path,
      "--pattern",
      "E_AUTH_104",
      "--context-lines",
      "2",
      "--json"
    ], {
      cwd: root,
      encoding: "utf8"
    });

    assert.equal(loadedJson.status, 0, loadedJson.stderr);
    const cliEvidence = JSON.parse(loadedJson.stdout);
    assert.equal(cliEvidence.schema, "ToolOutputEvidenceV1");
    assert.equal(cliEvidence.hash_match, true);
    assert.match(cliEvidence.text, /E_AUTH_104/);
  });
});
