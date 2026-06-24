import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildContextAblationAudit } from "./context-ablation.mjs";
import { buildContextEvidenceAudit } from "./evidence-audit.mjs";
import { buildContextInventory } from "./inventory.mjs";
import { buildContextPackFormat, validateContextPackFormat } from "./context-pack-format.mjs";
import { registerContextPack, verifyRegisteredContextPack } from "./context-pack-registry.mjs";
import { buildContextPack } from "./context-pack.mjs";
import { buildContextPlan } from "./context-plan.mjs";
import { buildContextSlimmingPlan } from "./context-slimming.mjs";
import { buildSparkompassExperimentEvidenceAudit } from "./experiment-evidence-audit.mjs";
import { buildSparkompassExperimentPlan } from "./experiment-plan.mjs";
import { buildSparkompassExperimentRun } from "./experiment-run.mjs";
import { buildSparkompassExperimentScript, writeSparkompassExperimentScript } from "./experiment-script.mjs";
import { buildSparkompassImpactReport } from "./impact-report.mjs";
import { buildPackageDryRunAudit, buildPackageInstallSmokeAudit } from "./package-audit.mjs";
import { buildPluginInstallSmokeAudit } from "./plugin-audit.mjs";
import { runPilot } from "./pilot-run.mjs";
import { buildPromptPreparation } from "./prompt-prepare.mjs";
import { appendPromptPreparationToLedger, buildPromptPreparationLedgerReport } from "./prompt-preparation-ledger.mjs";
import { buildSparkompassScorecard } from "./scorecard.mjs";
import { addSemanticCacheEntry, lookupSemanticCache } from "./semantic-cache.mjs";
import { loadSourceByHash } from "./source-hash.mjs";
import { recordTaskOutcome } from "./task-outcome.mjs";
import { formatNumber } from "./token-estimator.mjs";

const REQUIRED_MCP_TOOLS = [
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
];

export async function buildReleaseAudit(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const targetPercent = Number(options.targetPercent) || 35;
  const minSaving = Number(options.minSaving) || 35;
  const minAnchors = Number(options.minAnchors) || 75;
  const includePilot = options.includePilot !== false;
  const scorecard = await buildSparkompassScorecard(root, {
    targetPercent,
    minSaving,
    minAnchors,
    allowRisk: Boolean(options.allowRisk),
    savingsLedger: options.savingsLedger,
    taskOutcomeLedger: options.taskOutcomeLedger,
    envelopeLedger: options.envelopeLedger,
    handoffLedger: options.handoffLedger,
    promptPreparationLedger: options.promptPreparationLedger
  });
  const inventory = await buildContextInventory(root, {
    maxFiles: Number(options.maxFiles) || 300
  });
  const contextPlan = await buildContextPlan(root, {
    goal: "Codex Sparkompass Context-Control-Plane release evidence",
    file: ["src/context-plan.mjs"],
    budget: Number(options.planBudget) || 600,
    riskProfile: options.riskProfile || "balanced",
    maxFiles: Number(options.maxFiles) || 300
  });
  const evidenceAudit = await buildContextEvidenceAudit(root, {
    goal: "Codex Sparkompass Context-Control-Plane release evidence",
    file: ["src/context-plan.mjs"],
    budget: Number(options.planBudget) || 600,
    riskProfile: options.riskProfile || "balanced",
    maxFiles: Number(options.maxFiles) || 300,
    maxEvidence: Number(options.maxEvidence) || 220
  });
  const ablationAudit = await buildContextAblationAudit(root, {
    goal: "Codex Sparkompass Context-Control-Plane release evidence",
    file: ["src/context-plan.mjs"],
    expect: ["buildContextPlan"],
    budget: Number(options.planBudget) || 600,
    riskProfile: options.riskProfile || "balanced",
    maxFiles: Number(options.maxFiles) || 300,
    maxUnits: Number(options.maxUnits) || 120
  });
  const slimmingPlan = await buildContextSlimmingPlan(root, {
    goal: "Codex Sparkompass Context-Control-Plane release evidence",
    file: ["src/context-plan.mjs"],
    expect: ["buildContextPlan"],
    budget: Number(options.planBudget) || 600,
    riskProfile: options.riskProfile || "balanced",
    maxFiles: Number(options.maxFiles) || 300,
    maxUnits: Number(options.maxUnits) || 120,
    maxMoves: Number(options.maxMoves) || 24
  });
  const contextPackFormat = buildContextPackFormat();
  const formatProbePack = buildContextPack([
    "ERROR E_FORMAT_104 in src/context-pack.mjs",
    "ContextPackReceiptV1 must preserve E_FORMAT_104.",
    "Done when: ContextPackFormatV1 lint passes."
  ].join("\n"), {
    label: "release-audit-context-pack-format.txt",
    targetPercent: 35,
    keep: ["E_FORMAT_104", "ContextPackReceiptV1"],
    expect: ["E_FORMAT_104", "ContextPackReceiptV1"],
    expectRegex: ["ContextPackFormatV1"]
  });
  const contextPackFormatValidation = validateContextPackFormat(formatProbePack);
  const contextPackIdProbe = await buildContextPackIdProbe();
  const sourceHashProbe = await buildSourceHashProbe(root, inventory);
  const sourceHashContract = inspectSourceHashContract(contextPlan);
  const semanticCacheProbe = await buildSemanticCacheProbe();
  const promptPreparationProbe = await buildPromptPreparationProbe();
  const experimentPlanProbe = await buildExperimentPlanProbe();
  const experimentScriptProbe = await buildExperimentScriptProbe();
  const experimentEvidenceAuditProbe = await buildExperimentEvidenceAuditProbe();
  const experimentProbe = await buildExperimentProbe(root);
  const gatePath = await buildGatePathProbe(root, {
    experimentPlanProbe,
    experimentEvidenceAuditProbe,
    experimentProbe
  });
  const fallbackProbe = buildFallbackProbe();
  const mcp = await inspectMcpTools(root);
  const packageShape = await inspectPackageShape(root);
  const packageDryRun = await buildPackageDryRunAudit(root, {
    maxPackageSizeBytes: Number(options.maxPackageSizeBytes) || 1_000_000,
    maxUnpackedSizeBytes: Number(options.maxUnpackedSizeBytes) || 3_000_000,
    maxFiles: Number(options.maxPackageFiles) || 120
  });
  const packageInstallSmoke = await buildPackageInstallSmokeAudit(root, {
    keepTemp: Boolean(options.keepInstallSmokeTemp)
  });
  const pluginShape = await inspectPluginShape(root);
  const pluginInstallSmoke = await buildPluginInstallSmokeAudit(root, {
    keepTemp: Boolean(options.keepPluginSmokeTemp)
  });
  const pilot = includePilot
    ? await runPilot(root, {
      ledgerDir: options.ledgerDir || await createTempLedgerDir(),
      targetPercent,
      minSaving,
      minAnchors,
      riskProfile: options.riskProfile || "balanced",
      maxFiles: Number(options.maxFiles) || 300,
      maxPackFiles: options.maxPackFiles === undefined ? 1 : Number(options.maxPackFiles)
    })
    : null;
  const impactReport = pilot
    ? await buildSparkompassImpactReport(root, {
      savingsLedger: pilot.ledger_paths.savings,
      taskOutcomeLedger: pilot.ledger_paths.taskOutcome,
      handoffLedger: pilot.ledger_paths.handoff,
      promptPreparationLedger: pilot.ledger_paths.promptPreparation
    })
    : null;
  const requirements = buildRequirements({
    scorecard,
    inventory,
    contextPlan,
    evidenceAudit,
    ablationAudit,
    slimmingPlan,
    contextPackFormat,
    contextPackFormatValidation,
    contextPackIdProbe,
    sourceHashProbe,
    sourceHashContract,
    semanticCacheProbe,
    promptPreparationProbe,
    experimentPlanProbe,
    experimentScriptProbe,
    experimentEvidenceAuditProbe,
    experimentProbe,
    gatePath,
    impactReport,
    fallbackProbe,
    mcp,
    packageShape,
    packageDryRun,
    packageInstallSmoke,
    pluginShape,
    pluginInstallSmoke,
    pilot
  });
  const blockers = requirements.filter((item) => item.required && item.status !== "verified");
  const warnings = buildWarnings({ includePilot, pilot });

  return {
    schema: "SparkompassReleaseAuditV1",
    audit_id: `release-audit-${sha256(`${root}:${Date.now()}:${requirements.map((item) => item.status).join("|")}`).slice(0, 12)}`,
    root,
    generated_at: new Date().toISOString(),
    gate: {
      status: blockers.length ? "release-audit-needs-review" : "verified-release-audit",
      verified: blockers.length === 0,
      blockers: blockers.map((item) => item.id),
      warnings
    },
    requirements,
    metrics: {
      inventory_units: inventory.totals.units,
      decision_trace_status: contextPlan.decision_trace.status,
      evidence_audit_status: evidenceAudit.gate.status,
      ablation_audit_status: ablationAudit.gate.status,
      slimming_plan_status: slimmingPlan.gate.status,
      context_pack_format_status: contextPackFormatValidation.status,
      context_pack_id_verification_status: contextPackIdProbe.status,
      source_hash_evidence_status: sourceHashProbe.status,
      source_hash_contract_status: sourceHashContract.status,
      semantic_cache_tool_fingerprint_status: semanticCacheProbe.status,
      semantic_cache_registry_contract_status: semanticCacheProbe.registry_contract_status,
      prompt_preparation_status: promptPreparationProbe.status,
      prompt_preparation_sendable_savings_percent: promptPreparationProbe.sendable_prompt_savings_percent,
      prompt_preparation_ledger_entries: promptPreparationProbe.ledger_entries,
      prompt_preparation_ledger_savings_percent: promptPreparationProbe.ledger_sendable_savings_percent,
      experiment_plan_status: experimentPlanProbe.status,
      experiment_plan_runs: experimentPlanProbe.planned_runs,
      experiment_plan_repeat: experimentPlanProbe.repeat,
      experiment_script_status: experimentScriptProbe.status,
      experiment_script_codex_runs: experimentScriptProbe.codex_runs,
      experiment_script_task_outcomes: experimentScriptProbe.task_outcomes,
      experiment_script_executable: experimentScriptProbe.executable,
      experiment_evidence_audit_status: experimentEvidenceAuditProbe.status,
      experiment_evidence_audit_usage_verified_runs: experimentEvidenceAuditProbe.usage_verified_runs,
      experiment_evidence_audit_task_outcomes: experimentEvidenceAuditProbe.task_outcomes_verified,
      experiment_evidence_audit_prompt_hash_matches: experimentEvidenceAuditProbe.prompt_hash_matches,
      experiment_gate_status: experimentProbe.gate.status,
      experiment_router_mode: experimentProbe.router_recommendation.mode,
      experiment_net_product_gain_tokens: experimentProbe.effects.net_product_gain_tokens,
      experiment_efficiency_status: experimentProbe.efficiency?.status || "unknown",
      experiment_baseline_tokens_per_verified_task: experimentProbe.efficiency?.baseline_tokens_per_verified_task || 0,
      experiment_optimized_tokens_per_verified_task: experimentProbe.efficiency?.optimized_tokens_per_verified_task || 0,
      experiment_tokens_per_verified_task_saved: experimentProbe.efficiency?.tokens_per_verified_task_saved || 0,
      experiment_usage_invariant_verified_runs: experimentProbe.summary.usage_invariant_verified_runs,
      experiment_usage_invariant_failed_runs: experimentProbe.summary.usage_invariant_failed_runs,
      experiment_evidence_complete_runs: experimentProbe.summary.evidence_complete_runs,
      experiment_evidence_incomplete_runs: experimentProbe.summary.evidence_incomplete_runs,
      experiment_context_pack_hash_verified_runs: countExperimentKnownRequiredField(experimentProbe, "context_pack_hash"),
      experiment_task_outcomes: sumExperimentTaskOutcomes(experimentProbe, "task_outcome_runs"),
      experiment_verified_task_outcomes: sumExperimentTaskOutcomes(experimentProbe, "verified_task_outcomes"),
      gate_path_status: gatePath.status,
      gate_path_current_gate: gatePath.current_gate,
      gate_path_next_gate: gatePath.next_gate,
      gate_path_end_to_end_status: gatePath.end_to_end.status,
      mcp_tools: mcp.tools.length,
      package_dry_run_status: packageDryRun.status,
      package_dry_run_size_kb: packageDryRun.package.size_kb,
      package_dry_run_unpacked_size_kb: packageDryRun.package.unpacked_size_kb,
      package_dry_run_files: packageDryRun.package.file_count,
      package_install_smoke_status: packageInstallSmoke.status,
      package_install_smoke_mcp_tools: packageInstallSmoke.installed.mcp_tool_count,
      package_install_smoke_benchmark_cases: packageInstallSmoke.installed.benchmark_cases,
      plugin_install_smoke_status: pluginInstallSmoke.status,
      plugin_install_smoke_mcp_tools: pluginInstallSmoke.installed.mcp_tool_count,
      plugin_install_smoke_tool_call_ok: pluginInstallSmoke.installed.mcp_tool_call_ok,
      plugin_install_smoke_lookup_selected: pluginInstallSmoke.installed.mcp_lookup_selected,
      plugin_install_smoke_cache_tool_call_ok: pluginInstallSmoke.installed.cache_mcp_tool_call_ok,
      plugin_install_smoke_cache_lookup_selected: pluginInstallSmoke.installed.cache_mcp_lookup_selected,
      plugin_install_smoke_hook_ok: pluginInstallSmoke.installed.hook_advisory_ok,
      dogfood_p95_delivered_tokens: scorecard.metrics.dogfood.p95_delivered_tokens,
      benchmark_context_successes: scorecard.metrics.benchmark.context_successes,
      benchmark_cases: scorecard.metrics.benchmark.cases,
      benchmark_total_cost_tokens_per_verified_task: scorecard.metrics.benchmark.efficiency?.total_cost_tokens_per_verified_task || 0,
      benchmark_task_success_delta_percent: scorecard.metrics.benchmark.efficiency?.task_success_delta_percent || 0,
      pilot_context_tokens_per_verified_task: pilot?.metrics?.context_tokens_per_verified_task || 0,
      pilot_start_context_savings_percent: pilot?.metrics?.start_context_savings_percent || 0,
      pilot_sendable_prompt_savings_percent: pilot?.metrics?.sendable_prompt_savings_percent || 0,
      impact_status: impactReport?.gate?.status || "not-run",
      impact_combined_savings_percent: impactReport?.impact?.combined_savings_percent || 0,
      impact_sendable_prompt_savings_percent: impactReport?.impact?.sendable_prompt_savings_percent || 0
    },
    artifacts: {
      scorecard: summarizeScorecard(scorecard),
      inventory: summarizeInventory(inventory),
      context_plan: summarizeContextPlan(contextPlan),
      evidence_audit: summarizeEvidenceAudit(evidenceAudit),
      ablation_audit: summarizeAblationAudit(ablationAudit),
      slimming_plan: summarizeSlimmingPlan(slimmingPlan),
      context_pack_format: summarizeContextPackFormat(contextPackFormat, contextPackFormatValidation),
      context_pack_id_verification: contextPackIdProbe,
      source_hash_evidence: sourceHashProbe,
      source_hash_contract: sourceHashContract,
      semantic_cache: semanticCacheProbe,
      prompt_preparation: promptPreparationProbe,
      experiment_plan: experimentPlanProbe,
      experiment_script: experimentScriptProbe,
      experiment_evidence_audit: experimentEvidenceAuditProbe,
      experiment_probe: summarizeExperimentProbe(experimentProbe),
      gate_path: gatePath,
      impact_report: impactReport ? summarizeImpactReport(impactReport) : null,
      fallback_probe: fallbackProbe,
      mcp,
      package: packageShape,
      package_dry_run: summarizePackageDryRun(packageDryRun),
      package_install_smoke: summarizePackageInstallSmoke(packageInstallSmoke),
      plugin: pluginShape,
      plugin_install_smoke: summarizePluginInstallSmoke(pluginInstallSmoke),
      pilot: pilot ? summarizePilot(pilot) : null
    },
    caveats: [
      "This audit proves local release evidence, not publication to npm or the Codex Plugin Directory.",
      "Token counts are local estimates for planning, not billing data.",
      "The package dry run and install smoke use --ignore-scripts to avoid recursive prepack execution.",
      "The plugin install smoke copies the local plugin candidate and points its bridge scripts at local CLI/MCP entrypoints."
    ],
    next_actions: buildNextActions(blockers)
  };
}

