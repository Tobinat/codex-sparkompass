import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSparkompassExperimentPlan } from "../src/experiment-plan.mjs";
import { buildSparkompassExperimentScript, formatSparkompassExperimentScript, writeSparkompassExperimentScript } from "../src/experiment-script.mjs";

async function writePromptFiles(root) {
  const promptDir = path.join(root, "prompts");
  await fs.mkdir(promptDir, { recursive: true });
  const raw = path.join(promptDir, "raw.txt");
  const compact = path.join(promptDir, "compact.txt");
  await fs.writeFile(raw, "Bitte fuehre die Aufgabe mit vollem Kontext aus.\nDone when: TASK_OK.\n", "utf8");
  await fs.writeFile(compact, "Ziel: TASK_OK erhalten. Nutze nur notwendige Dateien.\n", "utf8");
  return { raw, compact };
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
    contextPackHash: "sha256:context-pack"
  };
}

async function writeVerifiedPlan(root) {
  const prompts = await writePromptFiles(root);
  const plan = await buildSparkompassExperimentPlan(root, {
    rawPromptFile: prompts.raw,
    compactPromptFile: prompts.compact,
    taskCommand: "npm test",
    expectOutput: ["pass"],
    toolProfile: "standard",
    evidenceDir: "evidence/official",
    out: "evidence/experiment-plan.json",
    ...completeMetadata()
  });
  const planPath = path.join(root, "evidence", "experiment-plan.json");
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { plan, planPath };
}

describe("SparkompassExperimentScriptV1", () => {
  it("builds an executable runbook from a verified experiment plan", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-script-"));
    const { planPath } = await writeVerifiedPlan(root);

    const script = await buildSparkompassExperimentScript(root, {
      plan: planPath,
      out: "evidence/official/run-experiment.sh"
    });

    assert.equal(script.schema, "SparkompassExperimentScriptV1");
    assert.equal(script.gate.status, "verified-experiment-script");
    assert.equal(script.commands.codex_runs, 12);
    assert.equal(script.commands.task_outcomes, 12);
    assert.equal(script.commands.has_experiment_audit, true);
    assert.equal(script.run_order.at(-3).stage, "experiment-audit");
    assert.ok(script.script.includes("set -euo pipefail"));
    assert.ok(script.script.includes("codex 1/12: basis_raw r1"));
    assert.ok(script.script.indexOf("experiment evidence audit") < script.script.indexOf("experiment run"));
    assert.match(formatSparkompassExperimentScript(script), /SparkompassExperimentScriptV1/);

    const outPath = await writeSparkompassExperimentScript(root, script);
    const stat = await fs.stat(outPath);
    assert.equal(stat.mode & 0o111, 0o111);
  });

  it("keeps unverified plans out of the executable gate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-script-review-"));
    const plan = await buildSparkompassExperimentPlan(root, {
      repeat: 1,
      out: "evidence/experiment-plan.json"
    });
    const planPath = path.join(root, "evidence", "experiment-plan.json");
    await fs.mkdir(path.dirname(planPath), { recursive: true });
    await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const script = await buildSparkompassExperimentScript(root, {
      plan: planPath
    });

    assert.equal(script.gate.status, "experiment-script-needs-review");
    assert.ok(script.gate.reasons.some((reason) => reason.startsWith("plan-not-verified")));
    assert.ok(script.gate.reasons.includes("planned-run-count:4/12"));
  });

  it("CLI experiment script writes a reproducible executable shell file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-script-cli-"));
    const { planPath } = await writeVerifiedPlan(root);
    const outPath = path.join(root, "evidence", "official", "run-experiment.sh");
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "experiment",
      "script",
      root,
      "--plan",
      planPath,
      "--out",
      outPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.gate.status, "verified-experiment-script");
    assert.equal(payload.output_path, outPath);
    assert.equal("script" in payload, false);
    const written = await fs.readFile(outPath, "utf8");
    assert.match(written, /Sparkompass experiment plan:/);
    assert.match(written, /experiment evidence audit/);
    const stat = await fs.stat(outPath);
    assert.equal(stat.mode & 0o111, 0o111);
  });
});
