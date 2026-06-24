import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSparkompassExperimentRun, formatSparkompassExperimentRun } from "../src/experiment-run.mjs";
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

async function writeTaskOutcome(root, name, options = {}) {
  const outcome = await recordTaskOutcome({
    command: options.command || "npm test",
    exitCode: options.exitCode ?? 0,
    outputText: options.outputText || "TASK_OK\n",
    expectOutput: options.expectOutput || ["TASK_OK"]
  });
  const filePath = path.join(root, `${name}.task.json`);
  await fs.writeFile(filePath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  return filePath;
}

function completeMetadata() {
  return {
    codexVersion: "codex-test-1.0.0",
    model: "gpt-test",
    reasoningEffort: "medium",
    sandboxMode: "workspace-write",
    repositoryCommit: "abc123",
    configurationHash: "sha256:config",
    pluginHash: "sha256:plugin",
    skillHash: "sha256:skill",
    toolCatalogHash: "sha256:tools",
    promptHash: "sha256:prompt",
    contextPackHash: "sha256:context-pack"
  };
}

describe("SparkompassExperimentRunV1", () => {
  it("builds a four-arm official-usage experiment with run manifests and effects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-"));
    const files = await writeMatrix(root);

    const experiment = await buildSparkompassExperimentRun(root, {
      variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
      taskPassed: [
        "basis_raw=true",
        "basis_kompakt=true",
        "plugin_raw=true",
        "plugin_kompakt=true"
      ],
      repeat: 1,
      model: "gpt-test",
      sandboxMode: "read-only"
    });

    assert.equal(experiment.schema, "SparkompassExperimentRunV1");
    assert.equal(experiment.manifests.length, 4);
    assert.equal(experiment.gate.status, "quality-noninferior");
    assert.equal(experiment.effects.pure_compression_gain_tokens, 320);
    assert.equal(experiment.effects.plugin_overhead_tokens, 110);
    assert.equal(experiment.effects.net_product_gain_tokens, 270);
    assert.equal(experiment.effects.integration_effect_tokens, 50);
    assert.equal(experiment.efficiency.status, "task-efficiency-needs-review");
    assert.equal(experiment.router_recommendation.mode, "lazy");
    assert.ok(experiment.router_recommendation.evidence_gaps.includes("missing-verified-task-efficiency"));
    assert.equal(experiment.manifests[0].official_usage.total_tokens_formula, "input_tokens + output_tokens");
    assert.match(formatSparkompassExperimentRun(experiment), /SparkompassExperimentRunV1/);
  });

  it("derives quality evidence from TaskOutcome receipts per variant", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-task-outcome-"));
    const files = await writeMatrix(root);
    const rawTask = await writeTaskOutcome(root, "basis-raw");
    const compactTask = await writeTaskOutcome(root, "plugin-kompakt");

    const experiment = await buildSparkompassExperimentRun(root, {
      variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
      taskOutcome: [
        `basis_raw=${rawTask}`,
        `plugin_kompakt=${compactTask}`
      ],
      repeat: 1
    });

    assert.equal(experiment.gate.status, "quality-noninferior");
    assert.equal(experiment.summary.by_variant.basis_raw.verified_task_outcomes, 1);
    assert.equal(experiment.summary.by_variant.plugin_kompakt.verified_task_outcomes, 1);
    assert.equal(experiment.manifests.find((manifest) => manifest.variant === "basis_raw").quality_evidence.source, "task-outcome-receipt");
    assert.equal(experiment.manifests.find((manifest) => manifest.variant === "plugin_kompakt").task_outcome.gate_status, "verified-task-outcome");
    assert.equal(experiment.efficiency.status, "verified-task-efficiency");
    assert.equal(experiment.efficiency.baseline_tokens_per_verified_task, 1100);
    assert.equal(experiment.efficiency.optimized_tokens_per_verified_task, 830);
    assert.equal(experiment.efficiency.tokens_per_verified_task_saved, 270);
    assert.equal(experiment.router_recommendation.mode, "compact");
  });

  it("can attach TaskOutcome receipts to individual repeated runs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-task-repeat-"));
    const files = await writeMatrix(root);
    const secondBasisRaw = path.join(root, "basis-raw-r2.jsonl");
    const secondPluginCompact = path.join(root, "plugin-kompakt-r2.jsonl");
    await fs.writeFile(secondBasisRaw, usageJsonl(990, 100, 100, 25), "utf8");
    await fs.writeFile(secondPluginCompact, usageJsonl(750, 250, 70, 15), "utf8");
    const rawTaskOne = await writeTaskOutcome(root, "basis-raw-r1");
    const rawTaskTwo = await writeTaskOutcome(root, "basis-raw-r2");
    const compactTaskOne = await writeTaskOutcome(root, "plugin-kompakt-r1");
    const compactTaskTwo = await writeTaskOutcome(root, "plugin-kompakt-r2");

    const experiment = await buildSparkompassExperimentRun(root, {
      variant: [
        `basis_raw=${files.basis_raw}`,
        `basis_raw=${secondBasisRaw}`,
        `basis_kompakt=${files.basis_kompakt}`,
        `plugin_raw=${files.plugin_raw}`,
        `plugin_kompakt=${files.plugin_kompakt}`,
        `plugin_kompakt=${secondPluginCompact}`
      ],
      taskOutcome: [
        `basis_raw.r1=${rawTaskOne}`,
        `basis_raw.r2=${rawTaskTwo}`,
        `plugin_kompakt.r1=${compactTaskOne}`,
        `plugin_kompakt.r2=${compactTaskTwo}`
      ],
      repeat: 1
    });

    const rawRuns = experiment.manifests.filter((manifest) => manifest.variant === "basis_raw");
    const compactRuns = experiment.manifests.filter((manifest) => manifest.variant === "plugin_kompakt");
    assert.deepEqual(rawRuns.map((manifest) => manifest.repeat_index), [1, 2]);
    assert.deepEqual(compactRuns.map((manifest) => manifest.repeat_index), [1, 2]);
    assert.equal(rawRuns[0].task_outcome.relative_source_file, path.basename(rawTaskOne));
    assert.equal(rawRuns[1].task_outcome.relative_source_file, path.basename(rawTaskTwo));
    assert.equal(compactRuns[0].task_outcome.relative_source_file, path.basename(compactTaskOne));
    assert.equal(compactRuns[1].task_outcome.relative_source_file, path.basename(compactTaskTwo));
  });

  it("keeps TaskOutcome review receipts from passing the quality gate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-task-review-"));
    const files = await writeMatrix(root);
    const rawTask = await writeTaskOutcome(root, "basis-raw");
    const reviewTask = await writeTaskOutcome(root, "plugin-kompakt-review", {
      outputText: "tests ran without marker\n"
    });

    const experiment = await buildSparkompassExperimentRun(root, {
      variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
      taskOutcome: [
        `basis_raw=${rawTask}`,
        `plugin_kompakt=${reviewTask}`
      ],
      repeat: 1
    });

    assert.equal(experiment.gate.status, "experiment-needs-review");
    assert.ok(experiment.gate.reasons.includes("task-outcome-needs-review:plugin_kompakt"));
    assert.equal(experiment.router_recommendation.mode, "full");
  });

  it("keeps usage invariant failures from becoming reproducible evidence", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-invariants-"));
    const files = await writeMatrix(root);
    await fs.writeFile(files.plugin_kompakt, [
      usageJsonl(100, 120, 100, 10),
      usageJsonl(100, 0, 100, 0)
    ].join("\n"), "utf8");

    const experiment = await buildSparkompassExperimentRun(root, {
      variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
      taskPassed: [
        "basis_raw=true",
        "plugin_kompakt=true"
      ],
      repeat: 1
    });

    assert.equal(experiment.gate.status, "experiment-needs-review");
    assert.ok(experiment.gate.reasons.includes("usage-invariant-failures"));
    assert.equal(experiment.summary.by_variant.plugin_kompakt.usage_invariant_failed_runs, 1);
    assert.equal(experiment.manifests.find((manifest) => manifest.variant === "plugin_kompakt").official_usage.invariant_status, "usage-invariants-need-review");
    assert.ok(experiment.router_recommendation.evidence_gaps.includes("usage-invariant-failures"));
  });

  it("can require complete RunManifest metadata before quality evidence is accepted", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-metadata-"));
    const files = await writeMatrix(root);

    const incomplete = await buildSparkompassExperimentRun(root, {
      variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
      taskPassed: [
        "basis_raw=true",
        "plugin_kompakt=true"
      ],
      repeat: 1,
      requireMetadata: true
    });

    assert.equal(incomplete.gate.status, "experiment-needs-review");
    assert.ok(incomplete.gate.reasons.includes("metadata-incomplete"));
    assert.equal(incomplete.summary.evidence_incomplete_runs, 4);
    assert.ok(incomplete.summary.by_variant.basis_raw.evidence_missing_fields.includes("context_pack_hash"));
    assert.ok(incomplete.router_recommendation.evidence_gaps.includes("metadata-incomplete"));

    const complete = await buildSparkompassExperimentRun(root, {
      variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
      taskPassed: [
        "basis_raw=true",
        "plugin_kompakt=true"
      ],
      repeat: 1,
      requireMetadata: true,
      ...completeMetadata()
    });

    assert.equal(complete.gate.status, "quality-noninferior");
    assert.equal(complete.summary.evidence_complete_runs, 4);
    assert.equal(complete.manifests[0].evidence_completeness.status, "verified-run-metadata");
    assert.ok(complete.manifests[0].evidence_completeness.required_fields.some((field) => (
      field.field === "context_pack_hash" && field.known
    )));
  });

  it("routes to bypass when plugin compact uses more total tokens than the raw baseline", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-bypass-"));
    const files = await writeMatrix(root);
    await fs.writeFile(files.plugin_kompakt, usageJsonl(1400, 100, 120, 10), "utf8");

    const experiment = await buildSparkompassExperimentRun(root, {
      variant: Object.entries(files).map(([variant, file]) => `${variant}=${file}`),
      repeat: 1
    });

    assert.equal(experiment.gate.status, "paired-reproducible");
    assert.equal(experiment.router_recommendation.mode, "bypass");
    assert.equal(experiment.effects.net_product_gain_tokens, -420);
  });

  it("CLI experiment run writes a reproducible evidence file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-cli-"));
    const files = await writeMatrix(root);
    const outPath = path.join(root, "evidence", "experiment.json");
    const args = [
      "./bin/codex-sparkompass.mjs",
      "experiment",
      "run",
      root,
      "--variant",
      `basis_raw=${files.basis_raw}`,
      "--variant",
      `basis_kompakt=${files.basis_kompakt}`,
      "--variant",
      `plugin_raw=${files.plugin_raw}`,
      "--variant",
      `plugin_kompakt=${files.plugin_kompakt}`,
      "--task-passed",
      "basis_raw=true",
      "--task-passed",
      "plugin_kompakt=true",
      "--task-outcome",
      `basis_raw=${await writeTaskOutcome(root, "cli-basis-raw")}`,
      "--task-outcome",
      `plugin_kompakt=${await writeTaskOutcome(root, "cli-plugin-kompakt")}`,
      "--out",
      outPath,
      "--json"
    ];

    const result = spawnSync(process.execPath, args, {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.gate.status, "quality-noninferior");
    assert.equal(payload.efficiency.status, "verified-task-efficiency");
    assert.equal(payload.output_path, outPath);
    const written = JSON.parse(await fs.readFile(outPath, "utf8"));
    assert.equal(written.effects.net_product_gain_tokens, 270);
    assert.equal(written.summary.by_variant.plugin_kompakt.verified_task_outcomes, 1);
    assert.equal(written.efficiency.tokens_per_verified_task_saved, 270);
  });
});
