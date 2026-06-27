import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { MCP_TOOLS, callMcpTool } from "../src/mcp-tools.mjs";

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

function completeExperimentMetadata() {
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

async function writeMcpExperimentPrompts(root) {
  const promptDir = path.join(root, "prompts");
  await fs.mkdir(promptDir, { recursive: true });
  const raw = path.join(promptDir, "raw.txt");
  const compact = path.join(promptDir, "compact.txt");
  await fs.writeFile(raw, "Bitte fuehre die Aufgabe mit vollem Kontext aus.\nDone when: TASK_OK.\n", "utf8");
  await fs.writeFile(compact, "Ziel: TASK_OK erhalten. Nutze nur notwendige Dateien.\n", "utf8");
  return { raw, compact };
}

function plannedUsageForRun(run) {
  const input = {
    basis_raw: 1000,
    basis_kompakt: 700,
    plugin_raw: 1120,
    plugin_kompakt: 760
  }[run.variant] + run.repeat_index;
  const cached = run.variant.includes("kompakt") ? 200 : 100;
  const output = run.variant.includes("kompakt") ? 80 : 100;
  const reasoning = run.variant.includes("plugin") ? 30 : 20;
  return usageJsonl(input, cached, output, reasoning);
}

async function writeMcpExperimentArtifacts(root, plan) {
  for (const run of plan.variants) {
    const usagePath = path.join(root, run.expected_usage_jsonl);
    await fs.mkdir(path.dirname(usagePath), { recursive: true });
    await fs.writeFile(usagePath, plannedUsageForRun(run), "utf8");

    const outcome = await callMcpTool("sparkompass_task_outcome", {
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

describe("Sparkompass MCP tools", () => {
  it("declares context-control tools with input schemas", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);

    assert.deepEqual(names, [
      "sparkompass_inventory",
      "sparkompass_lookup",
      "sparkompass_plan_context",
      "sparkompass_context_bom",
      "sparkompass_build_envelope",
      "sparkompass_control_report",
      "sparkompass_evidence_audit",
      "sparkompass_ablation_audit",
      "sparkompass_slim_context",
      "sparkompass_handoff_receipt",
      "sparkompass_handoff_ledger",
      "sparkompass_scorecard",
      "sparkompass_pilot_run",
      "sparkompass_impact_report",
      "sparkompass_release_audit",
      "sparkompass_experiment_plan",
      "sparkompass_experiment_script",
      "sparkompass_experiment_audit",
      "sparkompass_experiment_run",
      "sparkompass_doctor_overhead",
      "sparkompass_router_decision",
      "sparkompass_package_audit",
      "sparkompass_package_install_smoke",
      "sparkompass_plugin_install_smoke",
      "sparkompass_prompt_advisory",
      "sparkompass_prepare_prompt",
      "sparkompass_prompt_preparation_ledger",
      "sparkompass_envelope_ledger",
      "sparkompass_expand_symbol",
      "sparkompass_load_evidence",
      "sparkompass_load_source_hash",
      "sparkompass_summarize_tool_output",
      "sparkompass_load_tool_output",
      "sparkompass_slice_symbol",
      "sparkompass_trace_flow",
      "sparkompass_cache_write",
      "sparkompass_delta",
      "sparkompass_pack",
      "sparkompass_verify_receipt",
      "sparkompass_verify_context_pack",
      "sparkompass_contextpack_format",
      "sparkompass_task_outcome",
      "sparkompass_task_outcome_ledger",
      "sparkompass_calibrate_context",
      "sparkompass_savings_ledger",
      "sparkompass_shadow_compare",
      "sparkompass_semantic_cache_add",
      "sparkompass_semantic_cache_lookup"
    ]);
    assert.ok(MCP_TOOLS.every((tool) => tool.inputSchema?.type === "object"));
    const packTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_pack");
    assert.deepEqual(packTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(packTool.inputSchema.properties.expectRegex.type, "array");
    assert.equal(packTool.inputSchema.properties.autoTarget.type, "boolean");
    assert.equal(packTool.inputSchema.properties.autoMinTargetPercent.default, 10);
    assert.equal(packTool.inputSchema.properties.autoStepPercent.maximum, 25);
    assert.equal(packTool.inputSchema.properties.storeInRegistry.type, "boolean");
    assert.equal(packTool.inputSchema.properties.registry.type, "string");
    const verifyReceiptTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_verify_receipt");
    assert.equal(verifyReceiptTool.inputSchema.properties.receipt.type, "object");
    assert.equal(verifyReceiptTool.inputSchema.properties.contextText.type, "string");
    const verifyContextPackTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_verify_context_pack");
    assert.equal(verifyContextPackTool.inputSchema.properties.contextPackId.type, "string");
    assert.equal(verifyContextPackTool.inputSchema.properties.registry.type, "string");
    const contextPackFormatTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_contextpack_format");
    assert.deepEqual(contextPackFormatTool.inputSchema.properties.action.enum, ["schema", "lint"]);
    assert.equal(contextPackFormatTool.inputSchema.properties.receiptFile.type, "string");
    const taskOutcomeTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_task_outcome");
    assert.equal(taskOutcomeTool.inputSchema.properties.outputText.type, "string");
    assert.equal(taskOutcomeTool.inputSchema.properties.expectOutputRegex.type, "array");
    const taskOutcomeLedgerTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_task_outcome_ledger");
    assert.deepEqual(taskOutcomeLedgerTool.inputSchema.properties.action.enum, ["report", "add"]);
    assert.equal(taskOutcomeLedgerTool.inputSchema.properties.outcome.type, "object");
    assert.equal(taskOutcomeLedgerTool.inputSchema.properties.outcomeFile.type, "string");
    const planTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_plan_context");
    assert.deepEqual(planTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.match(planTool.inputSchema.properties.budget.description, /ContextPolicyV1/);
    assert.equal(planTool.inputSchema.properties.includeGraph.type, "boolean");
    assert.equal(planTool.inputSchema.properties.expectRegex.type, "array");
    const bomTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_context_bom");
    assert.deepEqual(bomTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(bomTool.inputSchema.properties.expectRegex.type, "array");
    const envelopeTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_build_envelope");
    assert.deepEqual(envelopeTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(envelopeTool.inputSchema.properties.minCachePrefixTokens.type, "integer");
    assert.equal(envelopeTool.inputSchema.properties.previousEnvelope.type, "object");
    assert.equal(envelopeTool.inputSchema.properties.previousEnvelopeFile.type, "string");
    assert.equal(envelopeTool.inputSchema.properties.expectRegex.type, "array");
    const controlTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_control_report");
    assert.deepEqual(controlTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(controlTool.inputSchema.properties.expectRegex.type, "array");
    assert.equal(controlTool.inputSchema.properties.previousEnvelope.type, "object");
    const evidenceAuditTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_evidence_audit");
    assert.deepEqual(evidenceAuditTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(evidenceAuditTool.inputSchema.properties.maxEvidence.default, 180);
    const ablationAuditTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_ablation_audit");
    assert.deepEqual(ablationAuditTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(ablationAuditTool.inputSchema.properties.maxUnits.default, 80);
    const slimTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_slim_context");
    assert.deepEqual(slimTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(slimTool.inputSchema.properties.maxMoves.default, 24);
    const handoffTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_handoff_receipt");
    assert.deepEqual(handoffTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(handoffTool.inputSchema.properties.expectRegex.type, "array");
    assert.equal(handoffTool.inputSchema.properties.previousEnvelope.type, "object");
    const handoffLedgerTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_handoff_ledger");
    assert.deepEqual(handoffLedgerTool.inputSchema.properties.action.enum, ["report", "add"]);
    assert.equal(handoffLedgerTool.inputSchema.properties.receipt.type, "object");
    assert.equal(handoffLedgerTool.inputSchema.properties.receiptFile.type, "string");
    const scorecardTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_scorecard");
    assert.equal(scorecardTool.inputSchema.properties.savingsLedger.type, "string");
    assert.equal(scorecardTool.inputSchema.properties.taskOutcomeLedger.type, "string");
    assert.equal(scorecardTool.inputSchema.properties.envelopeLedger.type, "string");
    assert.equal(scorecardTool.inputSchema.properties.handoffLedger.type, "string");
    assert.equal(scorecardTool.inputSchema.properties.promptPreparationLedger.type, "string");
    const pilotTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_pilot_run");
    assert.equal(pilotTool.inputSchema.properties.ledgerDir.default, ".sparkompass/pilot-run");
    assert.deepEqual(pilotTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(pilotTool.inputSchema.properties.maxPackFiles.maximum, 20);
    const impactTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_impact_report");
    assert.equal(impactTool.inputSchema.properties.savingsLedger.type, "string");
    assert.equal(impactTool.inputSchema.properties.taskOutcomeLedger.type, "string");
    assert.equal(impactTool.inputSchema.properties.handoffLedger.type, "string");
    assert.equal(impactTool.inputSchema.properties.promptPreparationLedger.type, "string");
    const releaseAuditTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_release_audit");
    assert.equal(releaseAuditTool.inputSchema.properties.includePilot.default, true);
    assert.deepEqual(releaseAuditTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(releaseAuditTool.inputSchema.properties.maxMoves.default, 24);
    const experimentPlanTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_experiment_plan");
    assert.equal(experimentPlanTool.inputSchema.properties.rawPromptFile.type, "string");
    assert.equal(experimentPlanTool.inputSchema.properties.compactPromptFile.type, "string");
    assert.deepEqual(experimentPlanTool.inputSchema.properties.toolProfile.enum, ["minimal", "standard", "benchmark", "release", "debug"]);
    const experimentScriptTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_experiment_script");
    assert.equal(experimentScriptTool.inputSchema.properties.plan.type, "string");
    assert.equal(experimentScriptTool.inputSchema.properties.includeScript.type, "boolean");
    const experimentAuditTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_experiment_audit");
    assert.equal(experimentAuditTool.inputSchema.properties.planFile.type, "string");
    const experimentRunTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_experiment_run");
    assert.equal(experimentRunTool.inputSchema.properties.variant.type, "array");
    assert.equal(experimentRunTool.inputSchema.properties.requireMetadata.type, "boolean");
    assert.equal(experimentRunTool.inputSchema.properties.requireContextPackHash.type, "boolean");
    const doctorOverheadTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_doctor_overhead");
    assert.deepEqual(doctorOverheadTool.inputSchema.properties.profile.enum, ["minimal", "standard", "benchmark", "release", "debug"]);
    const routerDecisionTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_router_decision");
    assert.equal(routerDecisionTool.inputSchema.properties.experiment.type, "object");
    assert.equal(routerDecisionTool.inputSchema.properties.experimentFile.type, "string");
    assert.equal(routerDecisionTool.inputSchema.properties.requireQualityEvidence.type, "boolean");
    const packageAuditTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_package_audit");
    assert.equal(packageAuditTool.inputSchema.properties.maxPackageSizeKb.default, 1000);
    assert.equal(packageAuditTool.inputSchema.properties.maxUnpackedSizeKb.default, 3000);
    assert.equal(packageAuditTool.inputSchema.properties.maxFiles.default, 120);
    const packageInstallSmokeTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_package_install_smoke");
    assert.equal(packageInstallSmokeTool.inputSchema.properties.keepTemp.default, false);
    const pluginInstallSmokeTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_plugin_install_smoke");
    assert.equal(pluginInstallSmokeTool.inputSchema.properties.keepTemp.default, false);
    const promptAdvisoryTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_prompt_advisory");
    assert.equal(promptAdvisoryTool.inputSchema.properties.hookPayload.type, "boolean");
    assert.equal(promptAdvisoryTool.inputSchema.properties.minTokens.default, 1600);
    const preparePromptTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_prepare_prompt");
    assert.equal(preparePromptTool.inputSchema.properties.hookPayload.type, "boolean");
    assert.equal(preparePromptTool.inputSchema.properties.expect.type, "array");
    assert.equal(preparePromptTool.inputSchema.properties.autoTarget.type, "boolean");
    assert.equal(preparePromptTool.inputSchema.properties.autoMinTargetPercent.default, 10);
    assert.deepEqual(preparePromptTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    const promptPreparationLedgerTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_prompt_preparation_ledger");
    assert.deepEqual(promptPreparationLedgerTool.inputSchema.properties.action.enum, ["report", "add"]);
    assert.equal(promptPreparationLedgerTool.inputSchema.properties.preparation.type, "object");
    assert.equal(promptPreparationLedgerTool.inputSchema.properties.preparationFile.type, "string");
    const envelopeLedgerTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_envelope_ledger");
    assert.deepEqual(envelopeLedgerTool.inputSchema.properties.action.enum, ["report", "add"]);
    assert.equal(envelopeLedgerTool.inputSchema.properties.envelope.type, "object");
    assert.equal(envelopeLedgerTool.inputSchema.properties.envelopeFile.type, "string");
    const semanticCacheAddTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_semantic_cache_add");
    assert.equal(semanticCacheAddTool.inputSchema.properties.toolVersion.type, "array");
    assert.equal(semanticCacheAddTool.inputSchema.properties.registry.type, "string");
    assert.equal(semanticCacheAddTool.inputSchema.properties.storeSourceText.type, "boolean");
    const semanticCacheLookupSchemaTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_semantic_cache_lookup");
    assert.equal(semanticCacheLookupSchemaTool.inputSchema.properties.toolVersion.type, "array");
    const calibrateTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_calibrate_context");
    assert.deepEqual(calibrateTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(calibrateTool.inputSchema.properties.expectRegex.type, "array");
    const ledgerTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_savings_ledger");
    assert.deepEqual(ledgerTool.inputSchema.properties.action.enum, ["report", "add"]);
    const shadowTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_shadow_compare");
    assert.deepEqual(shadowTool.inputSchema.properties.riskProfile.enum, ["compact", "balanced", "careful", "strict"]);
    assert.equal(shadowTool.inputSchema.properties.expectRegex.type, "array");
    const toolOutputTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_summarize_tool_output");
    assert.equal(toolOutputTool.inputSchema.properties.store.type, "boolean");
    const loadToolOutputTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_load_tool_output");
    assert.equal(loadToolOutputTool.inputSchema.properties.pattern.type, "string");
    const loadSourceHashTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_load_source_hash");
    assert.equal(loadSourceHashTool.inputSchema.properties.sourceHash.type, "string");
    assert.equal(loadSourceHashTool.inputSchema.properties.fileHash.type, "string");
    assert.equal(loadSourceHashTool.inputSchema.properties.maxMatches.default, 5);
    const semanticCacheLookupTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_semantic_cache_lookup");
    assert.equal(semanticCacheLookupTool.inputSchema.properties.minSimilarity.default, undefined);
    assert.match(semanticCacheLookupTool.inputSchema.properties.minSimilarity.description, /adaptive/);
    const lookupSchemaTool = MCP_TOOLS.find((tool) => tool.name === "sparkompass_lookup");
    assert.equal(lookupSchemaTool.inputSchema.properties.repoRoot.type, "string");
    assert.match(lookupSchemaTool.inputSchema.properties.repoRoot.description, /Alias for rootPath/);
  });

  it("looks up semantic units and loads verified evidence", async () => {
    const lookup = await callMcpTool("sparkompass_lookup", {
      rootPath: "test/fixtures",
      query: "compressText",
      budget: 80
    });
    const unit = lookup.selected.find((candidate) => candidate.name === "compressText");

    assert.equal(lookup.schema, "SparkompassLookupToolResultV1");
    assert.ok(unit);

    const evidence = await callMcpTool("sparkompass_load_evidence", {
      rootPath: "test/fixtures",
      unitId: unit.id,
      contextLines: 1
    });

    assert.equal(evidence.schema, "ContextEvidenceV1");
    assert.equal(evidence.file, unit.file);
    assert.equal(evidence.hash_match, true);
    assert.match(evidence.text, /compressText/);

    const sourceHashEvidence = await callMcpTool("sparkompass_load_source_hash", {
      rootPath: "test/fixtures",
      sourceHash: unit.source_hash,
      contextLines: 1
    });

    assert.equal(sourceHashEvidence.schema, "SourceHashEvidenceV1");
    assert.equal(sourceHashEvidence.gate.status, "verified-source-hash-evidence");
    assert.equal(sourceHashEvidence.matches[0].source_hash_match, true);
    assert.match(sourceHashEvidence.matches[0].text, /compressText/);
  });

  it("accepts repoRoot as an MCP alias for rootPath", async () => {
    const lookup = await callMcpTool("sparkompass_lookup", {
      repoRoot: "test/fixtures",
      query: "compressText",
      budget: 80
    });

    assert.equal(lookup.schema, "SparkompassLookupToolResultV1");
    assert.equal(lookup.root, path.resolve("test/fixtures"));
    assert.ok(lookup.selected.some((candidate) => candidate.name === "compressText"));
  });

  it("plans immediate and on-demand context through the MCP tool layer", async () => {
    const plan = await callMcpTool("sparkompass_plan_context", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      expectRegex: ["compressText"],
      budget: 120
    });

    assert.equal(plan.schema, "ContextPlanV1");
    assert.equal(plan.optimizer.schema, "ContextBudgetOptimizerV1");
    assert.equal(plan.risk_controls.schema, "ContextPlanRiskControlsV1");
    assert.equal(plan.gate.status, "verified-plan");
    assert.equal(plan.requirements.enabled, true);
    assert.equal(plan.requirements.covered, 2);
    assert.ok(plan.lanes.immediate_context.some((unit) => unit.file === "src/compressor.mjs"));
    assert.ok(plan.budget.immediate_tokens <= plan.budget.requested_tokens);
  });

  it("exposes strict deferred-risk review through the MCP plan tool", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-plan-risk-"));
    await fs.writeFile(path.join(root, "risk.mjs"), [
      `export function authTokenDeleteForceExpensive() { return "${"x".repeat(900)}"; }`,
      "export function auth() { return true; }"
    ].join("\n"));

    const plan = await callMcpTool("sparkompass_plan_context", {
      rootPath: root,
      goal: "auth token delete",
      budget: 50,
      riskProfile: "strict"
    });

    assert.equal(plan.schema, "ContextPlanV1");
    assert.equal(plan.risk_controls.status, "risk-review-required");
    assert.ok(plan.gate.reasons.includes("strict-risk-unit-deferred"));
    assert.equal(plan.gate.status, "plan-needs-review");
  });

  it("builds a context bill of materials through the MCP tool layer", async () => {
    const bom = await callMcpTool("sparkompass_context_bom", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120
    });

    assert.equal(bom.schema, "ContextBOMV1");
    assert.equal(bom.gate.status, "verified-bom");
    assert.ok(bom.files.some((file) => file.file === "src/compressor.mjs"));
    assert.equal(bom.must_survive.covered, 1);
  });

  it("builds a cache-friendly context envelope through the MCP tool layer", async () => {
    const envelope = await callMcpTool("sparkompass_build_envelope", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    assert.equal(envelope.schema, "ContextEnvelopeV1");
    assert.equal(envelope.plan.schema, "ContextPlanV1");
    assert.equal(envelope.gate.status, "verified-envelope");
    assert.equal(envelope.cache_metrics.prefix_status, "prefix-meets-estimated-threshold");
    assert.deepEqual(envelope.assembly.send_order, [
      "stable-prefix-0001",
      "semi-stable-prefix-0001",
      "variable-tail-0001",
      "variable-tail-0002"
    ]);
    assert.ok(envelope.prompt.text.includes("Stable Prefix"));
    assert.ok(envelope.prompt.text.includes("Variable Tail"));

    const compared = await callMcpTool("sparkompass_build_envelope", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1,
      previousEnvelope: envelope
    });

    assert.equal(compared.prefix_reuse.status, "full-prefix-reusable");
    assert.equal(compared.prefix_reuse.reusable_prefix_percent, 100);
  });

  it("builds a control-plane preflight report through the MCP tool layer", async () => {
    const report = await callMcpTool("sparkompass_control_report", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    assert.equal(report.schema, "ContextControlReportV1");
    assert.equal(report.readiness.status, "ready-for-handoff");
    assert.equal(report.artifacts.plan.schema, "ContextPlanV1");
    assert.equal(report.artifacts.envelope.schema, "ContextEnvelopeV1");
    assert.ok(report.evidence_protocol.immediate.length > 0);
    assert.ok(report.handoff.full_prompt_hash.startsWith("sha256:"));
  });

  it("builds an evidence audit through the MCP tool layer", async () => {
    const audit = await callMcpTool("sparkompass_evidence_audit", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120
    });

    assert.equal(audit.schema, "ContextEvidenceAuditV1");
    assert.equal(audit.gate.status, "verified-evidence-audit");
    assert.equal(audit.totals.failed, 0);
    assert.ok(audit.totals.evidence_checked > 0);
  });

  it("builds an ablation audit through the MCP tool layer", async () => {
    const audit = await callMcpTool("sparkompass_ablation_audit", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120
    });

    assert.equal(audit.schema, "ContextAblationAuditV1");
    assert.equal(audit.gate.status, "verified-ablation-audit");
    assert.ok(audit.totals.oracle_critical_units >= 1);
    assert.equal(audit.oracle.counterfactuals_detected, audit.oracle.counterfactuals);
  });

  it("builds a slimming plan through the MCP tool layer", async () => {
    const slimming = await callMcpTool("sparkompass_slim_context", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120
    });

    assert.equal(slimming.schema, "ContextSlimmingPlanV1");
    assert.equal(slimming.gate.status, "verified-slimming-plan");
    assert.ok(slimming.proposal.move_to_on_demand.length > 0);
    assert.ok(slimming.budget.additional_saved_tokens > 0);
  });

  it("builds a handoff receipt through the MCP tool layer", async () => {
    const receipt = await callMcpTool("sparkompass_handoff_receipt", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    assert.equal(receipt.schema, "ContextHandoffReceiptV1");
    assert.equal(receipt.gate.status, "verified-handoff");
    assert.ok(receipt.savings.visible_bar.includes("gespart"));
    assert.ok(receipt.start_prompt.text.includes("Stable Prefix"));
    assert.ok(receipt.on_demand_index.hash.startsWith("sha256:"));
  });

  it("records handoff receipts through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-handoff-ledger-"));
    const ledger = path.join(root, "handoff-ledger.json");
    const receipt = await callMcpTool("sparkompass_handoff_receipt", {
      rootPath: ".",
      goal: "compressText quality warnings",
      file: ["src/compressor.mjs"],
      expect: ["compressText"],
      budget: 120,
      minCachePrefixTokens: 1
    });

    const write = await callMcpTool("sparkompass_handoff_ledger", {
      rootPath: ".",
      action: "add",
      ledger,
      receipt
    });
    const report = await callMcpTool("sparkompass_handoff_ledger", {
      rootPath: ".",
      ledger
    });

    assert.equal(write.schema, "ContextHandoffLedgerWriteResultV1");
    assert.equal(report.schema, "ContextHandoffLedgerV1");
    assert.equal(report.totals.entries, 1);
    assert.equal(report.totals.verified_handoffs, 1);
    assert.equal(report.totals.quality_gated_handoff_saving_handoffs, 1);
  });

  it("builds a release scorecard through the MCP tool layer", async () => {
    const scorecard = await callMcpTool("sparkompass_scorecard", {
      rootPath: ".",
      targetPercent: 35,
      minSaving: 35,
      minAnchors: 75
    });

    assert.equal(scorecard.schema, "SparkompassScorecardV1");
    assert.equal(scorecard.release_readiness.status, "verified-scorecard");
    assert.equal(scorecard.gates.task_outcome.verified_count, scorecard.gates.task_outcome.total);
    assert.equal(scorecard.metrics.benchmark.regressions, 0);
  });

  it("builds a pilot run through the MCP tool layer", async () => {
    const ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-pilot-"));
    const pilot = await callMcpTool("sparkompass_pilot_run", {
      rootPath: ".",
      ledgerDir,
      maxPackFiles: 1
    });

    assert.equal(pilot.schema, "SparkompassPilotRunV1");
    assert.equal(pilot.gate.status, "verified-pilot-run");
    assert.equal(pilot.metrics.savings_entries, 1);
    assert.equal(pilot.metrics.verified_tasks, 1);
    assert.equal(pilot.metrics.verified_handoffs, 1);
    assert.equal(pilot.metrics.quality_gated_handoff_saving_handoffs, 1);
    assert.equal(pilot.metrics.verified_prompt_preparations, 1);
    assert.match(pilot.ledger_paths.taskOutcome, /task-outcome-ledger\.json$/);
    assert.match(pilot.ledger_paths.promptPreparation, /prompt-preparation-ledger\.json$/);
  });

  it("builds an impact report through the MCP tool layer", async () => {
    const ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-impact-"));
    const pilot = await callMcpTool("sparkompass_pilot_run", {
      rootPath: ".",
      ledgerDir,
      maxPackFiles: 1
    });
    const impact = await callMcpTool("sparkompass_impact_report", {
      rootPath: ".",
      savingsLedger: pilot.ledger_paths.savings,
      taskOutcomeLedger: pilot.ledger_paths.taskOutcome,
      handoffLedger: pilot.ledger_paths.handoff,
      promptPreparationLedger: pilot.ledger_paths.promptPreparation
    });

    assert.equal(impact.schema, "SparkompassImpactReportV1");
    assert.equal(impact.gate.status, "verified-impact");
    assert.equal(impact.quality.verified_prompt_preparations, 1);
    assert.equal(impact.quality.verified_tasks, 1);
    assert.ok(impact.impact.combined_saved_tokens > 0);
    assert.ok(impact.impact.sendable_prompt_saved_tokens > 0);
  });

  it("builds the official-usage experiment evidence chain through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-experiment-"));
    const prompts = await writeMcpExperimentPrompts(root);
    const metadata = completeExperimentMetadata();
    const plan = await callMcpTool("sparkompass_experiment_plan", {
      rootPath: root,
      rawPromptFile: prompts.raw,
      compactPromptFile: prompts.compact,
      taskCommand: "npm test",
      expectOutput: ["TASK_OK"],
      evidenceDir: "evidence/official",
      toolProfile: "standard",
      out: "evidence/experiment-plan.json",
      ...metadata
    });

    assert.equal(plan.schema, "SparkompassExperimentPlanV1");
    assert.equal(plan.gate.status, "verified-experiment-plan");
    assert.equal(plan.totals.planned_runs, 12);
    assert.ok(plan.output_path.endsWith(path.join("evidence", "experiment-plan.json")));
    assert.match(plan.commands.experiment_audit, /experiment audit/);

    const script = await callMcpTool("sparkompass_experiment_script", {
      rootPath: root,
      plan: "evidence/experiment-plan.json",
      out: "evidence/official/run-experiment.sh"
    });

    assert.equal(script.schema, "SparkompassExperimentScriptV1");
    assert.equal(script.gate.status, "verified-experiment-script");
    assert.equal(script.commands.codex_runs, 12);
    assert.equal("script" in script, false);
    assert.ok(script.output_path.endsWith(path.join("evidence", "official", "run-experiment.sh")));

    await writeMcpExperimentArtifacts(root, plan);

    const audit = await callMcpTool("sparkompass_experiment_audit", {
      rootPath: root,
      planFile: "evidence/experiment-plan.json",
      out: "evidence/official/experiment-evidence-audit.json"
    });

    assert.equal(audit.schema, "SparkompassExperimentEvidenceAuditV1");
    assert.equal(audit.gate.status, "verified-experiment-evidence");
    assert.equal(audit.summary.usage_invariant_verified_runs, 12);
    assert.equal(audit.summary.task_outcomes_verified, 12);
    assert.ok(audit.output_path.endsWith(path.join("evidence", "official", "experiment-evidence-audit.json")));

    const experiment = await callMcpTool("sparkompass_experiment_run", {
      rootPath: root,
      variant: plan.variants.map((run) => `${run.variant}=${run.expected_usage_jsonl}`),
      taskOutcome: plan.variants.map((run) => `${run.variant}.r${run.repeat_index}=${run.expected_task_outcome_json}`),
      promptFileVariant: [
        `basis_raw=${plan.prompts.raw.command_file}`,
        `plugin_raw=${plan.prompts.raw.command_file}`,
        `basis_kompakt=${plan.prompts.compact.command_file}`,
        `plugin_kompakt=${plan.prompts.compact.command_file}`
      ],
      repeat: 3,
      requireMetadata: true,
      out: "evidence/official/experiment.json",
      ...metadata
    });

    assert.equal(experiment.schema, "SparkompassExperimentRunV1");
    assert.equal(experiment.gate.status, "quality-noninferior");
    assert.equal(experiment.summary.runs, 12);
    assert.equal(experiment.summary.usage_invariant_verified_runs, 12);
    assert.equal(experiment.summary.evidence_complete_runs, 12);
    assert.equal(experiment.efficiency.status, "verified-task-efficiency");
    assert.ok(experiment.efficiency.tokens_per_verified_task_saved > 0);
    assert.equal(experiment.router_recommendation.mode, "compact");
    assert.ok(experiment.effects.net_product_gain_tokens > 0);

    const overhead = await callMcpTool("sparkompass_doctor_overhead", {
      rootPath: ".",
      profile: "standard"
    });

    assert.equal(overhead.schema, "SparkompassDoctorOverheadV1");
    assert.equal(overhead.gate.status, "verified-doctor-overhead");
    assert.equal(overhead.active_profile, "standard");
    assert.ok(overhead.mcp.active_tool_count < overhead.mcp.full_tool_count);

    const router = await callMcpTool("sparkompass_router_decision", {
      rootPath: root,
      experimentFile: "evidence/official/experiment.json",
      overhead,
      out: "evidence/official/router.json"
    });

    assert.equal(router.schema, "SparkompassRouterDecisionV1");
    assert.equal(router.gate.status, "verified-router-decision");
    assert.equal(router.mode, "compact");
    assert.equal(router.recommended_tool_profile, "standard");
    assert.equal(router.efficiency.status, "verified-task-efficiency");
    assert.ok(router.output_path.endsWith(path.join("evidence", "official", "router.json")));
  });

  it("builds a release audit through the MCP tool layer", async () => {
    const ledgerDir = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-release-audit-"));
    const audit = await callMcpTool("sparkompass_release_audit", {
      rootPath: ".",
      ledgerDir,
      maxPackFiles: 1
    });

    assert.equal(audit.schema, "SparkompassReleaseAuditV1");
    assert.equal(audit.gate.status, "verified-release-audit");
    assert.deepEqual(audit.gate.blockers, []);
    assert.equal(audit.metrics.mcp_tools, MCP_TOOLS.length);
    assert.equal(audit.metrics.package_dry_run_status, "verified-package-dry-run");
    assert.ok(audit.metrics.package_dry_run_files > 0);
    assert.equal(audit.metrics.package_install_smoke_status, "verified-package-install-smoke");
    assert.ok(audit.metrics.package_install_smoke_mcp_tools >= 41);
    assert.equal(audit.metrics.package_install_smoke_benchmark_cases, 26);
    assert.equal(audit.metrics.plugin_install_smoke_status, "verified-plugin-install-smoke");
    assert.ok(audit.metrics.plugin_install_smoke_mcp_tools >= 42);
    assert.equal(audit.metrics.plugin_install_smoke_tool_call_ok, true);
    assert.ok(audit.metrics.plugin_install_smoke_lookup_selected > 0);
    assert.equal(audit.metrics.plugin_install_smoke_cache_tool_call_ok, true);
    assert.ok(audit.metrics.plugin_install_smoke_cache_lookup_selected > 0);
    assert.equal(audit.metrics.plugin_install_smoke_hook_ok, true);
    assert.equal(audit.metrics.decision_trace_status, "verified-decision-trace");
    assert.equal(audit.metrics.impact_status, "verified-impact");
    assert.equal(audit.metrics.slimming_plan_status, "verified-slimming-plan");
    assert.equal(audit.metrics.context_pack_format_status, "verified-context-pack-format");
    assert.equal(audit.metrics.context_pack_id_verification_status, "verified-context-pack-id");
    assert.equal(audit.metrics.source_hash_evidence_status, "verified-source-hash-evidence");
    assert.equal(audit.metrics.source_hash_contract_status, "verified-source-hash-contract");
    assert.equal(audit.metrics.semantic_cache_tool_fingerprint_status, "verified-semantic-cache-tool-fingerprint");
    assert.equal(audit.metrics.semantic_cache_registry_contract_status, "verified-semantic-cache-registry-contract");
    assert.equal(audit.metrics.prompt_preparation_status, "verified-prompt-preparation");
    assert.equal(audit.metrics.github_release_claims_status, "verified-github-release-claims");
    assert.equal(audit.metrics.github_release_claims_failed, 0);
    assert.equal(audit.artifacts.package_dry_run.schema, "PackageDryRunAuditV1");
    assert.equal(audit.artifacts.package_dry_run.verified, true);
    assert.equal(audit.artifacts.package_install_smoke.schema, "PackageInstallSmokeAuditV1");
    assert.equal(audit.artifacts.package_install_smoke.verified, true);
    assert.equal(audit.artifacts.plugin_install_smoke.schema, "PluginInstallSmokeAuditV1");
    assert.equal(audit.artifacts.plugin_install_smoke.verified, true);
    assert.ok(audit.requirements.some((item) => item.id === "decision-trace-and-reviewability" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "evidence-load-verification" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "source-hash-raw-retrieval" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "planned-context-ablation" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "ablation-driven-slimming" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "open-contextpack-format" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "user-impact-report" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "fallback-on-uncertainty" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "github-release-claims" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "package-dry-run" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "package-install-smoke" && item.status === "verified"));
    assert.ok(audit.requirements.some((item) => item.id === "plugin-install-smoke" && item.status === "verified"));
  });

  it("builds a package dry-run audit through the MCP tool layer", async () => {
    const audit = await callMcpTool("sparkompass_package_audit", {
      rootPath: "."
    });

    assert.equal(audit.schema, "PackageDryRunAuditV1");
    assert.equal(audit.status, "verified-package-dry-run");
    assert.equal(audit.verified, true);
    assert.equal(audit.forbidden_paths.length, 0);
    assert.ok(audit.package.file_count > 0);
    assert.equal(audit.required_paths.missing.length, 0);
  });

  it("builds a package install smoke audit through the MCP tool layer", async () => {
    const audit = await callMcpTool("sparkompass_package_install_smoke", {
      rootPath: "."
    });

    assert.equal(audit.schema, "PackageInstallSmokeAuditV1");
    assert.equal(audit.status, "verified-package-install-smoke");
    assert.equal(audit.verified, true);
    assert.equal(audit.installed.cli_doctor_ok, true);
    assert.equal(audit.installed.benchmark_gate, "verified-benchmark");
    assert.ok(audit.installed.mcp_tool_count >= 41);
    assert.equal(audit.installed.mcp_required_tools_present, true);
  });

  it("builds a plugin install smoke audit through the MCP tool layer", async () => {
    const audit = await callMcpTool("sparkompass_plugin_install_smoke", {
      rootPath: "."
    });

    assert.equal(audit.schema, "PluginInstallSmokeAuditV1");
    assert.equal(audit.status, "verified-plugin-install-smoke");
    assert.equal(audit.verified, true);
    assert.equal(audit.installed.cli_bridge_ok, true);
    assert.equal(audit.installed.mcp_bridge_ok, true);
    assert.equal(audit.installed.mcp_tool_call_ok, true);
    assert.equal(audit.installed.cache_cli_bridge_ok, true);
    assert.equal(audit.installed.cache_mcp_bridge_ok, true);
    assert.equal(audit.installed.cache_mcp_tool_call_ok, true);
    assert.equal(audit.installed.hook_advisory_ok, true);
    assert.equal(audit.installed.hook_redacts_sensitive_anchor, true);
    assert.ok(audit.installed.mcp_tool_count >= 42);
    assert.ok(audit.installed.mcp_lookup_selected > 0);
    assert.ok(audit.installed.cache_mcp_lookup_selected > 0);
  });

  it("builds a prompt advisory through the MCP tool layer", async () => {
    const advisory = await callMcpTool("sparkompass_prompt_advisory", {
      text: JSON.stringify({
        user_prompt: "ERROR E_AUTH_104 failed in src/auth/session.mjs"
      }),
      hookPayload: true,
      minTokens: 100000,
      minLines: 100000
    });

    assert.equal(advisory.schema, "SparkompassUserPromptHookAdvisoryV1");
    assert.equal(advisory.status, "advisory");
    assert.ok(advisory.signals.includes("tool-output"));
    assert.equal(advisory.suggested.action, "summarize-tool-output");
  });

  it("prepares a sendable compact prompt through the MCP tool layer", async () => {
    const text = [
      "# Ziel",
      "Bitte behebe AUTH_RESET_TOKEN_EXPIRED in src/auth/session.mjs.",
      "Done when: npm test ist grün.",
      ...Array.from({ length: 80 }, (_, index) => `Hintergrundnotiz ${index}: allgemeiner Verlauf ohne neue Entscheidung.`)
    ].join("\n");
    const preparation = await callMcpTool("sparkompass_prepare_prompt", {
      text,
      goal: "Auth-Reset reparieren",
      autoTarget: true,
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });

    assert.equal(preparation.schema, "SparkompassPromptPreparationV1");
    assert.equal(preparation.gate.verified, true);
    assert.equal(preparation.context_pack.auto_target.status, "verified-auto-target");
    assert.equal(preparation.context_pack.auto_target.oracle_gate, "verified-oracle");
    assert.equal(preparation.context_pack.auto_target.selected_target_percent, 10);
    assert.equal(preparation.context_pack.auto_target.savings_gate, "verified-additional-saving");
    assert.equal(preparation.context_pack.auto_target.selected_not_more_tokens_than_baseline, true);
    assert.match(preparation.sendable_prompt.text, /ContextPack: ctx-/);
    assert.match(preparation.sendable_prompt.text, /AUTH_RESET_TOKEN_EXPIRED/);
    assert.doesNotMatch(preparation.sendable_prompt.text, /Hintergrundnotiz 79/);
    assert.ok(preparation.savings.delivered_context.percent > 0);
  });

  it("records prompt preparation ledgers through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-prompt-prep-ledger-"));
    const ledgerPath = path.join(root, "prompt-preparation-ledger.json");
    const text = [
      "# Ziel",
      "Bitte behebe AUTH_RESET_TOKEN_EXPIRED in src/auth/session.mjs.",
      "Done when: npm test ist grün.",
      ...Array.from({ length: 80 }, (_, index) => `Hintergrundnotiz ${index}: allgemeiner Verlauf ohne neue Entscheidung.`)
    ].join("\n");
    const preparation = await callMcpTool("sparkompass_prepare_prompt", {
      text,
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const write = await callMcpTool("sparkompass_prompt_preparation_ledger", {
      rootPath: root,
      action: "add",
      ledger: ledgerPath,
      preparation
    });
    const report = await callMcpTool("sparkompass_prompt_preparation_ledger", {
      rootPath: root,
      ledger: ledgerPath
    });

    assert.equal(write.schema, "PromptPreparationLedgerWriteResultV1");
    assert.equal(report.schema, "PromptPreparationLedgerV1");
    assert.equal(report.totals.entries, 1);
    assert.equal(report.totals.verified_preparations, 1);
    assert.ok(report.totals.sendable_prompt_saved_tokens > 0);
  });

  it("records envelope prefix reuse through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-envelope-ledger-"));
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableHelper() { return 'same'; }",
      "export function targetFlow() { return stableHelper(); }"
    ].join("\n"));
    const ledgerPath = path.join(root, "envelope-ledger.json");
    const firstEnvelope = await callMcpTool("sparkompass_build_envelope", {
      rootPath: root,
      goal: "targetFlow stableHelper",
      budget: 120,
      minCachePrefixTokens: 1
    });
    const secondEnvelope = await callMcpTool("sparkompass_build_envelope", {
      rootPath: root,
      goal: "targetFlow stableHelper",
      budget: 120,
      minCachePrefixTokens: 1
    });
    const first = await callMcpTool("sparkompass_envelope_ledger", {
      rootPath: root,
      action: "add",
      ledger: ledgerPath,
      envelope: firstEnvelope
    });
    const second = await callMcpTool("sparkompass_envelope_ledger", {
      rootPath: root,
      action: "add",
      ledger: ledgerPath,
      envelope: secondEnvelope
    });
    const report = await callMcpTool("sparkompass_envelope_ledger", {
      rootPath: root,
      action: "report",
      ledger: ledgerPath
    });

    assert.equal(first.schema, "EnvelopeLedgerWriteResultV1");
    assert.equal(first.entry.prefix_reuse_status, "not-compared");
    assert.equal(second.entry.prefix_reuse_status, "full-prefix-reusable");
    assert.equal(report.schema, "ContextEnvelopeLedgerV1");
    assert.equal(report.totals.entries, 2);
    assert.equal(report.totals.full_prefix_reuse_count, 1);
  });

  it("summarizes tool output through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-tool-output-"));
    const text = [
      "tests/test_auth.py::test_refresh_token FAILED",
      "ERROR E_AUTH_104 token refresh failed",
      "first failing frame: src/auth/token_service.py:117",
      "WARN retry repeated",
      "WARN retry repeated"
    ].join("\n");
    const summary = await callMcpTool("sparkompass_summarize_tool_output", {
      rootPath: root,
      text,
      command: "pytest -q",
      exitCode: 1,
      store: true
    });

    const evidence = await callMcpTool("sparkompass_load_tool_output", {
      rootPath: root,
      summary: summary.raw_ref.summary_path,
      pattern: "E_AUTH_104",
      contextLines: 1
    });

    assert.equal(summary.schema, "ToolOutputSummaryV1");
    assert.equal(summary.status.failed, true);
    assert.ok(summary.error_codes.includes("E_AUTH_104"));
    assert.ok(summary.affected_files.some((item) => item.file === "src/auth/token_service.py" && item.line === 117));
    assert.ok(summary.next_actions.some((action) => action.includes("summary_text")));
    assert.equal(evidence.schema, "ToolOutputEvidenceV1");
    assert.equal(evidence.hash_match, true);
    assert.match(evidence.text, /E_AUTH_104/);
  });

  it("summarizes direct tool output without storing raw text by default", async () => {
    const summary = await callMcpTool("sparkompass_summarize_tool_output", {
      text: [
        "tests/test_auth.py::test_refresh_token FAILED",
        "ERROR E_AUTH_104 token refresh failed",
        "first failing frame: src/auth/token_service.py:117",
        "WARN retry repeated",
        "WARN retry repeated"
      ].join("\n"),
      command: "pytest -q",
      exitCode: 1
    });

    assert.equal(summary.schema, "ToolOutputSummaryV1");
    assert.equal(summary.status.failed, true);
    assert.equal(summary.raw_ref.stored, false);
    assert.ok(summary.error_codes.includes("E_AUTH_104"));
    assert.ok(summary.affected_files.some((item) => item.file === "src/auth/token_service.py" && item.line === 117));
    assert.ok(summary.next_actions.some((action) => action.includes("summary_text")));
  });

  it("can include graph-aware context through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-plan-graph-"));
    await fs.writeFile(path.join(root, "main.mjs"), [
      "import { verifyToken } from \"./auth.mjs\";",
      "",
      "export function handleLogin(user) {",
      "  return verifyToken(user.token);",
      "}"
    ].join("\n"));
    await fs.writeFile(path.join(root, "auth.mjs"), [
      "export function verifyToken(token) {",
      "  return token === \"safe\";",
      "}"
    ].join("\n"));

    const plan = await callMcpTool("sparkompass_plan_context", {
      rootPath: root,
      goal: "handleLogin",
      budget: 80,
      includeGraph: true
    });
    const selected = [
      ...plan.lanes.immediate_context,
      ...plan.lanes.on_demand_evidence
    ];

    assert.equal(plan.graph.enabled, true);
    assert.ok(selected.some((unit) => unit.name === "verifyToken" && unit.graph_related));
  });

  it("creates a verified ContextPack receipt through the MCP tool layer", async () => {
    const pack = await callMcpTool("sparkompass_pack", {
      text: "AUTH_RESET_TOKEN_EXPIRED muss exakt erhalten bleiben.",
      riskProfile: "strict",
      targetPercent: 10,
      keep: ["AUTH_RESET_TOKEN_EXPIRED"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["AUTH_RESET_TOKEN_EXPIRED"],
      includeContext: true
    });

    assert.equal(pack.schema, "SparkompassPackToolResultV1");
    assert.equal(pack.receipt.schema, "ContextPackReceiptV1");
    assert.equal(pack.receipt.context_selection.policy.risk_profile, "strict");
    assert.equal(pack.receipt.context_selection.effective_target_percent, 50);
    assert.equal(pack.receipt.critical_anchors.retention_percent, 100);
    assert.equal(pack.receipt.acceptance_oracle.delivered.success, true);
    assert.match(pack.context.text, /AUTH_RESET_TOKEN_EXPIRED/);
  });

  it("auto-calibrates ContextPack target through the MCP tool layer", async () => {
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      ...Array.from({ length: 80 }, (_, index) => (
        `debug noise ${index} repeated filler text that can disappear safely`
      )),
      "Done when: Auth reset test passes"
    ].join("\n");
    const pack = await callMcpTool("sparkompass_pack", {
      text: source,
      autoTarget: true,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["src/auth/session\\.ts"],
      includeContext: true
    });

    assert.equal(pack.autoTarget.status, "verified-auto-target");
    assert.equal(pack.autoTarget.oracle_gate, "verified-oracle");
    assert.equal(pack.receipt.context_selection.auto_target.selected_target_percent, 10);
    assert.equal(pack.receipt.context_selection.auto_target.savings_gate, "verified-additional-saving");
    assert.equal(pack.receipt.context_selection.auto_target.selected_not_more_tokens_than_baseline, true);
    assert.ok(pack.receipt.context_selection.auto_target.additional_saved_tokens_vs_baseline > 0);
    assert.equal(pack.receipt.gate.status, "verified-publishable");
    assert.equal(pack.receipt.acceptance_oracle.delivered.success, true);
  });

  it("verifies a ContextPack receipt through the MCP tool layer", async () => {
    const text = "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts\nDone when: Auth reset test passes.";
    const pack = await callMcpTool("sparkompass_pack", {
      text,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      includeContext: true
    });
    const verification = await callMcpTool("sparkompass_verify_receipt", {
      receipt: pack.receipt,
      text,
      contextText: pack.context.text
    });

    assert.equal(verification.schema, "ContextPackReceiptVerificationV1");
    assert.equal(verification.verified, true);
    assert.equal(verification.checks.source_hash.status, "passed");
    assert.equal(verification.checks.delivered_context_hash.status, "passed");
  });

  it("verifies a registered ContextPack by id through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-contextpack-registry-"));
    await fs.writeFile(path.join(root, "auth.log"), [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes."
    ].join("\n"), "utf8");

    const pack = await callMcpTool("sparkompass_pack", {
      rootPath: root,
      file: "auth.log",
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      includeContext: true,
      storeInRegistry: true,
      registry: "registry.json"
    });
    const verification = await callMcpTool("sparkompass_verify_context_pack", {
      rootPath: root,
      contextPackId: pack.receipt.context_pack_id,
      registry: "registry.json"
    });

    assert.equal(pack.registry.schema, "ContextPackRegistryWriteResultV1");
    assert.equal(verification.schema, "ContextPackRegistryVerificationV1");
    assert.equal(verification.status, "verified-context-pack-id");
    assert.equal(verification.receipt_verification.status, "verified-receipt");
  });

  it("exposes and lints the ContextPack format through the MCP tool layer", async () => {
    const text = "ERROR E_FORMAT_104 in src/context-pack.mjs\nDone when: ContextPackFormatV1 lint passes.";
    const pack = await callMcpTool("sparkompass_pack", {
      text,
      keep: ["E_FORMAT_104"],
      expect: ["E_FORMAT_104"],
      expectRegex: ["ContextPackFormatV1"],
      includeContext: true
    });
    const format = await callMcpTool("sparkompass_contextpack_format", {
      action: "schema"
    });
    const validation = await callMcpTool("sparkompass_contextpack_format", {
      action: "lint",
      receipt: pack
    });

    assert.equal(format.schema, "ContextPackFormatV1");
    assert.equal(format.receipt_schema, "ContextPackReceiptV1");
    assert.equal(validation.schema, "ContextPackFormatValidationV1");
    assert.equal(validation.status, "verified-context-pack-format");
    assert.equal(validation.verified, true);
  });

  it("records a task outcome through the MCP tool layer", async () => {
    const text = "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts\nDone when: Auth reset test passes.";
    const pack = await callMcpTool("sparkompass_pack", {
      text,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      includeContext: true
    });
    const outcome = await callMcpTool("sparkompass_task_outcome", {
      command: "npm test",
      exitCode: 0,
      outputText: "PASS auth reset\nTASK_OK\n",
      expectOutput: ["TASK_OK"],
      receipt: pack.receipt,
      sourceText: text,
      contextText: pack.context.text
    });

    assert.equal(outcome.schema, "TaskOutcomeReceiptV1");
    assert.equal(outcome.gate.status, "verified-task-outcome");
    assert.equal(outcome.context_pack.receipt_verification.status, "verified-receipt");
    assert.equal(outcome.output_oracle.result.success, true);
  });

  it("records task outcome ledgers through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-task-ledger-"));
    const ledgerPath = path.join(root, "task-outcome-ledger.json");
    const outcome = await callMcpTool("sparkompass_task_outcome", {
      rootPath: root,
      command: "npm test",
      exitCode: 0,
      outputText: "TASK_OK\n",
      expectOutput: ["TASK_OK"]
    });
    const write = await callMcpTool("sparkompass_task_outcome_ledger", {
      rootPath: root,
      action: "add",
      ledger: ledgerPath,
      outcome
    });
    const report = await callMcpTool("sparkompass_task_outcome_ledger", {
      rootPath: root,
      action: "report",
      ledger: ledgerPath
    });

    assert.equal(write.schema, "TaskOutcomeLedgerWriteResultV1");
    assert.equal(report.schema, "TaskOutcomeLedgerV1");
    assert.equal(report.totals.entries, 1);
    assert.equal(report.totals.verified_tasks, 1);
    assert.ok(report.totals.output_tokens_per_verified_task > 0);
  });

  it("calibrates a verified target through the MCP tool layer", async () => {
    const calibration = await callMcpTool("sparkompass_calibrate_context", {
      text: "E_AUTH_104\nDEBUG noise\nDone when: safe",
      riskProfile: "strict",
      minTargetPercent: 10,
      keep: ["E_AUTH_104"],
      expect: ["E_AUTH_104"],
      expectRegex: ["Done when:\\s+safe"]
    });

    assert.equal(calibration.schema, "ContextCalibrationV1");
    assert.equal(calibration.status, "verified-calibration");
    assert.equal(calibration.verified, true);
    assert.equal(calibration.oracle_gate, "verified-oracle");
    assert.equal(calibration.explicit_oracle_present, true);
    assert.equal(calibration.policy.risk_profile, "strict");
    assert.equal(calibration.selected.effective_target_percent, 50);
    assert.equal(calibration.selected.acceptance_oracle_success, true);
  });

  it("records and reports savings through the MCP tool layer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-ledger-"));
    const ledgerPath = path.join(root, "ledger.json");
    const pack = await callMcpTool("sparkompass_pack", {
      text: "AUTH_RESET_TOKEN_EXPIRED muss exakt erhalten bleiben.",
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const add = await callMcpTool("sparkompass_savings_ledger", {
      rootPath: root,
      action: "add",
      ledger: ledgerPath,
      receipt: pack.receipt
    });
    const report = await callMcpTool("sparkompass_savings_ledger", {
      rootPath: root,
      action: "report",
      ledger: ledgerPath
    });

    assert.equal(add.schema, "SavingsLedgerWriteResultV1");
    assert.equal(report.schema, "SavingsLedgerV1");
    assert.equal(report.totals.entries, 1);
    assert.equal(report.entries[0].context_pack_id, pack.receipt.context_pack_id);
  });

  it("compares full and Sparkompass context through the MCP tool layer", async () => {
    const shadow = await callMcpTool("sparkompass_shadow_compare", {
      text: "ERROR AUTH_RESET_TOKEN_EXPIRED\nDone when: safe",
      keep: ["AUTH_RESET_TOKEN_EXPIRED"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"],
      expectRegex: ["Done when:\\s+safe"]
    });

    assert.equal(shadow.schema, "ShadowRunV1");
    assert.equal(shadow.gate.status, "verified-shadow");
    assert.equal(shadow.comparison.regression, false);
    assert.equal(shadow.comparison.oracle_sensitive, true);
    assert.ok(shadow.oracle.expectations.some((item) => item.type === "regex"));
  });

  it("expands a symbol neighborhood through the graph tool", async () => {
    const result = await callMcpTool("sparkompass_expand_symbol", {
      rootPath: ".",
      query: "compressText",
      limit: 20
    });

    assert.equal(result.schema, "SparkompassExpandSymbolToolResultV1");
    assert.ok(result.nodes.some((node) => node.name === "compressText"));
    assert.ok(result.totals.nodes > 0);
  });

  it("adds and verifies semantic cache entries through the MCP tool layer", async () => {
    const root = await makeMcpCacheFixture();
    const add = await callMcpTool("sparkompass_semantic_cache_add", {
      rootPath: root,
      query: "compressText",
      file: "code-sample.mjs",
      oracle: ["node --test"],
      expect: ["export function compressText"],
      keep: ["compressText"],
      toolVersion: ["node-test=1"],
      registry: "context-pack-registry.json"
    });
    assert.equal(add.schema, "VerifiedSemanticCacheAddResultV1");
    assert.equal(add.entry.tool_fingerprint.schema, "SemanticCacheToolFingerprintV1");
    assert.equal(add.entry.context_pack.registry.status, "registered-and-verified");

    const lookup = await callMcpTool("sparkompass_semantic_cache_lookup", {
      rootPath: root,
      query: "compressText",
      oracle: ["node --test"],
      expect: ["export function compressText"],
      toolVersion: ["node-test=1"]
    });
    assert.equal(lookup.schema, "VerifiedSemanticCacheLookupResultV1");
    assert.equal(lookup.hit, true);
    assert.equal(lookup.verification_policy.schema, "SemanticCacheVerificationPolicyV1");
    assert.equal(lookup.verification_policy.mode, "adaptive");
    assert.equal(lookup.best.verification.tool_fingerprint_ok, true);
    assert.equal(lookup.best.verification.context_pack_registry_ok, true);
    assert.equal(lookup.best.verification.context_pack_registry_status, "verified-context-pack-id");

    const mismatch = await callMcpTool("sparkompass_semantic_cache_lookup", {
      rootPath: root,
      query: "compressText",
      oracle: ["node --test"],
      expect: ["export function compressText"],
      toolVersion: ["node-test=2"]
    });
    assert.equal(mismatch.hit, false);
    assert.ok(mismatch.evaluated[0].verification.reasons.includes("tool-fingerprint-mismatch"));
  });

  it("builds a program slice through the MCP tool layer", async () => {
    const result = await callMcpTool("sparkompass_slice_symbol", {
      rootPath: ".",
      query: "compressText"
    });

    assert.equal(result.schema, "ProgramSliceV1");
    assert.equal(result.target.name, "compressText");
    assert.ok(result.evidence.source_hash.startsWith("sha256:"));
  });

  it("builds a data-flow trace through the MCP tool layer", async () => {
    const result = await callMcpTool("sparkompass_trace_flow", {
      rootPath: ".",
      query: "compressText",
      depth: 1
    });

    assert.equal(result.schema, "DataFlowTraceV1");
    assert.ok(result.nodes.some((node) => node.name === "compressText"));
    assert.ok(result.evidence.edge_hash.startsWith("sha256:"));
  });

  it("serves MCP initialize, tools/list, and tools/call over stdio", () => {
    const input = [
      rpc(1, "initialize", { protocolVersion: "2024-11-05" }),
      rpc(2, "tools/list", {}),
      rpc(3, "tools/call", {
        name: "sparkompass_lookup",
        arguments: {
          rootPath: "test/fixtures",
          query: "compressText",
          budget: 80
        }
      })
    ].join("\n");

    const result = spawnSync(process.execPath, [
      "bin/codex-sparkompass-mcp.mjs"
    ], {
      input: `${input}\n`,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    const byId = new Map(responses.map((response) => [response.id, response]));

    assert.equal(byId.get(1).result.serverInfo.name, "codex-sparkompass");
    assert.ok(byId.get(2).result.tools.some((tool) => tool.name === "sparkompass_load_evidence"));
    assert.ok(byId.get(2).result.tools.some((tool) => tool.name === "sparkompass_summarize_tool_output"));
    assert.ok(byId.get(2).result.tools.some((tool) => tool.name === "sparkompass_load_tool_output"));
    assert.equal(byId.get(3).result.structuredContent.schema, "SparkompassLookupToolResultV1");
    assert.ok(byId.get(3).result.structuredContent.selected_count > 0);
  });
});

async function makeMcpCacheFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-mcp-cache-"));
  await fs.writeFile(path.join(root, "code-sample.mjs"), [
    "export function compressText(input) {",
    "  return String(input).trim();",
    "}"
  ].join("\n"));
  return root;
}

function rpc(id, method, params) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params
  });
}
