import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildSparkompassExperimentPlan, formatSparkompassExperimentPlan } from "../src/experiment-plan.mjs";

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

describe("SparkompassExperimentPlanV1", () => {
  it("builds a verified four-arm real-Codex run plan", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-plan-"));
    const prompts = await writePromptFiles(root);

    const plan = await buildSparkompassExperimentPlan(root, {
      rawPromptFile: prompts.raw,
      compactPromptFile: prompts.compact,
      taskCommand: "npm test",
      expectOutput: ["pass"],
      toolProfile: "standard",
      evidenceDir: "evidence/official",
      ...completeMetadata()
    });

    assert.equal(plan.schema, "SparkompassExperimentPlanV1");
    assert.equal(plan.gate.status, "verified-experiment-plan");
    assert.equal(plan.matrix.length, 4);
    assert.equal(plan.repeat, 3);
    assert.equal(plan.totals.planned_runs, 12);
    assert.equal(plan.totals.planned_task_outcomes, 12);
    assert.equal(plan.prompts.raw.known, true);
    assert.equal(plan.prompts.compact.known, true);
    assert.match(plan.prompts.raw.prompt_hash, /^sha256:/);
    assert.ok(plan.variants.find((variant) => variant.variant === "basis_raw").codex_command.argv.includes("--ignore-user-config"));
    assert.match(plan.variants.find((variant) => variant.variant === "plugin_kompakt").codex_command.shell, /SPARKOMPASS_TOOL_PROFILE=standard/);
    assert.match(plan.commands.experiment_run, /--require-metadata true/);
    assert.match(plan.commands.experiment_run, /--context-pack-hash sha256:context-pack/);
    assert.match(plan.commands.experiment_run, /--require-context-pack-hash true/);
    assert.match(plan.commands.experiment_run, /basis_raw=evidence\/official\/usage\/basis_raw\.r1\.jsonl/);
    assert.match(plan.commands.experiment_audit, /experiment audit/);
    assert.match(plan.commands.experiment_audit, /--plan evidence\/official\/experiment-plan\.json|--plan evidence\/experiment-plan\.json/);
    assert.match(plan.commands.router_decide, /router decide/);
    assert.match(formatSparkompassExperimentPlan(plan), /SparkompassExperimentPlanV1/);
  });

  it("keeps incomplete plans out of the verified gate", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-plan-incomplete-"));

    const plan = await buildSparkompassExperimentPlan(root, {
      repeat: 1
    });

    assert.equal(plan.gate.status, "experiment-plan-needs-review");
    assert.ok(plan.gate.reasons.includes("raw-prompt-missing"));
    assert.ok(plan.gate.reasons.includes("compact-prompt-missing"));
    assert.ok(plan.gate.reasons.includes("repeat-under-target:1/3"));
    assert.ok(plan.gate.reasons.includes("metadata-missing:model"));
    assert.ok(plan.gate.reasons.includes("metadata-missing:context_pack_hash"));
    assert.ok(plan.next_actions.some((action) => action.includes("Ergaenze fehlende Prompt-Dateien")));
  });

  it("CLI experiment plan writes a reproducible plan file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-plan-cli-"));
    const prompts = await writePromptFiles(root);
    const outPath = path.join(root, "evidence", "experiment-plan.json");
    const result = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "experiment",
      "plan",
      root,
      "--raw-prompt-file",
      prompts.raw,
      "--compact-prompt-file",
      prompts.compact,
      "--task-command",
      "npm test",
      "--expect-output",
      "pass",
      "--tool-profile",
      "standard",
      "--out",
      outPath,
      "--json",
      "--codex-version",
      "codex-test-1.0.0",
      "--model",
      "gpt-test",
      "--reasoning-effort",
      "medium",
      "--sandbox-mode",
      "workspace-write",
      "--repository-commit",
      "abc123",
      "--configuration-hash",
      "sha256:config",
      "--plugin-hash",
      "sha256:plugin",
      "--skill-hash",
      "sha256:skill",
      "--tool-catalog-hash",
      "sha256:tools",
      "--context-pack-hash",
      "sha256:context-pack"
    ], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.gate.status, "verified-experiment-plan");
    assert.equal(payload.output_path, outPath);
    const written = JSON.parse(await fs.readFile(outPath, "utf8"));
    assert.equal(written.totals.planned_runs, 12);
    assert.equal(written.commands.planned_codex_runs.length, 12);
  });
});
