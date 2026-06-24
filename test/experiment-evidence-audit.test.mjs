import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSparkompassExperimentEvidenceAudit, formatSparkompassExperimentEvidenceAudit } from "../src/experiment-evidence-audit.mjs";
import { buildSparkompassExperimentPlan } from "../src/experiment-plan.mjs";
import { recordTaskOutcome } from "../src/task-outcome.mjs";

function usageJsonl(input, cached, output, reasoning = 0) {
  return `${JSON.stringify({
    type: "turn.completed",
    usage: {
      input_tokens: input,
      cached_input_tokens: cached,
      output_tokens: output,
      reasoning_output_tokens: reasoning
    }
  })}\n`;
}

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

async function buildPlanFixture(root) {
  const prompts = await writePromptFiles(root);
  const plan = await buildSparkompassExperimentPlan(root, {
    rawPromptFile: prompts.raw,
    compactPromptFile: prompts.compact,
    taskCommand: "npm test",
    expectOutput: ["TASK_OK"],
    toolProfile: "standard",
    evidenceDir: "evidence/official",
    repeat: 3,
    ...completeMetadata()
  });
  const planPath = path.join(root, "evidence", "experiment-plan.json");
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { plan, planPath };
}

async function writePlannedArtifacts(root, plan) {
  for (const run of plan.variants) {
    const usagePath = path.join(root, run.expected_usage_jsonl);
    await fs.mkdir(path.dirname(usagePath), { recursive: true });
    const base = run.variant.includes("kompakt") ? 700 : 1000;
    await fs.writeFile(usagePath, usageJsonl(base + run.repeat_index, 100, 80, 20), "utf8");

    const outcome = await recordTaskOutcome({
      rootPath: root,
      command: "npm test",
      exitCode: 0,
      outputText: "TASK_OK\n",
      expectOutput: ["TASK_OK"]
    });
    const taskPath = path.join(root, run.expected_task_outcome_json);
    await fs.mkdir(path.dirname(taskPath), { recursive: true });
    await fs.writeFile(taskPath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  }
}

describe("SparkompassExperimentEvidenceAuditV1", () => {
  it("verifies completed plan artifacts before experiment run", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-evidence-"));
    const { plan, planPath } = await buildPlanFixture(root);
    await writePlannedArtifacts(root, plan);

    const audit = await buildSparkompassExperimentEvidenceAudit(root, {
      plan: planPath
    });

    assert.equal(audit.schema, "SparkompassExperimentEvidenceAuditV1");
    assert.equal(audit.gate.status, "verified-experiment-evidence");
    assert.equal(audit.summary.planned_runs, 12);
    assert.equal(audit.summary.usage_verified_runs, 12);
    assert.equal(audit.summary.usage_invariant_verified_runs, 12);
    assert.equal(audit.summary.task_outcomes_verified, 12);
    assert.equal(audit.summary.prompt_hash_matches, 12);
    assert.equal(audit.summary.by_variant.basis_raw.runs, 3);
    assert.match(audit.commands.experiment_run, /experiment run/);
    assert.match(formatSparkompassExperimentEvidenceAudit(audit), /SparkompassExperimentEvidenceAuditV1/);
  });

  it("keeps missing plan artifacts out of the verified gate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-evidence-missing-"));
    const { planPath } = await buildPlanFixture(root);

    const audit = await buildSparkompassExperimentEvidenceAudit(root, {
      plan: planPath
    });

    assert.equal(audit.gate.status, "experiment-evidence-needs-review");
    assert.ok(audit.gate.reasons.includes("missing-usage-files"));
    assert.ok(audit.gate.reasons.includes("missing-task-outcomes"));
    assert.ok(audit.gate.reasons.includes("usage-files-need-review"));
    assert.equal(audit.summary.usage_files_present, 0);
    assert.equal(audit.summary.task_outcomes_present, 0);
  });

  it("CLI experiment audit writes a reproducible evidence audit file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-evidence-cli-"));
    const { plan, planPath } = await buildPlanFixture(root);
    await writePlannedArtifacts(root, plan);
    const outPath = path.join(root, "evidence", "experiment-evidence-audit.json");
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "experiment",
      "audit",
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
    assert.equal(payload.gate.status, "verified-experiment-evidence");
    assert.equal(payload.output_path, outPath);
    const written = JSON.parse(await fs.readFile(outPath, "utf8"));
    assert.equal(written.summary.planned_runs, 12);
    assert.equal(written.summary.verified_runs, 12);
  });
});
