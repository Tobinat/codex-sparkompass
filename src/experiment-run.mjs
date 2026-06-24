import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildCodexUsageReceipt } from "./codex-usage.mjs";
import { buildSparkompassRouterDecision } from "./router-decision.mjs";
import { loadTaskOutcomeJson } from "./task-outcome-ledger.mjs";
import { formatNumber } from "./token-estimator.mjs";

const REQUIRED_VARIANTS = ["basis_raw", "basis_kompakt", "plugin_raw", "plugin_kompakt"];

export async function buildSparkompassExperimentRun(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const variantSpecs = parseVariantSpecs(options);
  const manifests = [];
  const manifestBase = await buildManifestBase(root, options);
  const experimentId = options.experimentId || `exp-${sha256(JSON.stringify(variantSpecs)).slice(0, 12)}`;

  for (const spec of variantSpecs) {
    const manifest = await buildRunManifest(root, {
      ...manifestBase,
      ...spec,
      experimentId,
      taskPassed: lookupTaskPassed(spec.variant, options.taskPassed)
    });
    manifests.push(manifest);
  }

  const summary = summarizeManifests(manifests);
  const effects = calculateExperimentEffects(summary.by_variant);
  const efficiency = calculateExperimentEfficiency(summary.by_variant);
  const gate = buildExperimentGate(summary, effects, {
    efficiency,
    minRepeat: Number(options.repeat || options.minRepeat || 1),
    requireAllVariants: options.requireAllVariants !== false,
    requireMetadata: Boolean(options.requireMetadata)
  });
  const experiment = {
    schema: "SparkompassExperimentRunV1",
    experiment_id: experimentId,
    created_at: new Date().toISOString(),
    objective: "Kausale Codex-Usage-Messung über Raw/Kompakt und Basis/Plugin-Arme.",
    root,
    matrix: REQUIRED_VARIANTS,
    manifests,
    summary,
    effects,
    efficiency,
    gate,
    caveats: [
      "Dieser Befehl wertet dokumentierte Codex-JSONL-Usage-Events aus; er führt Codex nicht selbst aus.",
      "Kausale Aussagen sind nur belastbar, wenn Modell, Repository-Zustand, Sandbox, Prompt und Laufbedingungen kontrolliert sind.",
      "Gesamt-Tokens werden als input_tokens + output_tokens berechnet; cached_input_tokens und reasoning_output_tokens sind Unterkategorien."
    ]
  };
  experiment.router_recommendation = buildSparkompassRouterDecision({ experiment }, {
    requireQualityEvidence: true
  });
  return experiment;
}

export async function writeSparkompassExperimentRun(rootPath, experiment, options = {}) {
  const root = path.resolve(rootPath || ".");
  const outPath = resolveAgainstRoot(root, options.out || options.output || "");
  if (!outPath) return null;
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(experiment, null, 2)}\n`, "utf8");
  return outPath;
}

export function formatSparkompassExperimentRun(experiment) {
  const effects = experiment.effects;
  const rows = Object.entries(experiment.summary.by_variant).map(([variant, stats]) => (
    `- ${variant}: ${formatNumber(stats.runs)} Run(s), Median ${formatNumber(stats.total_tokens.median)} Gesamt-Tokens, ${formatNumber(stats.uncached_input_tokens.median)} nicht gecachter Input, Usage ${formatNumber(stats.verified_runs)}/${formatNumber(stats.runs)}, Invarianten ${formatNumber(stats.usage_invariant_verified_runs)}/${formatNumber(stats.runs)}, Metadaten ${formatNumber(stats.evidence_complete_runs)}/${formatNumber(stats.runs)}, TaskOutcome ${formatNumber(stats.verified_task_outcomes)}/${formatNumber(stats.task_outcome_runs)}`
  )).join("\n") || "- keine Varianten";

  const effectRows = [
    ["Reiner Kompressionsgewinn", effects.pure_compression_gain_tokens, effects.pure_compression_gain_percent],
    ["Plugin-Grundlast", effects.plugin_overhead_tokens, effects.plugin_overhead_percent],
    ["Netto-Produktgewinn", effects.net_product_gain_tokens, effects.net_product_gain_percent],
    ["Integrationseffekt", effects.integration_effect_tokens, effects.integration_effect_percent]
  ].map(([label, tokens, percent]) => `- ${label}: ${formatSigned(tokens)} Tokens (${formatSigned(percent)}%)`).join("\n");
  const efficiency = experiment.efficiency || {};

  return `