export function formatReleaseAuditReport(audit) {
  const verified = audit.requirements.filter((item) => item.status === "verified").length;
  return `
# SparkompassReleaseAuditV1

Gate: ${audit.gate.status}
Pfad: ${audit.root}

- Anforderungen: ${formatNumber(verified)}/${formatNumber(audit.requirements.length)} verifiziert
- Inventar-Einheiten: ${formatNumber(audit.metrics.inventory_units)}
- Decision Trace: ${audit.metrics.decision_trace_status}
- Evidence Audit: ${audit.metrics.evidence_audit_status}
- Ablation Audit: ${audit.metrics.ablation_audit_status}
- Slimming Plan: ${audit.metrics.slimming_plan_status}
- ContextPack Format: ${audit.metrics.context_pack_format_status}
- ContextPack-ID Verify: ${audit.metrics.context_pack_id_verification_status}
- Source-Hash Evidence: ${audit.metrics.source_hash_evidence_status}
- Source-Hash Contract: ${audit.metrics.source_hash_contract_status}
- Semantic Cache Tool-Fingerprint: ${audit.metrics.semantic_cache_tool_fingerprint_status}
- Semantic Cache Registry: ${audit.metrics.semantic_cache_registry_contract_status}
- Prompt Preparation: ${audit.metrics.prompt_preparation_status}, sendbarer Prompt ${audit.metrics.prompt_preparation_sendable_savings_percent}% gespart, Ledger ${formatNumber(audit.metrics.prompt_preparation_ledger_entries)} Einträge
- Experiment Plan: ${audit.metrics.experiment_plan_status}, ${formatNumber(audit.metrics.experiment_plan_runs)} geplante Runs, Repeat ${formatNumber(audit.metrics.experiment_plan_repeat)}
- Experiment Script: ${audit.metrics.experiment_script_status}, Codex-Runs ${formatNumber(audit.metrics.experiment_script_codex_runs)}, TaskOutcomes ${formatNumber(audit.metrics.experiment_script_task_outcomes)}, ausführbar ${audit.metrics.experiment_script_executable ? "ja" : "nein"}
- Experiment Evidence Audit: ${audit.metrics.experiment_evidence_audit_status}, Usage ${formatNumber(audit.metrics.experiment_evidence_audit_usage_verified_runs)}/${formatNumber(audit.metrics.experiment_plan_runs)}, TaskOutcomes ${formatNumber(audit.metrics.experiment_evidence_audit_task_outcomes)}/${formatNumber(audit.metrics.experiment_plan_runs)}, Prompts ${formatNumber(audit.metrics.experiment_evidence_audit_prompt_hash_matches)}/${formatNumber(audit.metrics.experiment_plan_runs)}
- Experiment Probe: ${audit.metrics.experiment_gate_status}, Router ${audit.metrics.experiment_router_mode}, Usage-Invarianten ${formatNumber(audit.metrics.experiment_usage_invariant_verified_runs)}/${formatNumber(audit.artifacts.experiment_probe.manifests)}, Metadaten ${formatNumber(audit.metrics.experiment_evidence_complete_runs)}/${formatNumber(audit.artifacts.experiment_probe.manifests)}, ContextPack-Hash ${formatNumber(audit.metrics.experiment_context_pack_hash_verified_runs)}/${formatNumber(audit.artifacts.experiment_probe.manifests)}, TaskOutcomes ${formatNumber(audit.metrics.experiment_verified_task_outcomes)}/${formatNumber(audit.metrics.experiment_task_outcomes)}, Effizienz ${audit.metrics.experiment_efficiency_status} (${formatNumber(audit.metrics.experiment_optimized_tokens_per_verified_task)} Tokens/verifiziertem Task)
- Gate-Pfad: ${audit.metrics.gate_path_status}, aktuell ${audit.metrics.gate_path_current_gate}, nächstes Gate ${audit.metrics.gate_path_next_gate} (${audit.metrics.gate_path_end_to_end_status})
- Impact Report: ${audit.metrics.impact_status}, kombiniert ${audit.metrics.impact_combined_savings_percent}% Ersparnis, sendbarer Prompt ${audit.metrics.impact_sendable_prompt_savings_percent}%
- MCP-Tools: ${formatNumber(audit.metrics.mcp_tools)}
- Package Dry Run: ${audit.metrics.package_dry_run_status}, ${audit.metrics.package_dry_run_size_kb} kB Package, ${audit.metrics.package_dry_run_unpacked_size_kb} kB entpackt, ${formatNumber(audit.metrics.package_dry_run_files)} Dateien
- Package Install Smoke: ${audit.metrics.package_install_smoke_status}, MCP ${formatNumber(audit.metrics.package_install_smoke_mcp_tools)} Tools, Benchmark ${formatNumber(audit.metrics.package_install_smoke_benchmark_cases)} Fälle
- Plugin Install Smoke: ${audit.metrics.plugin_install_smoke_status}, MCP ${formatNumber(audit.metrics.plugin_install_smoke_mcp_tools)} Tools, Tool-Call ${audit.metrics.plugin_install_smoke_tool_call_ok ? "ok" : "needs-review"}, Cache-Tool-Call ${audit.metrics.plugin_install_smoke_cache_tool_call_ok ? "ok" : "needs-review"}, Lookup ${formatNumber(audit.metrics.plugin_install_smoke_lookup_selected)}/${formatNumber(audit.metrics.plugin_install_smoke_cache_lookup_selected)} Treffer, Hook ${audit.metrics.plugin_install_smoke_hook_ok ? "ok" : "needs-review"}
- Benchmark: ${formatNumber(audit.metrics.benchmark_context_successes)}/${formatNumber(audit.metrics.benchmark_cases)} Kontext-Erfolge
- Benchmark-Effizienz: ${formatNumber(audit.metrics.benchmark_total_cost_tokens_per_verified_task)} Tokens/verifiziertem Task, Delta ${audit.metrics.benchmark_task_success_delta_percent}%
- Dogfood p95 geliefert: ${formatNumber(audit.metrics.dogfood_p95_delivered_tokens)} Tokens
- Pilot Context-Tokens/verifiziertem Task: ${formatNumber(audit.metrics.pilot_context_tokens_per_verified_task)}
- Pilot Startkontext-Ersparnis: ${audit.metrics.pilot_start_context_savings_percent}%
- Pilot sendbare Prompt-Ersparnis: ${audit.metrics.pilot_sendable_prompt_savings_percent}%

## Anforderungen

${audit.requirements.map(formatRequirement).join("\n")}

## Blocker

${audit.gate.blockers.length ? audit.gate.blockers.map((item) => `- ${item}`).join("\n") : "- keine"}

## Hinweise

${audit.gate.warnings.length ? audit.gate.warnings.map((item) => `- ${item}`).join("\n") : "- keine"}

## Nächste Schritte

${audit.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

function buildRequirements({ scorecard, inventory, contextPlan, evidenceAudit, ablationAudit, slimmingPlan, contextPackFormat, contextPackFormatValidation, contextPackIdProbe, sourceHashProbe, sourceHashContract, semanticCacheProbe, promptPreparationProbe, experimentPlanProbe, experimentScriptProbe, experimentEvidenceAuditProbe, experimentProbe, gatePath, impactReport, fallbackProbe, mcp, packageShape, packageDryRun, packageInstallSmoke, pluginShape, pluginInstallSmoke, pilot }) {
  const benchmarkQuality = scorecard.metrics.benchmark.context_pack_quality;
  const failureCoverage = scorecard.metrics.benchmark.failure_corpus_coverage;
  return [
    requirement({
      id: "context-control-plane",
      label: "Context-Control-Plane statt reine Kompression",
      passed: scorecard.release_readiness.verified
        && mcp.has_required_context_control_tools,
      evidence: `scorecard=${scorecard.release_readiness.status}, mcp-context-tools=${mcp.missing_required_context_control_tools.length ? "missing" : "complete"}`
    }),
    requirement({
      id: "semantic-inventory",
      label: "Semantisches Inventar und budgetiertes Nachladen",
      passed: inventory.totals.units > 0
        && mcp.tools.includes("sparkompass_inventory")
        && mcp.tools.includes("sparkompass_lookup"),
      evidence: `${inventory.totals.units} units, inventory/lookup tools present`
    }),
    requirement({
      id: "decision-trace-and-reviewability",
      label: "Kontextentscheidungen mit Decision Trace nachvollziehbar",
      passed: contextPlan.gate.verified
        && contextPlan.decision_trace?.verified
        && contextPlan.decision_trace?.schema === "ContextDecisionTraceV1",
      evidence: `plan=${contextPlan.gate.status}, trace=${contextPlan.decision_trace?.status}, immediate=${contextPlan.decision_trace?.coverage?.immediate_units ?? 0}, deferred=${contextPlan.decision_trace?.coverage?.deferred_units ?? 0}`
    }),
    requirement({
      id: "evidence-load-verification",
      label: "Geplante Belege hashgenau nachladbar",
      passed: evidenceAudit.gate.verified
        && evidenceAudit.schema === "ContextEvidenceAuditV1"
        && evidenceAudit.totals.evidence_checked > 0,
      evidence: `audit=${evidenceAudit.gate.status}, checked=${evidenceAudit.totals.evidence_checked}/${evidenceAudit.totals.evidence_total}, failed=${evidenceAudit.totals.failed}`
    }),
    requirement({
      id: "source-hash-raw-retrieval",
      label: "Quellrohdaten per Hash begrenzt nachladbar",
      passed: sourceHashProbe.verified
        && sourceHashProbe.schema === "SourceHashEvidenceProbeV1"
        && sourceHashContract.verified
        && mcp.tools.includes("sparkompass_load_source_hash"),
      evidence: `source_hash=${sourceHashProbe.status}, contract=${sourceHashContract.status}, file=${sourceHashProbe.file || "n/a"}, line=${sourceHashProbe.line || "n/a"}`
    }),
    requirement({
      id: "planned-context-ablation",
      label: "Geplanter Sofortkontext gegen Oracle ablatierbar",
      passed: ablationAudit.gate.verified
        && ablationAudit.schema === "ContextAblationAuditV1"
        && ablationAudit.totals.checked_units > 0
        && ablationAudit.oracle.counterfactuals_detected === ablationAudit.oracle.counterfactuals,
      evidence: `audit=${ablationAudit.gate.status}, critical=${ablationAudit.totals.oracle_critical_units}, safe=${ablationAudit.totals.ablation_safe_candidates}, counterfactuals=${ablationAudit.oracle.counterfactuals_detected}/${ablationAudit.oracle.counterfactuals}`
    }),
    requirement({
      id: "ablation-driven-slimming",
      label: "Ablation-sichere Einheiten als On-Demand-Vorschlag nutzbar",
      passed: slimmingPlan.gate.verified
        && slimmingPlan.schema === "ContextSlimmingPlanV1"
        && slimmingPlan.proposal.move_to_on_demand.length > 0
        && slimmingPlan.budget.additional_saved_tokens > 0,
      evidence: `slim=${slimmingPlan.gate.status}, moved=${slimmingPlan.proposal.move_to_on_demand.length}, extra_saved=${slimmingPlan.budget.additional_saved_tokens}`
    }),
    requirement({
      id: "open-contextpack-format",
      label: "Offenes ContextPack-Receipt-Format lintbar",
      passed: contextPackFormat.schema === "ContextPackFormatV1"
        && contextPackFormat.receipt_schema === "ContextPackReceiptV1"
        && contextPackFormatValidation.verified
        && contextPackFormatValidation.schema === "ContextPackFormatValidationV1"
        && mcp.tools.includes("sparkompass_contextpack_format"),
      evidence: `format=${contextPackFormat.status}, lint=${contextPackFormatValidation.status}, failed=${contextPackFormatValidation.summary.failed_checks}`
    }),
    requirement({
      id: "context-pack-id-verification",
      label: "ContextPacks per ID registrierbar und prüfbar",
      passed: contextPackIdProbe.verified
        && contextPackIdProbe.schema === "ContextPackIdVerificationProbeV1"
        && mcp.tools.includes("sparkompass_verify_context_pack"),
      evidence: `id_probe=${contextPackIdProbe.status}, receipt=${contextPackIdProbe.receipt_verification_status}, registry_entry=${contextPackIdProbe.registry_entry_id || "n/a"}`
    }),
    requirement({
      id: "user-impact-report",
      label: "Nutzerwirkung aus Ledgers als Gate sichtbar",
      passed: Boolean(impactReport?.gate?.verified)
        && impactReport.schema === "SparkompassImpactReportV1"
        && Number(impactReport.quality.verified_tasks) > 0
        && Number(impactReport.quality.verified_prompt_preparations) > 0
        && Number(impactReport.impact.combined_saved_tokens) > 0
        && Number(impactReport.impact.sendable_prompt_saved_tokens) > 0,
      evidence: impactReport
        ? `impact=${impactReport.gate.status}, combined=${impactReport.impact.combined_savings_percent}%, sendable_prompt=${impactReport.impact.sendable_prompt_savings_percent}%, prompts=${impactReport.quality.verified_prompt_preparations}, tasks=${impactReport.quality.verified_tasks}`
        : "impact skipped"
    }),
    requirement({
      id: "critical-anchors-100",
      label: "Kritische Anker zu 100% erhalten",
      passed: scorecard.metrics.dogfood.minimum_critical_anchor_retention_percent === 100
        && benchmarkQuality?.minimum_critical_anchor_retention_percent === 100,
      evidence: `dogfood=${scorecard.metrics.dogfood.minimum_critical_anchor_retention_percent}%, benchmark=${benchmarkQuality?.minimum_critical_anchor_retention_percent ?? "n/a"}%`
    }),
    requirement({
      id: "source-evidence-and-receipts",
      label: "Quellbelege und ContextPack Receipts",
      passed: scorecard.metrics.dogfood.minimum_source_evidence_coverage_percent === 100
        && Boolean(benchmarkQuality?.verified)
        && mcp.tools.includes("sparkompass_pack")
        && mcp.tools.includes("sparkompass_verify_receipt"),
      evidence: `dogfood evidence=${scorecard.metrics.dogfood.minimum_source_evidence_coverage_percent}%, benchmark quality=${benchmarkQuality?.verified ? "verified" : "needs-review"}`
    }),
    requirement({
      id: "fallback-on-uncertainty",
      label: "Unsichere Verdichtung erweitert oder fällt auf Vollkontext zurück",
      passed: fallbackProbe.expanded.status === "verified-expanded-context"
        && fallbackProbe.full.status === "fallback-full-context",
      evidence: `expanded=${fallbackProbe.expanded.status}, full=${fallbackProbe.full.status}`
    }),
    requirement({
      id: "task-success-and-regression-gates",
      label: "Dogfood/Benchmark-Gates mit Task-Erfolg und Regressionen",
      passed: scorecard.gates.dogfood.verified
        && scorecard.gates.benchmark.verified
        && scorecard.gates.task_outcome.verified
        && scorecard.metrics.benchmark.regressions === 0,
      evidence: `dogfood=${scorecard.gates.dogfood.status}, benchmark=${scorecard.gates.benchmark.status}, task=${scorecard.gates.task_outcome.verified_count}/${scorecard.gates.task_outcome.total}, regressions=${scorecard.metrics.benchmark.regressions}, cost_per_verified_task=${scorecard.metrics.benchmark.efficiency?.total_cost_tokens_per_verified_task || 0}`
    }),
    requirement({
      id: "failure-corpus-and-counterfactuals",
      label: "Failure-Corpus und Gegenfakten-Sensitivitaet",
      passed: Boolean(failureCoverage?.verified)
        && scorecard.metrics.benchmark.counterfactuals_detected === scorecard.metrics.benchmark.counterfactuals,
      evidence: `failure=${failureCoverage?.verified_classes?.length ?? 0}/${failureCoverage?.required_classes?.length ?? 0}, counterfactuals=${scorecard.metrics.benchmark.counterfactuals_detected}/${scorecard.metrics.benchmark.counterfactuals}`
    }),
    requirement({
      id: "interactive-context-tools",
      label: "Interaktive Kontextwerkzeuge für Codex",
      passed: mcp.missing_required_tools.length === 0,
      evidence: `${mcp.tools.length} tools, missing=${mcp.missing_required_tools.join(",") || "none"}`
    }),
    requirement({
      id: "delta-context-and-semantic-cache",
      label: "Delta-Kontext und verifiziertes semantisches Caching vorbereitet",
      passed: mcp.tools.includes("sparkompass_cache_write")
        && mcp.tools.includes("sparkompass_delta")
        && mcp.tools.includes("sparkompass_semantic_cache_add")
        && mcp.tools.includes("sparkompass_semantic_cache_lookup")
        && semanticCacheProbe.verified,
      evidence: `cache/delta/semantic-cache MCP tools present, tool_fingerprint=${semanticCacheProbe.status}, mismatch_blocked=${semanticCacheProbe.mismatch_blocked}`
    }),
    requirement({
      id: "semantic-cache-contextpack-registry",
      label: "Semantic-Cache-Hits prüfen registrierte ContextPack-IDs",
      passed: semanticCacheProbe.registry_contract_verified
        && semanticCacheProbe.registry_contract_status === "verified-semantic-cache-registry-contract",
      evidence: `registry=${semanticCacheProbe.registry_contract_status}, context_pack=${semanticCacheProbe.context_pack_id || "n/a"}, receipt=${semanticCacheProbe.registry_receipt_verification_status || "n/a"}`
    }),
    requirement({
      id: "prompt-preparation-verified-handoff",
      label: "Große Prompts als belegte kompakte Handoffs vorbereitbar",
      passed: promptPreparationProbe.verified
        && promptPreparationProbe.status === "verified-prompt-preparation"
        && promptPreparationProbe.ledger_status === "verified-prompt-preparation-ledger"
        && mcp.tools.includes("sparkompass_prepare_prompt")
        && mcp.tools.includes("sparkompass_prompt_preparation_ledger"),
      evidence: `prompt=${promptPreparationProbe.status}, ledger=${promptPreparationProbe.ledger_status}, context_pack=${promptPreparationProbe.context_pack_id}, sendable_savings=${promptPreparationProbe.sendable_prompt_savings_percent}%`
    }),
    requirement({
      id: "official-usage-experiment-plan",
      label: "Echte Vierarm-Codex-Messlaeufe reproduzierbar planbar",
      passed: experimentPlanProbe.verified
        && experimentPlanProbe.schema === "SparkompassExperimentPlanProbeV1"
        && experimentPlanProbe.plan_schema === "SparkompassExperimentPlanV1"
        && experimentPlanProbe.planned_runs === 12
        && experimentPlanProbe.repeat === 3
        && experimentPlanProbe.commands_include_require_metadata,
      evidence: `plan=${experimentPlanProbe.status}, runs=${experimentPlanProbe.planned_runs}, repeat=${experimentPlanProbe.repeat}, require_metadata=${experimentPlanProbe.commands_include_require_metadata ? "yes" : "no"}`
    }),
    requirement({
      id: "official-usage-experiment-script",
      label: "Geplante Vierarm-Codex-Messlaeufe als ausfuehrbares Runbook erzeugbar",
      passed: experimentScriptProbe.verified
        && experimentScriptProbe.schema === "SparkompassExperimentScriptProbeV1"
        && experimentScriptProbe.script_schema === "SparkompassExperimentScriptV1"
        && experimentScriptProbe.codex_runs === 12
        && experimentScriptProbe.task_outcomes === 12
        && experimentScriptProbe.includes_experiment_audit
        && experimentScriptProbe.audit_before_experiment_run
        && experimentScriptProbe.executable,
      evidence: `script=${experimentScriptProbe.status}, runs=${experimentScriptProbe.codex_runs}, tasks=${experimentScriptProbe.task_outcomes}, audit_before_run=${experimentScriptProbe.audit_before_experiment_run ? "yes" : "no"}, executable=${experimentScriptProbe.executable ? "yes" : "no"}`
    }),
    requirement({
      id: "official-usage-experiment-evidence-audit",
      label: "Geplante Codex-Usage-Artefakte vor ExperimentRun pruefbar",
      passed: experimentEvidenceAuditProbe.verified
        && experimentEvidenceAuditProbe.schema === "SparkompassExperimentEvidenceAuditProbeV1"
        && experimentEvidenceAuditProbe.audit_schema === "SparkompassExperimentEvidenceAuditV1"
        && experimentEvidenceAuditProbe.planned_runs === 12
        && experimentEvidenceAuditProbe.usage_verified_runs === 12
        && experimentEvidenceAuditProbe.usage_invariant_verified_runs === 12
        && experimentEvidenceAuditProbe.task_outcomes_verified === 12
        && experimentEvidenceAuditProbe.prompt_hash_matches === 12,
      evidence: `audit=${experimentEvidenceAuditProbe.status}, usage=${experimentEvidenceAuditProbe.usage_verified_runs}/${experimentEvidenceAuditProbe.planned_runs}, invariants=${experimentEvidenceAuditProbe.usage_invariant_verified_runs}/${experimentEvidenceAuditProbe.planned_runs}, tasks=${experimentEvidenceAuditProbe.task_outcomes_verified}/${experimentEvidenceAuditProbe.planned_runs}, prompts=${experimentEvidenceAuditProbe.prompt_hash_matches}/${experimentEvidenceAuditProbe.planned_runs}`
    }),
    requirement({
      id: "official-usage-experiment-router",
      label: "Vierarmige Usage-Matrix mit TaskOutcome-Qualitätsgate und Router",
      passed: experimentProbe.schema === "SparkompassExperimentRunV1"
        && experimentProbe.gate.status === "quality-noninferior"
        && experimentProbe.router_recommendation?.mode === "compact"
        && experimentProbe.matrix?.length === 4
        && experimentProbe.summary?.usage_invariant_verified_runs === experimentProbe.summary?.runs
        && experimentProbe.summary?.evidence_complete_runs === experimentProbe.summary?.runs
        && countExperimentKnownRequiredField(experimentProbe, "context_pack_hash") === experimentProbe.summary?.runs
        && sumExperimentTaskOutcomes(experimentProbe, "verified_task_outcomes") >= 2
        && experimentProbe.efficiency?.status === "verified-task-efficiency"
        && Number(experimentProbe.efficiency?.tokens_per_verified_task_saved) > 0,
      evidence: `experiment=${experimentProbe.gate.status}, router=${experimentProbe.router_recommendation?.mode}, net_gain=${experimentProbe.effects.net_product_gain_tokens}, usage_invariants=${experimentProbe.summary?.usage_invariant_verified_runs}/${experimentProbe.summary?.runs}, metadata=${experimentProbe.summary?.evidence_complete_runs}/${experimentProbe.summary?.runs}, context_pack_hash=${countExperimentKnownRequiredField(experimentProbe, "context_pack_hash")}/${experimentProbe.summary?.runs}, task_outcomes=${sumExperimentTaskOutcomes(experimentProbe, "verified_task_outcomes")}/${sumExperimentTaskOutcomes(experimentProbe, "task_outcome_runs")}, task_efficiency=${experimentProbe.efficiency?.status}, tokens_per_verified_task=${experimentProbe.efficiency?.optimized_tokens_per_verified_task}, saved_per_verified_task=${experimentProbe.efficiency?.tokens_per_verified_task_saved}`
    }),
    requirement({
      id: "verified-end-to-end-noninferior-gate-prepared",
      label: "Gate-Pfad bis verified-end-to-end-noninferior vorbereitet",
      passed: gatePath.schema === "SparkompassGatePathV1"
        && gatePath.status === "verified-gate-path-prepared"
        && gatePath.official_usage_comparison.status === "verified-codex-official-usage-comparison"
        && gatePath.quality_noninferior.status === "quality-noninferior"
        && gatePath.end_to_end.status === "end-to-end-noninferior-prepared"
        && gatePath.end_to_end.next_gate === "verified-end-to-end-noninferior"
        && gatePath.end_to_end.required_evidence.length > 0,
      evidence: `baseline=${gatePath.official_usage_comparison.status}:${gatePath.official_usage_comparison.total_tokens_saved} saved, current=${gatePath.quality_noninferior.status}, next=${gatePath.end_to_end.next_gate}, missing=${gatePath.end_to_end.missing_evidence.length}`
    }),
    requirement({
      id: "pilot-ledger-measurement",
      label: "Tokens pro verifiziertem Task über Ledger messbar",
      passed: Boolean(pilot?.gate?.verified)
        && Number(pilot?.metrics?.verified_tasks) > 0
        && Number(pilot?.metrics?.verified_prompt_preparations) > 0
        && Number(pilot?.metrics?.context_tokens_per_verified_task) > 0,
      evidence: pilot
        ? `pilot=${pilot.gate.status}, tasks=${pilot.metrics.verified_tasks}, prompts=${pilot.metrics.verified_prompt_preparations}, context_tokens_per_task=${pilot.metrics.context_tokens_per_verified_task}`
        : "pilot skipped"
    }),
    requirement({
      id: "local-plugin-candidate",
      label: "Lokaler Codex-Plugin-Kandidat mit Skill, MCP und Hook",
      passed: pluginShape.verified,
      evidence: pluginShape.summary
    }),
    requirement({
      id: "plugin-install-smoke",
      label: "Plugin-Kandidat als frische Kopie startbar",
      passed: pluginInstallSmoke.verified,
      evidence: `plugin_smoke=${pluginInstallSmoke.status}, cli=${pluginInstallSmoke.installed.cli_bridge_ok ? "ok" : "needs-review"}, mcp_tools=${pluginInstallSmoke.installed.mcp_tool_count}, tool_call=${pluginInstallSmoke.installed.mcp_tool_call_ok ? "ok" : "needs-review"}, cache_tool_call=${pluginInstallSmoke.installed.cache_mcp_tool_call_ok ? "ok" : "needs-review"}, hook=${pluginInstallSmoke.installed.hook_advisory_ok ? "ok" : "needs-review"}`
    }),
    requirement({
      id: "package-shape",
      label: "Paketform für CLI, MCP, Docs und Plugin",
      passed: packageShape.verified,
      evidence: packageShape.summary
    }),
    requirement({
      id: "package-dry-run",
      label: "NPM-Paketinhalt per Dry-Run verifiziert",
      passed: packageDryRun.verified,
      evidence: `dry_run=${packageDryRun.status}, files=${packageDryRun.package.file_count}, size=${packageDryRun.package.size_kb}kB, unpacked=${packageDryRun.package.unpacked_size_kb}kB, forbidden=${packageDryRun.forbidden_paths.length}`
    }),
    requirement({
      id: "package-install-smoke",
      label: "Gepacktes Paket in frischer Installation startbar",
      passed: packageInstallSmoke.verified,
      evidence: `install=${packageInstallSmoke.status}, cli=${packageInstallSmoke.installed.cli_doctor_ok ? "ok" : "needs-review"}, benchmark=${packageInstallSmoke.installed.benchmark_gate}, mcp_tools=${packageInstallSmoke.installed.mcp_tool_count}`
    })
  ];
}

function requirement({ id, label, passed, evidence, required = true }) {
  return {
    id,
    label,
    required,
    status: passed ? "verified" : "needs-review",
    evidence
  };
}

function buildFallbackProbe() {
  const expandedSource = [
    "AUTH_RESET_TOKEN_EXPIRED bleibt als kritischer Anker erhalten.",
    ...Array.from({ length: 24 }, (_, index) => (
      `Optionaler Hinweis "--variant-${index}" mit viel erklärendem Fülltext.`
    ))
  ].join("\n");
  const expected = "ordinary sentence should be expected";
  const fullSource = [
    "IMPORTANT_ANCHOR survives",
    ...Array.from({ length: 100 }, (_, index) => (
      index === 73
        ? expected
        : `noise ${index} with filler text that can be removed and does not matter`
    ))
  ].join("\n");
  const expanded = buildContextPack(expandedSource, {
    label: "release-audit-expanded-probe.txt",
    targetPercent: 10,
    keep: ["AUTH_RESET_TOKEN_EXPIRED"]
  });
  const full = buildContextPack(fullSource, {
    label: "release-audit-full-probe.txt",
    targetPercent: 10,
    expansionTargets: [],
    keep: ["IMPORTANT_ANCHOR"],
    expect: [expected]
  });

  return {
    schema: "SparkompassFallbackProbeV1",
    expanded: {
      status: expanded.receipt.gate.status,
      mode: expanded.fallbackMode,
      reasons: expanded.fallbackReasons
    },
    full: {
      status: full.receipt.gate.status,
      mode: full.fallbackMode,
      reasons: full.fallbackReasons
    }
  };
}

async function buildContextPackIdProbe() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-context-pack-id-probe-"));
  const source = [
    "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
    "ContextPackRegistryV1 must verify by context_pack_id.",
    "Done when: registered ContextPack verifies."
  ].join("\n");
  await fs.writeFile(path.join(probeRoot, "auth.log"), source, "utf8");
  const pack = buildContextPack(source, {
    label: "auth.log",
    targetPercent: 35,
    keep: ["AUTH_RESET_TOKEN_EXPIRED", "ContextPackRegistryV1"],
    expect: ["AUTH_RESET_TOKEN_EXPIRED", "ContextPackRegistryV1"]
  });
  const write = await registerContextPack(probeRoot, pack, {
    sourceFile: "auth.log",
    registry: "context-pack-registry.json"
  });
  const verification = await verifyRegisteredContextPack(probeRoot, {
    registry: "context-pack-registry.json",
    contextPackId: pack.receipt.context_pack_id
  });

  return {
    schema: "ContextPackIdVerificationProbeV1",
    verified: verification.verified,
    status: verification.verified ? "verified-context-pack-id" : "context-pack-id-needs-review",
    context_pack_id: pack.receipt.context_pack_id,
    registry_entry_id: write.entry.entry_id,
    source_file: write.entry.source.file,
    receipt_verification_status: verification.receipt_verification?.status || "not-run",
    registry_checks: verification.registry_checks.map((check) => ({
      name: check.name,
      status: check.status,
      reason: check.reason
    })),
    failures: verification.failures
  };
}

async function buildSemanticCacheProbe() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-semantic-cache-probe-"));
  try {
    await fs.mkdir(path.join(probeRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(probeRoot, "src/probe.mjs"), [
      "export function semanticCacheProbe() {",
      "  return \"cache\";",
      "}"
    ].join("\n"), "utf8");

    const add = await addSemanticCacheEntry(probeRoot, {
      query: "semanticCacheProbe",
      file: "src/probe.mjs",
      oracle: ["node --test"],
      expect: ["semanticCacheProbe"],
      toolVersion: ["node-test=1"],
      registry: "context-pack-registry.json"
    });
    const hit = await lookupSemanticCache(probeRoot, {
      query: "semanticCacheProbe",
      oracle: ["node --test"],
      expect: ["semanticCacheProbe"],
      toolVersion: ["node-test=1"]
    });
    const mismatch = await lookupSemanticCache(probeRoot, {
      query: "semanticCacheProbe",
      oracle: ["node --test"],
      expect: ["semanticCacheProbe"],
      toolVersion: ["node-test=2"]
    });
    const mismatchBlocked = !mismatch.hit
      && mismatch.evaluated.some((item) => item.verification.reasons.includes("tool-fingerprint-mismatch"));
    const registryContractVerified = Boolean(hit.best?.verification?.context_pack_registry_ok)
      && hit.best?.verification?.context_pack_registry_status === "verified-context-pack-id";

    return {
      schema: "SemanticCacheToolFingerprintProbeV1",
      status: hit.hit && mismatchBlocked ? "verified-semantic-cache-tool-fingerprint" : "semantic-cache-tool-fingerprint-needs-review",
      verified: Boolean(hit.hit && mismatchBlocked && registryContractVerified),
      hit_verified: hit.hit,
      mismatch_blocked: mismatchBlocked,
      registry_contract_status: registryContractVerified ? "verified-semantic-cache-registry-contract" : "semantic-cache-registry-contract-needs-review",
      registry_contract_verified: registryContractVerified,
      context_pack_id: add.entry.context_pack.context_pack_id,
      registry_contract_schema: add.entry.context_pack.registry.schema,
      registry_receipt_verification_status: hit.best?.verification?.context_pack_registry?.receipt_verification_status || "not-run",
      tool_fingerprint_schema: add.entry.tool_fingerprint.schema,
      tool_fingerprint_hash: add.entry.tool_fingerprint.fingerprint_hash,
      current_tool_fingerprint_hash: hit.current.tool_fingerprint_hash,
      mismatch_reasons: mismatch.evaluated.flatMap((item) => item.verification.reasons)
    };
  } finally {
    await fs.rm(probeRoot, { recursive: true, force: true });
  }
}

async function buildPromptPreparationProbe() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-prompt-preparation-probe-"));
  const source = [
    "# Ziel",
    "Bitte behebe AUTH_RESET_TOKEN_EXPIRED in src/auth/session.mjs.",
    "Done when: npm test ist grün und der Auth-Reset-Test bleibt stabil.",
    ...Array.from({ length: 80 }, (_, index) => (
      `Hintergrundnotiz ${index}: allgemeiner Verlauf ohne neue Entscheidung.`
    ))
  ].join("\n");
  const preparation = buildPromptPreparation(source, {
    label: "release-audit-prompt-preparation.txt",
    goal: "Auth-Reset reparieren",
    keep: ["AUTH_RESET_TOKEN_EXPIRED"],
    expect: ["AUTH_RESET_TOKEN_EXPIRED"]
  });
  const ledgerWrite = await appendPromptPreparationToLedger(probeRoot, preparation, {
    out: "prompt-preparation-ledger.json",
    runType: "release-audit"
  });
  const ledger = await buildPromptPreparationLedgerReport(probeRoot, {
    ledger: "prompt-preparation-ledger.json"
  });
  const verified = preparation.gate.verified
    && preparation.context_pack.acceptance_oracle_success
    && preparation.context_pack.critical_anchors.retention_percent === 100
    && preparation.sendable_prompt.text.includes("AUTH_RESET_TOKEN_EXPIRED")
    && !preparation.sendable_prompt.text.includes("Hintergrundnotiz 79")
    && ledger.totals.entries === 1
    && ledger.totals.verified_preparations === 1
    && ledger.totals.sendable_prompt_saved_tokens > 0;

  return {
    schema: "SparkompassPromptPreparationProbeV1",
    verified,
    status: verified ? "verified-prompt-preparation" : "prompt-preparation-needs-review",
    gate_status: preparation.gate.status,
    context_pack_id: preparation.context_pack.context_pack_id,
    context_pack_gate_status: preparation.context_pack.gate_status,
    delivered_context_savings_percent: preparation.savings.delivered_context.percent,
    sendable_prompt_savings_percent: preparation.savings.sendable_prompt.percent,
    sendable_prompt_tokens: preparation.sendable_prompt.estimated_tokens,
    ledger_status: verified ? "verified-prompt-preparation-ledger" : "prompt-preparation-ledger-needs-review",
    ledger_entries: ledger.totals.entries,
    ledger_verified_preparations: ledger.totals.verified_preparations,
    ledger_sendable_savings_percent: ledger.totals.sendable_prompt_savings_percent,
    ledger_path: ledgerWrite.path,
    critical_anchor_retention_percent: preparation.context_pack.critical_anchors.retention_percent,
    source_evidence_coverage_percent: preparation.context_pack.source_evidence_coverage_percent,
    acceptance_oracle_success: preparation.context_pack.acceptance_oracle_success
  };
}

async function buildExperimentPlanProbe() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-plan-probe-"));
  await fs.mkdir(path.join(probeRoot, "prompts"), { recursive: true });
  await fs.writeFile(path.join(probeRoot, "prompts", "raw.txt"), [
    "Bitte fuehre die Release-Audit-Probe mit vollem Kontext aus.",
    "Done when: TASK_OK."
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(probeRoot, "prompts", "compact.txt"), [
    "Ziel: TASK_OK fuer die Release-Audit-Probe erhalten.",
    "Nutze nur den benoetigten Kontext."
  ].join("\n"), "utf8");

  const plan = await buildSparkompassExperimentPlan(probeRoot, {
    rawPromptFile: "prompts/raw.txt",
    compactPromptFile: "prompts/compact.txt",
    taskCommand: "release-audit-task",
    expectOutput: ["TASK_OK"],
    toolProfile: "standard",
    evidenceDir: "evidence/release-experiment",
    repeat: 3,
    codexVersion: "release-audit-fixture",
    model: "release-audit-fixture",
    reasoningEffort: "fixture",
    sandboxMode: "fixture",
    cacheMode: "fixture",
    repositoryCommit: "release-audit-fixture-commit",
    configurationHash: `sha256:${sha256("release-audit-config")}`,
    pluginHash: `sha256:${sha256("release-audit-plugin")}`,
    skillHash: `sha256:${sha256("release-audit-skill")}`,
    toolCatalogHash: `sha256:${sha256("release-audit-tool-catalog")}`,
    contextPackHash: `sha256:${sha256("release-audit-context-pack")}`
  });
  const verified = plan.gate.verified
    && plan.totals.planned_runs === 12
    && plan.commands.experiment_run.includes("--require-metadata true")
    && plan.commands.experiment_run.includes("--require-context-pack-hash true")
    && plan.commands.experiment_run.includes("--context-pack-hash")
    && plan.commands.planned_codex_runs.some((command) => command.includes("--ignore-user-config"))
    && plan.commands.planned_codex_runs.some((command) => command.includes("SPARKOMPASS_TOOL_PROFILE=standard"));

  return {
    schema: "SparkompassExperimentPlanProbeV1",
    verified,
    status: verified ? "verified-experiment-plan" : "experiment-plan-needs-review",
    plan_schema: plan.schema,
    plan_id: plan.plan_id,
    gate_status: plan.gate.status,
    gate_reasons: plan.gate.reasons,
    planned_runs: plan.totals.planned_runs,
    planned_task_outcomes: plan.totals.planned_task_outcomes,
    repeat: plan.repeat,
    matrix: plan.matrix,
    prompt_hashes: {
      raw: plan.prompts.raw.prompt_hash,
      compact: plan.prompts.compact.prompt_hash
    },
    commands_include_require_metadata: plan.commands.experiment_run.includes("--require-metadata true"),
    commands_include_require_context_pack_hash: plan.commands.experiment_run.includes("--require-context-pack-hash true"),
    basis_uses_ignore_user_config: plan.commands.planned_codex_runs.some((command) => command.includes("--ignore-user-config")),
    plugin_uses_tool_profile: plan.commands.planned_codex_runs.some((command) => command.includes("SPARKOMPASS_TOOL_PROFILE=standard")),
    evidence_dir: plan.evidence_dir
  };
}

async function buildExperimentScriptProbe() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-script-probe-"));
  await fs.mkdir(path.join(probeRoot, "prompts"), { recursive: true });
  await fs.writeFile(path.join(probeRoot, "prompts", "raw.txt"), [
    "Bitte fuehre die Release-Audit-Probe mit vollem Kontext aus.",
    "Done when: TASK_OK."
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(probeRoot, "prompts", "compact.txt"), [
    "Ziel: TASK_OK fuer die Release-Audit-Probe erhalten.",
    "Nutze nur den benoetigten Kontext."
  ].join("\n"), "utf8");

  const plan = await buildSparkompassExperimentPlan(probeRoot, {
    rawPromptFile: "prompts/raw.txt",
    compactPromptFile: "prompts/compact.txt",
    taskCommand: "release-audit-task",
    expectOutput: ["TASK_OK"],
    toolProfile: "standard",
    evidenceDir: "evidence/release-experiment",
    out: "evidence/release-experiment/experiment-plan.json",
    repeat: 3,
    codexVersion: "release-audit-fixture",
    model: "release-audit-fixture",
    reasoningEffort: "fixture",
    sandboxMode: "fixture",
    cacheMode: "fixture",
    repositoryCommit: "release-audit-fixture-commit",
    configurationHash: `sha256:${sha256("release-audit-config")}`,
    pluginHash: `sha256:${sha256("release-audit-plugin")}`,
    skillHash: `sha256:${sha256("release-audit-skill")}`,
    toolCatalogHash: `sha256:${sha256("release-audit-tool-catalog")}`,
    contextPackHash: `sha256:${sha256("release-audit-context-pack")}`
  });
  const planPath = path.join(probeRoot, "evidence", "release-experiment", "experiment-plan.json");
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const script = await buildSparkompassExperimentScript(probeRoot, {
    plan: planPath,
    out: "evidence/release-experiment/run-experiment.sh"
  });
  const scriptPath = await writeSparkompassExperimentScript(probeRoot, script);
  const stat = await fs.stat(scriptPath);
  const executable = Boolean(stat.mode & 0o111);
  const auditIndex = script.script.indexOf("experiment evidence audit");
  const runIndex = script.script.indexOf("experiment run");
  const auditBeforeRun = auditIndex !== -1 && runIndex !== -1 && auditIndex < runIndex;
  const verified = script.gate.verified
    && script.commands.codex_runs === 12
    && script.commands.task_outcomes === 12
    && script.commands.has_experiment_audit
    && auditBeforeRun
    && executable;

  return {
    schema: "SparkompassExperimentScriptProbeV1",
    verified,
    status: verified ? "verified-experiment-script" : "experiment-script-needs-review",
    script_schema: script.schema,
    script_id: script.script_id,
    script_sha256: script.script_sha256,
    plan_id: script.plan_id,
    gate_status: script.gate.status,
    gate_reasons: script.gate.reasons,
    codex_runs: script.commands.codex_runs,
    task_outcomes: script.commands.task_outcomes,
    includes_experiment_audit: script.commands.has_experiment_audit,
    audit_before_experiment_run: auditBeforeRun,
    executable,
    run_order_stages: script.run_order.map((item) => item.stage)
  };
}

async function buildExperimentEvidenceAuditProbe() {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-evidence-audit-probe-"));
  await fs.mkdir(path.join(probeRoot, "prompts"), { recursive: true });
  await fs.writeFile(path.join(probeRoot, "prompts", "raw.txt"), [
    "Bitte fuehre die Release-Audit-Probe mit vollem Kontext aus.",
    "Done when: TASK_OK."
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(probeRoot, "prompts", "compact.txt"), [
    "Ziel: TASK_OK fuer die Release-Audit-Probe erhalten.",
    "Nutze nur den benoetigten Kontext."
  ].join("\n"), "utf8");

  const plan = await buildSparkompassExperimentPlan(probeRoot, {
    rawPromptFile: "prompts/raw.txt",
    compactPromptFile: "prompts/compact.txt",
    taskCommand: "release-audit-task",
    expectOutput: ["TASK_OK"],
    toolProfile: "standard",
    evidenceDir: "evidence/release-experiment",
    repeat: 3,
    codexVersion: "release-audit-fixture",
    model: "release-audit-fixture",
    reasoningEffort: "fixture",
    sandboxMode: "fixture",
    cacheMode: "fixture",
    repositoryCommit: "release-audit-fixture-commit",
    configurationHash: `sha256:${sha256("release-audit-config")}`,
    pluginHash: `sha256:${sha256("release-audit-plugin")}`,
    skillHash: `sha256:${sha256("release-audit-skill")}`,
    toolCatalogHash: `sha256:${sha256("release-audit-tool-catalog")}`,
    contextPackHash: `sha256:${sha256("release-audit-context-pack")}`
  });
  const planPath = path.join(probeRoot, "evidence", "experiment-plan.json");
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  for (const run of plan.variants) {
    const usagePath = path.join(probeRoot, run.expected_usage_jsonl);
    await fs.mkdir(path.dirname(usagePath), { recursive: true });
    await fs.writeFile(usagePath, usageJsonlForPlannedRun(run), "utf8");

    const outcome = await recordTaskOutcome({
      rootPath: probeRoot,
      command: "release-audit-task",
      exitCode: 0,
      outputText: "TASK_OK\n",
      expectOutput: ["TASK_OK"]
    });
    const taskPath = path.join(probeRoot, run.expected_task_outcome_json);
    await fs.mkdir(path.dirname(taskPath), { recursive: true });
    await fs.writeFile(taskPath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  }

  const audit = await buildSparkompassExperimentEvidenceAudit(probeRoot, {
    plan: planPath
  });

  return {
    schema: "SparkompassExperimentEvidenceAuditProbeV1",
    verified: audit.gate.verified,
    status: audit.gate.status,
    audit_schema: audit.schema,
    audit_id: audit.audit_id,
    plan_id: audit.plan.plan_id,
    planned_runs: audit.summary.planned_runs,
    usage_verified_runs: audit.summary.usage_verified_runs,
    usage_invariant_verified_runs: audit.summary.usage_invariant_verified_runs,
    task_outcomes_verified: audit.summary.task_outcomes_verified,
    prompt_hash_matches: audit.summary.prompt_hash_matches,
    gate_reasons: audit.gate.reasons,
    evidence_stage: audit.gate.evidence_stage
  };
}

async function buildExperimentProbe(root) {
  const probeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-experiment-probe-"));
  const usageFiles = {
    basis_raw: path.join(probeRoot, "basis-raw.jsonl"),
    basis_kompakt: path.join(probeRoot, "basis-kompakt.jsonl"),
    plugin_raw: path.join(probeRoot, "plugin-raw.jsonl"),
    plugin_kompakt: path.join(probeRoot, "plugin-kompakt.jsonl")
  };
  await fs.writeFile(usageFiles.basis_raw, usageJsonl(1000, 100, 100, 25), "utf8");
  await fs.writeFile(usageFiles.basis_kompakt, usageJsonl(700, 200, 80, 20), "utf8");
  await fs.writeFile(usageFiles.plugin_raw, usageJsonl(1120, 120, 90, 30), "utf8");
  await fs.writeFile(usageFiles.plugin_kompakt, usageJsonl(760, 260, 70, 15), "utf8");

  const rawTask = await writeExperimentTaskOutcome(probeRoot, "basis-raw");
  const compactTask = await writeExperimentTaskOutcome(probeRoot, "plugin-kompakt");

  return buildSparkompassExperimentRun(root, {
    variant: Object.entries(usageFiles).map(([variant, file]) => `${variant}=${file}`),
    taskOutcome: [
      `basis_raw=${rawTask}`,
      `plugin_kompakt=${compactTask}`
    ],
    repeat: 1,
    codexVersion: "release-audit-fixture",
    model: "release-audit-fixture",
    reasoningEffort: "fixture",
    sandboxMode: "fixture",
    cacheMode: "fixture",
    repositoryCommit: "release-audit-fixture-commit",
    configurationHash: `sha256:${sha256("release-audit-config")}`,
    pluginHash: `sha256:${sha256("release-audit-plugin")}`,
    skillHash: `sha256:${sha256("release-audit-skill")}`,
    toolCatalogHash: `sha256:${sha256("release-audit-tool-catalog")}`,
    promptHash: `sha256:${sha256("release-audit-prompt")}`,
    contextPackHash: `sha256:${sha256("release-audit-context-pack")}`,
    requireMetadata: true
  });
}

async function buildGatePathProbe(root, probes = {}) {
  const evidenceFile = path.join(root, "docs", "official-codex-usage-evidence.md");
  const evidenceText = await readOptional(evidenceFile);
  const officialComparisonVerified = [
    "8.417",
    "21%",
    "42%",
    "input_tokens + output_tokens"
  ].every((marker) => evidenceText.includes(marker));
  const experiment = probes.experimentProbe || {};
  const qualityVerified = experiment.gate?.status === "quality-noninferior"
    && experiment.router_recommendation?.mode === "compact"
    && experiment.efficiency?.status === "verified-task-efficiency"
    && Number(experiment.efficiency?.tokens_per_verified_task_saved) > 0;
  const planVerified = probes.experimentPlanProbe?.status === "verified-experiment-plan"
    && probes.experimentEvidenceAuditProbe?.status === "verified-experiment-evidence";
  const endToEndPrepared = officialComparisonVerified && qualityVerified && planVerified;
  const missingEvidence = [
    "Mehrere echte Aufgaben aus Nutzerprojekten mit offiziellen Codex-Usage-JSONL je Router-Modus",
    "TaskOutcomeReceipt-Ledger mit verifizierten Erfolgen und Regressionsfreiheit ueber diese Aufgaben",
    "Gepaartes End-to-End-Experiment: Raw/Compact plus Router-Entscheidungen gegen dieselben Aufgaben",
    "Release-Gate, das `verified-end-to-end-noninferior` erst bei gleicher oder besserer Erfolgsrate und weniger Tokens pro verifiziertem Task setzt"
  ];

  return {
    schema: "SparkompassGatePathV1",
    status: endToEndPrepared ? "verified-gate-path-prepared" : "gate-path-needs-review",
    verified: endToEndPrepared,
    current_gate: qualityVerified ? "quality-noninferior" : "pre-quality",
    next_gate: "verified-end-to-end-noninferior",
    stages: [
      "verified-codex-official-usage-comparison",
      "quality-noninferior",
      "verified-end-to-end-noninferior"
    ],
    official_usage_comparison: {
      status: officialComparisonVerified
        ? "verified-codex-official-usage-comparison"
        : "codex-usage-comparison-needs-review",
      verified: officialComparisonVerified,
      evidence_file: path.relative(root, evidenceFile),
      total_tokens_saved: officialComparisonVerified ? 8417 : 0,
      total_savings_percent: officialComparisonVerified ? 21 : 0,
      uncached_input_savings_percent: officialComparisonVerified ? 42 : 0,
      token_formula: "input_tokens + output_tokens"
    },
    quality_noninferior: {
      status: experiment.gate?.status || "unknown",
      verified: qualityVerified,
      router_mode: experiment.router_recommendation?.mode || "unknown",
      task_efficiency_status: experiment.efficiency?.status || "unknown",
      tokens_per_verified_task_saved: Number(experiment.efficiency?.tokens_per_verified_task_saved) || 0
    },
    end_to_end: {
      status: endToEndPrepared
        ? "end-to-end-noninferior-prepared"
        : "end-to-end-noninferior-needs-prerequisites",
      verified: false,
      next_gate: "verified-end-to-end-noninferior",
      required_evidence: missingEvidence,
      missing_evidence: missingEvidence,
      caveat: "Dieses Artefakt bereitet das End-to-End-Gate vor; es behauptet noch nicht, dass verified-end-to-end-noninferior erreicht wurde."
    }
  };
}

async function writeExperimentTaskOutcome(probeRoot, label) {
  const outcome = await recordTaskOutcome({
    rootPath: probeRoot,
    command: "release-audit-task",
    exitCode: 0,
    outputText: "TASK_OK\n",
    expectOutput: ["TASK_OK"]
  });
  const filePath = path.join(probeRoot, `${label}.task.json`);
  await fs.writeFile(filePath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  return filePath;
}

function usageJsonlForPlannedRun(run) {
  const totals = {
    basis_raw: [1000, 100, 100, 25],
    basis_kompakt: [700, 200, 80, 20],
    plugin_raw: [1120, 120, 90, 30],
    plugin_kompakt: [760, 260, 70, 15]
  };
  const [input, cached, output, reasoning] = totals[run.variant] || [1000, 100, 100, 20];
  const repeatOffset = Math.max(0, Number(run.repeat_index) || 0);
  return usageJsonl(input + repeatOffset, cached, output, reasoning);
}

function usageJsonl(inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens = 0) {
  return `${JSON.stringify({
    type: "turn.completed",
    usage: {
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
      reasoning_output_tokens: reasoningOutputTokens
    }
  })}\n`;
}

async function buildSourceHashProbe(root, inventory) {
  const unit = inventory.units.find((candidate) => (
    candidate.file === "src/inventory.mjs" && candidate.name === "buildContextInventory"
  )) || inventory.units.find((candidate) => candidate.source_hash);

  if (!unit) {
    return {
      schema: "SourceHashEvidenceProbeV1",
      status: "source-hash-evidence-needs-review",
      verified: false,
      reason: "no-inventory-unit-with-source-hash"
    };
  }

  const evidence = await loadSourceByHash(root, {
    sourceHash: unit.source_hash,
    file: unit.file,
    contextLines: 1,
    maxMatches: 1
  });
  const match = evidence.matches[0] || null;
  const verified = Boolean(evidence.gate.verified && match?.source_hash_match);

  return {
    schema: "SourceHashEvidenceProbeV1",
    status: verified ? "verified-source-hash-evidence" : "source-hash-evidence-needs-review",
    verified,
    requested_source_hash: unit.source_hash,
    evidence_gate: evidence.gate.status,
    evidence_id: match?.evidence_id || null,
    file: match?.file || unit.file,
    line: match?.line || unit.line,
    source_hash_match: match?.source_hash_match ?? false,
    file_hash: match?.file_hash || null,
    excerpt_hash: match?.excerpt_hash || null
  };
}

function inspectSourceHashContract(contextPlan) {
  const evidence = [
    ...(contextPlan.evidence || []),
    ...(contextPlan.lanes?.on_demand_evidence || []),
    ...((contextPlan.requirements?.items || []).flatMap((item) => item.evidence || []))
  ].filter((item) => item.source_hash);
  const withHints = evidence.filter((item) => (
    item.source_hash_load_hint?.includes("sparkompass_load_source_hash")
      && item.load_hints?.source_hash === item.source_hash_load_hint
  ));
  const verified = evidence.length > 0 && withHints.length === evidence.length;

  return {
    schema: "SourceHashHandoffContractProbeV1",
    status: verified ? "verified-source-hash-contract" : "source-hash-contract-needs-review",
    verified,
    evidence_items: evidence.length,
    source_hash_load_hints: withHints.length,
    missing_hints: evidence.length - withHints.length
  };
}

async function inspectMcpTools(root) {
  const source = await readOptional(path.join(root, "src/mcp-tools.mjs"));
  const tools = [...source.matchAll(/name:\s*"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((name) => name.startsWith("sparkompass_"));
  const uniqueTools = [...new Set(tools)];
  const requiredContextControl = [
    "sparkompass_plan_context",
    "sparkompass_context_bom",
    "sparkompass_control_report",
    "sparkompass_handoff_receipt",
    "sparkompass_build_envelope",
    "sparkompass_load_evidence",
    "sparkompass_load_source_hash"
  ];
  const missingRequiredTools = REQUIRED_MCP_TOOLS.filter((name) => !uniqueTools.includes(name));
  const missingContextTools = requiredContextControl.filter((name) => !uniqueTools.includes(name));

  return {
    schema: "SparkompassMcpToolAuditV1",
    path: path.join(root, "src/mcp-tools.mjs"),
    tools: uniqueTools,
    required_tools: REQUIRED_MCP_TOOLS,
    missing_required_tools: missingRequiredTools,
    has_required_context_control_tools: missingContextTools.length === 0,
    missing_required_context_control_tools: missingContextTools
  };
}

async function inspectPackageShape(root) {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  const bins = packageJson.bin || {};
  const requiredFiles = ["bin/", "src/", "docs/", "plugins/", ".agents/skills/codex-sparkompass/", "README.md", "LICENSE"];
  const requiredBins = ["sparkompass", "sparkompass-mcp"];
  const missingFiles = requiredFiles.filter((item) => !files.includes(item));
  const missingBins = requiredBins.filter((item) => !bins[item]);

  const verified = packageJson.name === "codex-sparkompass"
    && missingFiles.length === 0
    && missingBins.length === 0
    && Boolean(packageJson.scripts?.check)
    && Boolean(packageJson.scripts?.prepack);

  return {
    schema: "SparkompassPackageShapeAuditV1",
    name: packageJson.name,
    version: packageJson.version,
    verified,
    summary: `files missing=${missingFiles.join(",") || "none"}, bins missing=${missingBins.join(",") || "none"}, prepack=${packageJson.scripts?.prepack ? "yes" : "no"}`,
    missing_files: missingFiles,
    missing_bins: missingBins
  };
}

async function inspectPluginShape(root) {
  const pluginRoot = path.join(root, "plugins/codex-sparkompass");
  const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
  const mcp = JSON.parse(await fs.readFile(path.join(pluginRoot, ".mcp.json"), "utf8"));
  const hooks = JSON.parse(await fs.readFile(path.join(pluginRoot, "hooks/hooks.json"), "utf8"));
  const skillExists = await exists(path.join(pluginRoot, "skills/codex-sparkompass/SKILL.md"));
  const distCliExists = await exists(path.join(pluginRoot, "dist/sparkompass.mjs"));
  const distMcpExists = await exists(path.join(pluginRoot, "dist/sparkompass-mcp.mjs"));
  const bridgeExists = await exists(path.join(pluginRoot, "scripts/sparkompass.mjs"));
  const mcpBridgeExists = await exists(path.join(pluginRoot, "scripts/sparkompass-mcp.mjs"));
  const hookScriptExists = await exists(path.join(pluginRoot, "scripts/sparkompass-user-prompt-submit.mjs"));
  const verified = manifest.name === "codex-sparkompass"
    && manifest.skills === "./skills/"
    && manifest.mcpServers === "./.mcp.json"
    && Boolean(mcp.mcpServers?.sparkompass)
    && Boolean(hooks.hooks?.UserPromptSubmit)
    && skillExists
    && distCliExists
    && distMcpExists
    && bridgeExists
    && mcpBridgeExists
    && hookScriptExists
    && !Object.hasOwn(manifest, "hooks");

  return {
    schema: "SparkompassPluginShapeAuditV1",
    verified,
    summary: `skill=${skillExists ? "yes" : "no"}, dist=${distCliExists && distMcpExists ? "yes" : "no"}, mcp=${mcp.mcpServers?.sparkompass ? "yes" : "no"}, hook=${hooks.hooks?.UserPromptSubmit ? "yes" : "no"}, unsupported-hooks-field=${Object.hasOwn(manifest, "hooks") ? "present" : "absent"}`,
    manifest_name: manifest.name,
    has_skill: skillExists,
    has_dist_bundle: distCliExists && distMcpExists,
    has_mcp: Boolean(mcp.mcpServers?.sparkompass),
    has_hook: Boolean(hooks.hooks?.UserPromptSubmit),
    has_unsupported_hooks_field: Object.hasOwn(manifest, "hooks")
  };
}

function summarizeScorecard(scorecard) {
  return {
    schema: scorecard.schema,
    generated_at: scorecard.generated_at,
    release_readiness: scorecard.release_readiness,
    gates: scorecard.gates,
    metrics: scorecard.metrics
  };
}

function summarizeInventory(inventory) {
  return {
    schema: inventory.schema,
    generated_at: inventory.generated_at,
    totals: inventory.totals
  };
}

function summarizeContextPlan(plan) {
  return {
    schema: plan.schema,
    generated_at: plan.generated_at,
    gate: plan.gate,
    decision_trace: {
      schema: plan.decision_trace.schema,
      trace_id: plan.decision_trace.trace_id,
      status: plan.decision_trace.status,
      verified: plan.decision_trace.verified,
      strategy: plan.decision_trace.strategy,
      coverage: plan.decision_trace.coverage,
      uncertainty_register: plan.decision_trace.uncertainty_register
    },
    budget: plan.budget,
    totals: plan.totals
  };
}

function summarizeEvidenceAudit(audit) {
  return {
    schema: audit.schema,
    audit_id: audit.audit_id,
    gate: audit.gate,
    totals: audit.totals,
    source_control: audit.source_control
  };
}

function summarizeAblationAudit(audit) {
  return {
    schema: audit.schema,
    audit_id: audit.audit_id,
    gate: audit.gate,
    totals: audit.totals,
    oracle: audit.oracle,
    source_plan: audit.source_plan
  };
}

function summarizeSlimmingPlan(plan) {
  return {
    schema: plan.schema,
    slimming_id: plan.slimming_id,
    gate: plan.gate,
    source_plan: plan.source_plan,
    ablation_audit: plan.ablation_audit,
    budget: plan.budget,
    proposal: {
      keep_immediate: plan.proposal.keep_immediate.length,
      move_to_on_demand: plan.proposal.move_to_on_demand.length,
      existing_on_demand_units: plan.proposal.existing_on_demand_units,
      unchecked_immediate: plan.proposal.unchecked_immediate.length
    }
  };
}

function summarizeContextPackFormat(format, validation) {
  return {
    schema: format.schema,
    format_id: format.format_id,
    receipt_schema: format.receipt_schema,
    status: format.status,
    compatible_gate_statuses: format.compatible_gate_statuses,
    required_top_level_fields: format.required_top_level_fields.length,
    validation: {
      schema: validation.schema,
      status: validation.status,
      verified: validation.verified,
      failed_checks: validation.summary.failed_checks,
      context_pack_id: validation.context_pack_id
    }
  };
}

function summarizeExperimentProbe(experiment) {
  return {
    schema: experiment.schema,
    experiment_id: experiment.experiment_id,
    gate: experiment.gate,
    matrix: experiment.matrix,
    manifests: experiment.manifests.length,
    usage_invariants: {
      verified_runs: experiment.summary.usage_invariant_verified_runs,
      failed_runs: experiment.summary.usage_invariant_failed_runs
    },
    evidence_completeness: {
      complete_runs: experiment.summary.evidence_complete_runs,
      incomplete_runs: experiment.summary.evidence_incomplete_runs
    },
    task_outcomes: {
      total: sumExperimentTaskOutcomes(experiment, "task_outcome_runs"),
      verified: sumExperimentTaskOutcomes(experiment, "verified_task_outcomes")
    },
    effects: experiment.effects,
    efficiency: experiment.efficiency,
    router_recommendation: {
      mode: experiment.router_recommendation.mode,
      reason: experiment.router_recommendation.reason,
      expected_net_gain_tokens: experiment.router_recommendation.expected_net_gain_tokens
    }
  };
}

function summarizeImpactReport(report) {
  return {
    schema: report.schema,
    report_id: report.report_id,
    gate: report.gate,
    impact: report.impact,
    quality: report.quality,
    ledgers: report.ledgers
  };
}

function summarizePilot(pilot) {
  return {
    schema: pilot.schema,
    run_id: pilot.run_id,
    ledger_dir: pilot.ledger_dir,
    gate: pilot.gate,
    metrics: pilot.metrics,
    ledger_paths: pilot.ledger_paths
  };
}

function summarizePackageDryRun(audit) {
  return {
    schema: audit.schema,
    status: audit.status,
    verified: audit.verified,
    command: audit.command,
    package: audit.package,
    checks: audit.checks,
    required_paths: audit.required_paths,
    forbidden_paths: audit.forbidden_paths,
    executable_paths: audit.executable_paths,
    limits: audit.limits
  };
}

function summarizePackageInstallSmoke(audit) {
  return {
    schema: audit.schema,
    status: audit.status,
    verified: audit.verified,
    command: audit.command,
    package: audit.package,
    installed: audit.installed,
    checks: audit.checks,
    duration_ms: audit.duration_ms,
    temp: audit.temp
  };
}

function summarizePluginInstallSmoke(audit) {
  return {
    schema: audit.schema,
    status: audit.status,
    verified: audit.verified,
    command: audit.command,
    plugin: audit.plugin,
    installed: audit.installed,
    checks: audit.checks,
    duration_ms: audit.duration_ms,
    temp: audit.temp
  };
}

function buildWarnings({ includePilot, pilot }) {
  const warnings = [];
  if (!includePilot) warnings.push("pilot-run-skipped");
  if (pilot?.ledger_dir?.startsWith(os.tmpdir())) warnings.push("pilot-ledgers-written-to-temp-dir");
  return warnings;
}

function buildNextActions(blockers) {
  if (blockers.length) {
    return [
      "Bearbeite die needs-review Anforderungen, bevor das Ziel als fertig gilt.",
      "Nutze npm run check, sparkompass pilot, package-audit, package-smoke und plugin-smoke als harte Belegkette."
    ];
  }

  return [
    "Nutze den verifizierten Package-Dry-Run, Package-Install-Smoke und Plugin-Smoke zusammen mit Plugin-Validierung, bevor du tatsächlich veröffentlichst.",
    "Nutze den Audit zusammen mit einem Pilot-Lauf gegen einen echten Projektcheck, wenn reale Task-Kosten statt interner Gates gemessen werden sollen."
  ];
}

function formatRequirement(requirement) {
  const marker = requirement.status === "verified" ? "[x]" : "[ ]";
  return `- ${marker} ${requirement.id}: ${requirement.evidence}`;
}

async function createTempLedgerDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-release-audit-"));
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

function sumExperimentTaskOutcomes(experiment, field) {
  return Object.values(experiment.summary?.by_variant || {})
    .reduce((total, variant) => total + (Number(variant[field]) || 0), 0);
}

function countExperimentKnownRequiredField(experiment, field) {
  return (experiment.manifests || []).filter((manifest) => (
    manifest.evidence_completeness?.required_fields || []
  ).some((entry) => entry.field === field && entry.known)).length;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
