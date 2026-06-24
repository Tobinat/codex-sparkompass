import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildDoctorOverhead } from "../src/doctor-overhead.mjs";
import { buildSparkompassExperimentRun } from "../src/experiment-run.mjs";
import { buildSparkompassRouterDecision, formatSparkompassRouterDecision } from "../src/router-decision.mjs";
import { recordTaskOutcome } from "../src/task-outcome.mjs";

function usageJsonl(input, cached, output, reasoning = 0) {
  return JSON.stringify({
    type: "turn.completed",
    usage: {
      input_tokens: input,
      cached_input_tokens: cached,
      output_tokens: output,
      reasoning_output_tokens: reasoning
    }
  });
}

async function writeMatrix(root) {
  const files = {
    basis_raw: path.join(root, "basis-raw.jsonl"),
    basis_kompakt: path.join(root, "basis-kompakt.jsonl"),
    plugin_raw: path.join(root, "plugin-raw.jsonl"),
    plugin_kompakt: path.join(root, "plugin-kompakt.jsonl")
  };
  await fs.writeFile(files.basis_raw, usageJsonl(1000, 100, 100, 25), "utf8");
  await fs.writeFile(files.basis_kompakt, usageJsonl(700, 200, 80, 20), "utf8");
  await fs.writeFile(files.plugin_raw, usageJsonl(1120, 120, 90, 30), "utf8");
  await fs.writeFile(files.plugin_kompakt, usageJsonl(760, 260, 70, 15), "utf8");
  return files;
}

async function buildExperiment(root, options = {}) {
  const files = await writeMatrix(root);
  if (options.pluginCompactUsage) {
    await fs.writeFile(files.plugin_kompakt, options.pluginCompactUsage, "utf8");
  }
  const taskOutcome = [];
  if (options.verifiedTaskOutcomes) {
    const basisRawTask = await writeTaskOutcome(root, "basis-raw");
    const pluginCompactTask = await writeTaskOutcome(root, "plugin-kompakt");
    taskOutcome.push(`basis_raw=${basisRawTask}`, `plugin_kompakt=${pluginCompactTask}`);
  }
  return buildSparkompassExperimentRun(root, {
    variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
    taskPassed: options.taskPassed || [],
    taskOutcome,
    repeat: 1
  });
}

async function writeTaskOutcome(root, name) {
  const outcome = await recordTaskOutcome({
    command: "npm test",
    exitCode: 0,
    outputText: "TASK_OK\n",
    expectOutput: ["TASK_OK"]
  });
  const filePath = path.join(root, `${name}.task.json`);
  await fs.writeFile(filePath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  return filePath;
}

describe("SparkompassRouterDecisionV1", () => {
  it("chooses compact when quality is noninferior and net usage is lower", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-router-compact-"));
    const experiment = await buildExperiment(root, {
      verifiedTaskOutcomes: true
    });
    const overhead = await buildDoctorOverhead(".", {
      profile: "standard"
    });

    const decision = buildSparkompassRouterDecision({
      experiment,
      overhead
    });

    assert.equal(decision.schema, "SparkompassRouterDecisionV1");
    assert.equal(decision.mode, "compact");
    assert.equal(decision.recommended_tool_profile, "standard");
    assert.equal(decision.expected_net_gain_tokens, 270);
    assert.equal(decision.quality.status, "noninferior");
    assert.equal(decision.efficiency.status, "verified-task-efficiency");
    assert.equal(decision.efficiency.tokens_per_verified_task_saved, 270);
    assert.ok(decision.profile.estimated_catalog_savings_tokens > 0);
    assert.match(formatSparkompassRouterDecision(decision), /SparkompassRouterDecisionV1/);
  });

  it("chooses lazy when usage is cheaper but quality evidence is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-router-lazy-"));
    const experiment = await buildExperiment(root);

    const decision = buildSparkompassRouterDecision({
      experiment
    });

    assert.equal(decision.mode, "lazy");
    assert.equal(decision.recommended_tool_profile, "minimal");
    assert.ok(decision.evidence_gaps.includes("missing-quality-noninferior-evidence"));
    assert.ok(decision.evidence_gaps.includes("missing-verified-task-efficiency"));
  });

  it("chooses lazy when quality is only backed by task flags", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-router-task-flags-"));
    const experiment = await buildExperiment(root, {
      taskPassed: [
        "basis_raw=true",
        "plugin_kompakt=true"
      ]
    });

    const decision = buildSparkompassRouterDecision({
      experiment
    });

    assert.equal(experiment.gate.status, "quality-noninferior");
    assert.equal(decision.mode, "lazy");
    assert.equal(decision.efficiency.status, "task-efficiency-needs-review");
    assert.ok(decision.evidence_gaps.includes("missing-verified-task-efficiency"));
  });

  it("chooses full when task evidence shows a quality regression", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-router-full-"));
    const experiment = await buildExperiment(root, {
      taskPassed: [
        "basis_raw=true",
        "plugin_kompakt=false"
      ]
    });

    const decision = buildSparkompassRouterDecision({
      experiment
    });

    assert.equal(decision.mode, "full");
    assert.equal(decision.recommended_tool_profile, "debug");
    assert.equal(decision.quality.status, "regression");
    assert.ok(decision.safety_blockers.some((reason) => reason.startsWith("quality-regression")));
  });

  it("CLI router decide writes a router evidence file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-router-cli-"));
    const experiment = await buildExperiment(root, {
      verifiedTaskOutcomes: true
    });
    const experimentPath = path.join(root, "experiment.json");
    const outPath = path.join(root, "router.json");
    await fs.writeFile(experimentPath, `${JSON.stringify(experiment, null, 2)}\n`, "utf8");

    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "router",
      "decide",
      root,
      "--experiment",
      "experiment.json",
      "--out",
      "router.json",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.mode, "compact");
    assert.equal(payload.output_path, outPath);
    const written = JSON.parse(await fs.readFile(outPath, "utf8"));
    assert.equal(written.schema, "SparkompassRouterDecisionV1");
  });
});