# SparkompassExperimentRunV1

Gate: ${experiment.gate.status}
Experiment: ${experiment.experiment_id}

## Varianten

${rows}

## Effekte

${effectRows}

## Verifizierte Task-Effizienz

- Status: ${efficiency.status || "unknown"}
- Basis raw: ${formatMaybeNumber(efficiency.baseline_tokens_per_verified_task)} Tokens/verifiziertem Task
- Plugin kompakt: ${formatMaybeNumber(efficiency.optimized_tokens_per_verified_task)} Tokens/verifiziertem Task
- Ersparnis pro verifiziertem Task: ${formatSigned(efficiency.tokens_per_verified_task_saved)} Tokens (${formatSigned(efficiency.tokens_per_verified_task_saved_percent)}%)

## Router

- Modus: ${experiment.router_recommendation.mode}
- Begründung: ${experiment.router_recommendation.reason}
- Erwarteter Netto-Gewinn: ${formatSigned(experiment.router_recommendation.expected_net_gain_tokens)} Tokens

## Gate-Probleme

${experiment.gate.reasons.length ? experiment.gate.reasons.map((reason) => `- ${reason}`).join("\n") : "- keine"}

Hinweis: ${experiment.caveats.join(" ")}
`.trim();
}

async function buildRunManifest(root, options = {}) {
  const sourceFile = resolveAgainstRoot(root, options.file);
  const jsonlText = await fs.readFile(sourceFile, "utf8");
  const receipt = buildCodexUsageReceipt(jsonlText, {
    sourceFile,
    label: options.variant
  });
  const totals = receipt.official_usage.totals;
  const promptHash = options.promptHash || await hashOptionalFile(root, lookupVariantRunValue(options.promptFileByVariant, options.variant, options.repeatIndex) || options.promptFile);
  const contextPackHash = options.contextPackHash || await hashOptionalFile(root, lookupVariantRunValue(options.contextPackByVariant, options.variant, options.repeatIndex) || options.contextPack);
  const taskOutcomeEvidence = await loadTaskOutcomeEvidence(root, options);
  const taskOutcomePassed = taskOutcomeEvidence ? Boolean(taskOutcomeEvidence.outcome.gate?.verified) : undefined;
  const taskPassed = taskOutcomeEvidence ? taskOutcomePassed : options.taskPassed;
  const taskOutcomeConflict = taskOutcomeEvidence && typeof options.taskPassed === "boolean" && options.taskPassed !== taskOutcomePassed;

  const manifest = {
    schema: "SparkompassRunManifestV1",
    run_id: `run-${sha256(`${options.experimentId}:${options.variant}:${options.repeatIndex || ""}:${receipt.source.raw_sha256}`).slice(0, 12)}`,
    experiment_id: options.experimentId,
    variant: options.variant,
    repeat_index: options.repeatIndex || null,
    source_file: sourceFile,
    relative_source_file: path.relative(root, sourceFile),
    raw_sha256: receipt.source.raw_sha256,
    codex_version: options.codexVersion || "unknown",
    model: options.model || "unknown",
    reasoning_effort: options.reasoningEffort || "unknown",
    repository_commit: options.repositoryCommit || "unknown",
    repository_dirty: Boolean(options.repositoryDirty),
    operating_system: `${os.platform()} ${os.release()}`,
    node_version: process.version,
    configuration_hash: options.configurationHash || "sha256:unknown",
    plugin_hash: options.pluginHash || "sha256:unknown",
    skill_hash: options.skillHash || "sha256:unknown",
    tool_catalog_hash: options.toolCatalogHash || "sha256:unknown",
    prompt_hash: promptHash,
    context_pack_hash: contextPackHash,
    cache_mode: options.cacheMode || "unknown",
    sandbox_mode: options.sandboxMode || "unknown",
    task_passed: taskPassed,
    quality_evidence: {
      source: taskOutcomeEvidence ? "task-outcome-receipt" : typeof options.taskPassed === "boolean" ? "task-passed-flag" : "unmeasured",
      task_passed: taskPassed,
      task_outcome_conflict: Boolean(taskOutcomeConflict)
    },
    task_outcome: taskOutcomeEvidence
      ? summarizeTaskOutcomeEvidence(taskOutcomeEvidence, root)
      : null,
    official_usage: {
      gate_status: receipt.gate.status,
      gate_verified: receipt.gate.verified,
      gate_reasons: receipt.gate.reasons,
      invariant_status: receipt.official_usage.invariants?.status || "unknown",
      invariant_verified: Boolean(receipt.official_usage.invariants?.verified),
      invariant_failed_checks: receipt.official_usage.invariants?.failed_checks || [],
      invariants: receipt.official_usage.invariants,
      input_tokens: totals.input_tokens,
      cached_input_tokens: totals.cached_input_tokens,
      output_tokens: totals.output_tokens,
      reasoning_output_tokens: totals.reasoning_output_tokens,
      total_tokens: totals.total_tokens,
      total_tokens_formula: totals.total_tokens_formula,
      uncached_input_tokens: Math.max(0, totals.input_tokens - totals.cached_input_tokens)
    },
    receipt_id: receipt.receipt_id,
    receipt_hash: `sha256:${sha256(JSON.stringify(receipt))}`
  };
  manifest.evidence_completeness = buildRunManifestEvidenceCompleteness(manifest, {
    requireContextPackHash: Boolean(options.requireContextPackHash)
  });
  return manifest;
}

async function buildManifestBase(root, options = {}) {
  return {
    codexVersion: options.codexVersion || readCommandVersion(options.codexPath || "codex"),
    model: options.model || "",
    reasoningEffort: options.reasoningEffort || options.reasoning || "",
    repositoryCommit: options.repositoryCommit || readGit(root, ["rev-parse", "HEAD"]) || "unknown",
    repositoryDirty: options.repositoryDirty ?? Boolean(readGit(root, ["status", "--porcelain"])),
    configurationHash: options.configurationHash || await hashMaybeExisting(path.join(root, ".codex", "config.toml")),
    pluginHash: options.pluginHash || await hashPathIfExists(path.join(root, "plugins", "codex-sparkompass", ".codex-plugin", "plugin.json")),
    skillHash: options.skillHash || await hashPathIfExists(path.join(root, ".agents", "skills", "codex-sparkompass", "SKILL.md")),
    toolCatalogHash: options.toolCatalogHash || await hashPathIfExists(path.join(root, "src", "mcp-tools.mjs")),
    promptFileByVariant: parseKeyValueFiles([
      ...asArray(options.promptVariant),
      ...asArray(options.promptFileVariant)
    ]),
    contextPackByVariant: parseKeyValueFiles(options.contextPackVariant || []),
    taskOutcomeByVariant: parseKeyValueFiles([
      ...asArray(options.taskOutcome),
      ...asArray(options.taskOutcomeVariant)
    ]),
    promptFile: options.promptFile || "",
    contextPack: options.contextPack || "",
    promptHash: options.promptHash || "",
    contextPackHash: options.contextPackHash || "",
    cacheMode: options.cacheMode || options.cache || "",
    sandboxMode: options.sandboxMode || options.sandbox || "",
    requireMetadata: Boolean(options.requireMetadata),
    requireContextPackHash: Boolean(options.requireContextPackHash || options.requireMetadata)
  };
}

function parseVariantSpecs(options = {}) {
  const variants = [];
  for (const item of asArray(options.variant)) {
    const parsed = parseKeyValue(item);
    if (parsed.key && parsed.value) variants.push({ variant: normalizeVariant(parsed.key), file: parsed.value });
  }

  const direct = {
    basis_raw: options.basisRaw,
    basis_kompakt: options.basisKompakt || options.basisCompact,
    plugin_raw: options.pluginRaw,
    plugin_kompakt: options.pluginKompakt || options.pluginCompact
  };
  for (const [variant, file] of Object.entries(direct)) {
    if (file) variants.push({ variant, file });
  }

  const unique = new Map();
  for (const variant of variants) {
    const key = `${variant.variant}:${variant.file}`;
    unique.set(key, variant);
  }
  const repeatCounters = new Map();
  return Array.from(unique.values()).map((variant) => {
    const repeatIndex = (repeatCounters.get(variant.variant) || 0) + 1;
    repeatCounters.set(variant.variant, repeatIndex);
    return {
      ...variant,
      repeatIndex
    };
  });
}

function summarizeManifests(manifests = []) {
  const byVariant = {};
  for (const variant of unique(manifests.map((manifest) => manifest.variant))) {
    const runs = manifests.filter((manifest) => manifest.variant === variant);
    byVariant[variant] = summarizeVariantRuns(runs);
  }
  return {
    runs: manifests.length,
    variants: Object.keys(byVariant).length,
    verified_runs: manifests.filter((manifest) => manifest.official_usage.gate_verified).length,
    usage_invariant_verified_runs: manifests.filter((manifest) => manifest.official_usage.invariant_verified).length,
    usage_invariant_failed_runs: manifests.filter((manifest) => !manifest.official_usage.invariant_verified).length,
    evidence_complete_runs: manifests.filter((manifest) => manifest.evidence_completeness?.verified).length,
    evidence_incomplete_runs: manifests.filter((manifest) => !manifest.evidence_completeness?.verified).length,
    by_variant: byVariant
  };
}

function summarizeVariantRuns(runs = []) {
  const usage = (field) => stats(runs.map((manifest) => manifest.official_usage[field]));
  const taskRuns = runs.filter((manifest) => typeof manifest.task_passed === "boolean");
  const passed = taskRuns.filter((manifest) => manifest.task_passed).length;
  const taskOutcomeRuns = runs.filter((manifest) => manifest.task_outcome).length;
  const verifiedTaskOutcomes = runs.filter((manifest) => manifest.task_outcome?.gate_verified).length;
  const taskOutcomeConflicts = runs.filter((manifest) => manifest.quality_evidence?.task_outcome_conflict).length;
  return {
    runs: runs.length,
    verified_runs: runs.filter((manifest) => manifest.official_usage.gate_verified).length,
    usage_invariant_verified_runs: runs.filter((manifest) => manifest.official_usage.invariant_verified).length,
    usage_invariant_failed_runs: runs.filter((manifest) => !manifest.official_usage.invariant_verified).length,
    usage_invariant_failed_checks: unique(runs.flatMap((manifest) => manifest.official_usage.invariant_failed_checks || [])),
    evidence_complete_runs: runs.filter((manifest) => manifest.evidence_completeness?.verified).length,
    evidence_incomplete_runs: runs.filter((manifest) => !manifest.evidence_completeness?.verified).length,
    evidence_missing_fields: unique(runs.flatMap((manifest) => manifest.evidence_completeness?.missing_required_fields || [])),
    task_runs: taskRuns.length,
    task_passed: passed,
    task_success_rate: taskRuns.length ? Math.round((passed / taskRuns.length) * 100) : null,
    task_outcome_runs: taskOutcomeRuns,
    verified_task_outcomes: verifiedTaskOutcomes,
    task_outcome_conflicts: taskOutcomeConflicts,
    total_tokens: usage("total_tokens"),
    input_tokens: usage("input_tokens"),
    cached_input_tokens: usage("cached_input_tokens"),
    uncached_input_tokens: usage("uncached_input_tokens"),
    output_tokens: usage("output_tokens"),
    reasoning_output_tokens: usage("reasoning_output_tokens")
  };
}

function calculateExperimentEffects(byVariant = {}) {
  const basisRaw = byVariant.basis_raw?.total_tokens?.median ?? null;
  const basisKompakt = byVariant.basis_kompakt?.total_tokens?.median ?? null;
  const pluginRaw = byVariant.plugin_raw?.total_tokens?.median ?? null;
  const pluginKompakt = byVariant.plugin_kompakt?.total_tokens?.median ?? null;

  const pureCompression = nullableSubtract(basisRaw, basisKompakt);
  const pluginOverhead = nullableSubtract(pluginRaw, basisRaw);
  const netProduct = nullableSubtract(basisRaw, pluginKompakt);
  const integrationEffect = nullableSubtract(pluginKompakt, basisKompakt);

  return {
    basis_raw_median_total_tokens: basisRaw,
    basis_kompakt_median_total_tokens: basisKompakt,
    plugin_raw_median_total_tokens: pluginRaw,
    plugin_kompakt_median_total_tokens: pluginKompakt,
    pure_compression_gain_tokens: pureCompression,
    pure_compression_gain_percent: percent(pureCompression, basisRaw),
    plugin_overhead_tokens: pluginOverhead,
    plugin_overhead_percent: percent(pluginOverhead, basisRaw),
    net_product_gain_tokens: netProduct,
    net_product_gain_percent: percent(netProduct, basisRaw),
    integration_effect_tokens: integrationEffect,
    integration_effect_percent: percent(integrationEffect, basisKompakt)
  };
}

function calculateExperimentEfficiency(byVariant = {}) {
  const byVariantEfficiency = {};
  for (const variant of REQUIRED_VARIANTS) {
    const statsForVariant = byVariant[variant] || {};
    const totalTokens = Number(statsForVariant.total_tokens?.sum) || 0;
    const verifiedTasks = Number(statsForVariant.verified_task_outcomes) || 0;
    byVariantEfficiency[variant] = {
      variant,
      runs: Number(statsForVariant.runs) || 0,
      total_tokens: totalTokens,
      verified_successful_tasks: verifiedTasks,
      tokens_per_verified_task: verifiedTasks > 0 ? Math.round(totalTokens / verifiedTasks) : null,
      verified_successful_tasks_per_1000_tokens: totalTokens > 0
        ? roundTo((verifiedTasks / totalTokens) * 1000, 3)
        : null
    };
  }

  const baseline = byVariantEfficiency.basis_raw;
  const optimized = byVariantEfficiency.plugin_kompakt;
  const baselineTokensPerTask = baseline.tokens_per_verified_task;
  const optimizedTokensPerTask = optimized.tokens_per_verified_task;
  const saved = nullableSubtract(baselineTokensPerTask, optimizedTokensPerTask);
  const reasons = [];
  if (!baseline.verified_successful_tasks) reasons.push("missing-baseline-verified-task-outcome");
  if (!optimized.verified_successful_tasks) reasons.push("missing-optimized-verified-task-outcome");
  if (saved !== null && saved < 0) reasons.push("verified-task-efficiency-regression");

  return {
    schema: "SparkompassExperimentEfficiencyV1",
    status: reasons.length
      ? reasons.includes("verified-task-efficiency-regression")
        ? "task-efficiency-regression"
        : "task-efficiency-needs-review"
      : "verified-task-efficiency",
    verified: reasons.length === 0,
    reasons,
    by_variant: byVariantEfficiency,
    baseline_variant: "basis_raw",
    optimized_variant: "plugin_kompakt",
    baseline_verified_successful_tasks: baseline.verified_successful_tasks,
    optimized_verified_successful_tasks: optimized.verified_successful_tasks,
    baseline_tokens_per_verified_task: baselineTokensPerTask,
    optimized_tokens_per_verified_task: optimizedTokensPerTask,
    tokens_per_verified_task_saved: saved,
    tokens_per_verified_task_saved_percent: percent(saved, baselineTokensPerTask),
    baseline_verified_successful_tasks_per_1000_tokens: baseline.verified_successful_tasks_per_1000_tokens,
    optimized_verified_successful_tasks_per_1000_tokens: optimized.verified_successful_tasks_per_1000_tokens,
    verified_successful_tasks_per_1000_token_gain: optimized.verified_successful_tasks_per_1000_tokens !== null
      && baseline.verified_successful_tasks_per_1000_tokens !== null
      ? roundTo(optimized.verified_successful_tasks_per_1000_tokens - baseline.verified_successful_tasks_per_1000_tokens, 3)
      : null,
    caveat: "Diese Effizienz zaehlt nur verifizierte TaskOutcomeReceipts als erfolgreiche Tasks; taskPassed-Flags sind Beobachtungen, aber kein verifizierter Task-Effizienzbeweis."
  };
}

function buildExperimentGate(summary, effects, options = {}) {
  const reasons = [];
  const variants = Object.keys(summary.by_variant);
  const missing = REQUIRED_VARIANTS.filter((variant) => !variants.includes(variant));
  if (options.requireAllVariants && missing.length) reasons.push(`missing-variants:${missing.join(",")}`);
  if (summary.runs === 0) reasons.push("no-runs");
  if (summary.verified_runs !== summary.runs) reasons.push("unverified-usage-runs");
  if (summary.usage_invariant_verified_runs !== summary.runs) reasons.push("usage-invariant-failures");
  if (options.requireMetadata && summary.evidence_complete_runs !== summary.runs) reasons.push("metadata-incomplete");
  if (options.efficiency?.status === "task-efficiency-regression") reasons.push("task-efficiency-regression");
  const taskOutcomeReviewVariants = REQUIRED_VARIANTS.filter((variant) => {
    const summaryForVariant = summary.by_variant[variant];
    return summaryForVariant?.task_outcome_runs > summaryForVariant?.verified_task_outcomes;
  });
  for (const variant of taskOutcomeReviewVariants) {
    reasons.push(`task-outcome-needs-review:${variant}`);
  }
  const taskOutcomeConflictVariants = REQUIRED_VARIANTS.filter((variant) => summary.by_variant[variant]?.task_outcome_conflicts > 0);
  for (const variant of taskOutcomeConflictVariants) {
    reasons.push(`task-outcome-conflict:${variant}`);
  }

  for (const variant of REQUIRED_VARIANTS) {
    const runs = summary.by_variant[variant]?.runs || 0;
    if (!missing.includes(variant) && runs < options.minRepeat) {
      reasons.push(`repeat-under-target:${variant}:${runs}/${options.minRepeat}`);
    }
  }

  const hasTaskEvidence = Object.values(summary.by_variant).some((variant) => variant.task_runs > 0);
  const baselineRate = summary.by_variant.basis_raw?.task_success_rate;
  const optimizedRate = summary.by_variant.plugin_kompakt?.task_success_rate;
  const taskDelta = baselineRate !== null && optimizedRate !== null ? optimizedRate - baselineRate : null;
  if (hasTaskEvidence && taskDelta !== null && taskDelta < -2) reasons.push(`quality-regression:${taskDelta}`);

  let status = "usage-observed";
  if (reasons.length) status = "experiment-needs-review";
  else if (hasTaskEvidence && taskDelta !== null && taskDelta >= -2) status = "quality-noninferior";
  else if (!missing.length) status = "paired-reproducible";

  return {
    status,
    verified: !reasons.length,
    reasons,
    evidence_stage: status,
    task_success_delta_points: taskDelta
  };
}

async function loadTaskOutcomeEvidence(root, options = {}) {
  const relativeFile = lookupVariantRunValue(options.taskOutcomeByVariant, options.variant, options.repeatIndex) || "";
  if (!relativeFile) return null;
  const filePath = resolveAgainstRoot(root, relativeFile);
  const raw = await fs.readFile(filePath, "utf8");
  const outcome = await loadTaskOutcomeJson(filePath);
  return {
    filePath,
    raw,
    outcome
  };
}

function summarizeTaskOutcomeEvidence(evidence, root) {
  const outcome = evidence.outcome;
  return {
    schema: "SparkompassRunManifestTaskOutcomeEvidenceV1",
    source_file: evidence.filePath,
    relative_source_file: path.relative(root, evidence.filePath),
    task_outcome_hash: `sha256:${sha256(evidence.raw)}`,
    task_id: outcome.task_id,
    command_hash: `sha256:${sha256(JSON.stringify(outcome.command || {}))}`,
    output_hash: outcome.result?.combined?.hash || "",
    output_tokens: Number(outcome.result?.combined?.estimated_tokens) || 0,
    context_pack_id: outcome.context_pack?.context_pack_id || "",
    context_pack_receipt_status: outcome.context_pack?.receipt_verification?.status || "",
    gate_status: outcome.gate?.status || "unknown",
    gate_verified: Boolean(outcome.gate?.verified),
    gate_reasons: outcome.gate?.reasons || []
  };
}

function buildRunManifestEvidenceCompleteness(manifest, options = {}) {
  const requiredFields = [
    "codex_version",
    "model",
    "reasoning_effort",
    "sandbox_mode",
    "repository_commit",
    "configuration_hash",
    "plugin_hash",
    "skill_hash",
    "tool_catalog_hash",
    "prompt_hash"
  ];
  const optionalFields = [
    "context_pack_hash",
    "cache_mode"
  ];
  if (options.requireContextPackHash) requiredFields.push("context_pack_hash");
  const required = requiredFields.map((field) => evidenceFieldStatus(field, manifest[field], true));
  const optional = optionalFields
    .filter((field) => !requiredFields.includes(field))
    .map((field) => evidenceFieldStatus(field, manifest[field], false));
  const missingRequired = required.filter((field) => !field.known);

  return {
    schema: "RunManifestEvidenceCompletenessV1",
    status: missingRequired.length ? "run-metadata-needs-review" : "verified-run-metadata",
    verified: missingRequired.length === 0,
    required_fields: required,
    optional_fields: optional,
    missing_required_fields: missingRequired.map((field) => field.field),
    caveat: "Diese Pruefung bewertet, ob ein RunManifest reproduzierbare Metadaten statt Platzhalter enthaelt; sie beweist nicht, dass externe Laufbedingungen identisch waren."
  };
}

function evidenceFieldStatus(field, value, required) {
  const stringValue = String(value ?? "");
  const known = isKnownEvidenceValue(stringValue);
  return {
    field,
    required,
    known,
    value_hash: known ? `sha256:${sha256(stringValue)}` : "",
    reason: known ? "" : "missing-or-placeholder"
  };
}

function isKnownEvidenceValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  return ![
    "unknown",
    "sha256:unknown",
    "sha256:missing",
    "sha256:unavailable",
    "null",
    "undefined"
  ].includes(lower);
}

function stats(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  const count = sorted.length;
  const mean = count ? sorted.reduce((sum, value) => sum + value, 0) / count : 0;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const variance = count > 1
    ? sorted.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (count - 1)
    : 0;
  const stddev = Math.sqrt(variance);

  return {
    count,
    sum: total,
    min: count ? sorted[0] : 0,
    max: count ? sorted[count - 1] : 0,
    mean: Math.round(mean),
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    stddev: Math.round(stddev),
    ci95: count > 1 ? Math.round(1.96 * (stddev / Math.sqrt(count))) : 0
  };
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return 0;
  const sorted = [...sortedValues].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function lookupTaskPassed(variant, taskPassed = []) {
  const map = parseKeyValueFiles(taskPassed);
  if (!(variant in map)) return undefined;
  return map[variant] === true || map[variant] === "true" || map[variant] === "pass" || map[variant] === "passed";
}

function parseKeyValueFiles(items = []) {
  const result = {};
  for (const item of asArray(items)) {
    const parsed = parseKeyValue(item);
    if (parsed.key) result[normalizeVariant(parsed.key)] = parsed.value;
  }
  return result;
}

function lookupVariantRunValue(map = {}, variant, repeatIndex) {
  const normalizedVariant = normalizeVariant(variant);
  const runKey = repeatIndex ? `${normalizedVariant}.r${repeatIndex}` : "";
  return (runKey && map?.[runKey]) || map?.[normalizedVariant] || "";
}

function parseKeyValue(item) {
  const text = String(item || "");
  const separator = text.includes("=") ? "=" : ":";
  const index = text.indexOf(separator);
  if (index === -1) return { key: text.trim(), value: "" };
  return {
    key: text.slice(0, index).trim(),
    value: coerceScalar(text.slice(index + 1).trim())
  };
}

function normalizeVariant(value) {
  return String(value || "").trim().replace(/-/g, "_");
}

function coerceScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function nullableSubtract(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? left - right : null;
}

function percent(value, baseline) {
  if (!Number.isFinite(value) || !baseline) return null;
  return Math.round((value / baseline) * 100);
}

function roundTo(value, decimals) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatSigned(value) {
  if (value === null || value === undefined) return "n/a";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${formatNumber(number)}`;
}

function formatMaybeNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "n/a"
    : formatNumber(value);
}

async function hashOptionalFile(root, filePath) {
  if (!filePath) return "sha256:unknown";
  return hashMaybeExisting(resolveAgainstRoot(root, filePath));
}

async function hashPathIfExists(filePath) {
  return hashMaybeExisting(filePath);
}

async function hashMaybeExisting(filePath) {
  try {
    const bytes = await fs.readFile(filePath);
    return `sha256:${sha256(bytes)}`;
  } catch (error) {
    if (error.code === "ENOENT") return "sha256:missing";
    return "sha256:unavailable";
  }
}

function readCommandVersion(command) {
  try {
    const output = execFileSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function readGit(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function resolveAgainstRoot(root, filePath) {
  if (!filePath) return "";
  if (path.isAbsolute(String(filePath))) return String(filePath);
  return path.resolve(root, String(filePath));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
