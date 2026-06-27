import { createHash } from "node:crypto";
import path from "node:path";
import { buildHandoffLedgerReport, DEFAULT_HANDOFF_LEDGER_PATH } from "./handoff-ledger.mjs";
import { buildPromptPreparationLedgerReport, DEFAULT_PROMPT_PREPARATION_LEDGER_PATH } from "./prompt-preparation-ledger.mjs";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { buildSavingsLedgerReport, DEFAULT_SAVINGS_LEDGER_PATH } from "./savings-ledger.mjs";
import { buildTaskOutcomeLedgerReport, DEFAULT_TASK_OUTCOME_LEDGER_PATH } from "./task-outcome-ledger.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildSparkompassImpactReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const savingsLedger = await buildSavingsLedgerReport(root, {
    ledger: options.savingsLedger || options.ledger || DEFAULT_SAVINGS_LEDGER_PATH
  });
  const handoffLedger = await buildHandoffLedgerReport(root, {
    ledger: options.handoffLedger || DEFAULT_HANDOFF_LEDGER_PATH
  });
  const taskOutcomeLedger = await buildTaskOutcomeLedgerReport(root, {
    ledger: options.taskOutcomeLedger || DEFAULT_TASK_OUTCOME_LEDGER_PATH
  });
  const promptPreparationLedger = await buildPromptPreparationLedgerReport(root, {
    ledger: options.promptPreparationLedger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH
  });
  const evidence = buildImpactEvidence({
    savingsLedger,
    handoffLedger,
    taskOutcomeLedger,
    promptPreparationLedger
  });
  const gate = buildImpactGate(evidence);

  return {
    schema: "SparkompassImpactReportV1",
    report_id: `impact-${sha256(`${root}:${savingsLedger.ledger_id}:${handoffLedger.ledger_id}:${taskOutcomeLedger.ledger_id}:${promptPreparationLedger.ledger_id}`).slice(0, 12)}`,
    root,
    generated_at: new Date().toISOString(),
    gate,
    ledgers: {
      savings: summarizeSavingsLedger(savingsLedger),
      handoff: summarizeHandoffLedger(handoffLedger),
      task_outcome: summarizeTaskOutcomeLedger(taskOutcomeLedger),
      prompt_preparation: summarizePromptPreparationLedger(promptPreparationLedger)
    },
    impact: buildImpactMetrics(evidence),
    quality: buildQualityMetrics(evidence),
    bars: buildBars(evidence),
    caveats: [
      "Token counts are local planning estimates, not billing data.",
      "Handoff savings are start-context estimates; ContextPack savings are delivered-token receipts.",
      "An empty ledger means no real run has been recorded yet, not that Sparkompass failed."
    ],
    next_actions: buildNextActions(gate)
  };
}

export function formatSparkompassImpactReport(report) {
  const impact = report.impact;
  const quality = report.quality;
  return `
# SparkompassImpactReportV1

Pfad: ${report.root}
Gate: ${report.gate.status}

- Gelieferte ContextPack-Ersparnis: ${report.bars.delivered_context_pack_savings}
- Geschätzte Startkontext-Ersparnis: ${report.bars.start_context_savings}
- Sendbare Prompt-Ersparnis: ${report.bars.sendable_prompt_savings}
- Kombinierte Kontext-Ersparnis: ${report.bars.combined_context_savings}
- Verifizierte Kontext-Ersparnis: ${report.bars.verified_combined_context_savings}
- Qualitätsgegatede positive Kontext-Ersparnis: ${report.bars.quality_gated_combined_context_savings}
- Qualitätsgegatede sendbare Prompt-Ersparnis: ${report.bars.verified_sendable_prompt_savings}
- Verifizierte Packs/Handoffs/Prompts/Tasks: ${formatNumber(quality.verified_packs)}/${formatNumber(report.ledgers.savings.entries)} Packs (${formatNumber(quality.quality_gated_pack_saving_entries)} sparend), ${formatNumber(quality.verified_handoffs)}/${formatNumber(report.ledgers.handoff.entries)} Handoffs (${formatNumber(quality.quality_gated_handoff_saving_handoffs)} sparend), ${formatNumber(quality.verified_prompt_preparations)}/${formatNumber(report.ledgers.prompt_preparation.entries)} Prompts (${formatNumber(quality.quality_gated_prompt_saving_preparations)} sparend), ${formatNumber(quality.verified_tasks)}/${formatNumber(report.ledgers.task_outcome.entries)} Tasks
- Verifikationsrate Tasks: ${formatNumber(quality.task_verification_rate_percent)}%
- Tokens pro verifiziertem Task: ${formatNumber(impact.context_tokens_per_verified_task)} Kontext, ${formatNumber(impact.output_tokens_per_verified_task)} Output
- p95 geliefert/Startprompt/sendbarer Prompt/Output: ${formatNumber(impact.p95_delivered_tokens)} / ${formatNumber(impact.p95_start_prompt_tokens)} / ${formatNumber(impact.p95_sendable_prompt_tokens)} / ${formatNumber(impact.p95_output_tokens)}
- Fallbacks und Risiken: ${formatNumber(quality.full_context_fallbacks)} Pack-Vollkontext-Fallbacks, ${formatNumber(quality.prompt_preparation_full_context_fallbacks)} Prompt-Vollkontext-Fallbacks, ${formatNumber(quality.risky_compressions)} riskante Verdichtungen, ${formatNumber(quality.blocked_handoffs)} blockierte Handoffs, ${formatNumber(quality.review_prompt_preparations)} Review-Prompts, ${formatNumber(quality.review_tasks)} Review-Tasks

## Blocker

${report.gate.blockers.length ? report.gate.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- keine"}

## Hinweise

${report.gate.warnings.length ? report.gate.warnings.map((warning) => `- ${warning}`).join("\n") : "- keine"}

## Nächste Schritte

${report.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

function buildImpactEvidence({ savingsLedger, handoffLedger, taskOutcomeLedger, promptPreparationLedger }) {
  const deliveredOriginal = savingsLedger.totals.original_tokens;
  const deliveredCompact = savingsLedger.totals.delivered_tokens;
  const startOriginal = handoffLedger.totals.inventory_tokens;
  const startCompact = handoffLedger.totals.start_prompt_tokens;
  const promptOriginal = promptPreparationLedger.totals.input_tokens;
  const promptSendable = promptPreparationLedger.totals.sendable_prompt_tokens;
  const combinedOriginal = deliveredOriginal + startOriginal;
  const combinedCompact = deliveredCompact + startCompact;
  const verifiedDeliveredOriginal = savingsLedger.totals.verified_original_tokens;
  const verifiedDeliveredCompact = savingsLedger.totals.verified_delivered_tokens;
  const qualityGatedDeliveredOriginal = savingsLedger.totals.quality_gated_original_tokens;
  const qualityGatedDeliveredCompact = savingsLedger.totals.quality_gated_delivered_tokens;
  const verifiedStartOriginal = handoffLedger.totals.quality_gated_inventory_tokens;
  const verifiedStartCompact = handoffLedger.totals.quality_gated_start_prompt_tokens;
  const verifiedPromptOriginal = promptPreparationLedger.totals.verified_input_tokens;
  const verifiedPromptSendable = promptPreparationLedger.totals.verified_sendable_prompt_tokens;
  const verifiedCombinedOriginal = verifiedDeliveredOriginal + verifiedStartOriginal;
  const verifiedCombinedCompact = verifiedDeliveredCompact + verifiedStartCompact;
  const qualityGatedCombinedOriginal = qualityGatedDeliveredOriginal + verifiedStartOriginal;
  const qualityGatedCombinedCompact = qualityGatedDeliveredCompact + verifiedStartCompact;

  return {
    savingsLedger,
    handoffLedger,
    taskOutcomeLedger,
    promptPreparationLedger,
    deliveredSavings: calculateSavings(deliveredOriginal, deliveredCompact),
    startSavings: calculateSavings(startOriginal, startCompact),
    sendablePromptSavings: calculateSavings(promptOriginal, promptSendable),
    combinedSavings: calculateSavings(combinedOriginal, combinedCompact),
    verifiedDeliveredSavings: calculateSavings(verifiedDeliveredOriginal, verifiedDeliveredCompact),
    qualityGatedDeliveredSavings: calculateSavings(qualityGatedDeliveredOriginal, qualityGatedDeliveredCompact),
    verifiedStartSavings: calculateSavings(verifiedStartOriginal, verifiedStartCompact),
    verifiedSendablePromptSavings: calculateSavings(verifiedPromptOriginal, verifiedPromptSendable),
    verifiedCombinedSavings: calculateSavings(verifiedCombinedOriginal, verifiedCombinedCompact),
    qualityGatedCombinedSavings: calculateSavings(qualityGatedCombinedOriginal, qualityGatedCombinedCompact)
  };
}

function buildImpactGate(evidence) {
  const blockers = [];
  const warnings = [];
  const savingsTotals = evidence.savingsLedger.totals;
  const handoffTotals = evidence.handoffLedger.totals;
  const taskTotals = evidence.taskOutcomeLedger.totals;
  const promptTotals = evidence.promptPreparationLedger.totals;

  if (!savingsTotals.entries) warnings.push("no-savings-ledger-entries");
  if (!handoffTotals.entries) warnings.push("no-handoff-ledger-entries");
  if (!taskTotals.entries) warnings.push("no-task-outcome-ledger-entries");
  if (!promptTotals.entries) warnings.push("no-prompt-preparation-ledger-entries");
  if (savingsTotals.entries && !savingsTotals.verified_entries) blockers.push("no-verified-savings");
  if (handoffTotals.entries && !handoffTotals.verified_handoffs) blockers.push("no-verified-handoffs");
  if (handoffTotals.entries && !handoffTotals.quality_gated_handoff_saving_handoffs) {
    blockers.push("no-quality-gated-handoff-saving-handoffs");
  }
  if (taskTotals.entries && !taskTotals.verified_tasks) blockers.push("no-verified-tasks");
  if (promptTotals.entries && !promptTotals.verified_preparations) blockers.push("no-verified-prompt-preparations");
  if (promptTotals.entries && !promptTotals.quality_gated_prompt_saving_preparations) {
    blockers.push("no-quality-gated-prompt-saving-preparations");
  }
  if (savingsTotals.entries && !savingsTotals.quality_gated_saving_entries) {
    blockers.push("no-quality-gated-contextpack-saving-entries");
  }
  if (savingsTotals.needs_review_entries) blockers.push("savings-review-required");
  if (handoffTotals.needs_review_handoffs) blockers.push("handoff-review-required");
  if (savingsTotals.full_context_fallbacks) blockers.push("full-context-fallbacks-present");
  if (savingsTotals.risky_compressions) blockers.push("risky-compressions-present");
  if (handoffTotals.blocked_handoffs) blockers.push("blocked-handoffs-present");
  if (promptTotals.needs_review_preparations) blockers.push("prompt-preparation-review-required");
  if (promptTotals.full_context_fallbacks) blockers.push("prompt-preparation-full-context-fallbacks-present");
  if (promptTotals.blocked_preparations) blockers.push("blocked-prompt-preparations-present");
  if (taskTotals.needs_review_tasks) blockers.push("task-review-required");
  if (taskTotals.output_oracle_failures) blockers.push("task-output-oracle-failures");
  if (taskTotals.output_oracle_sensitivity_failures) blockers.push("task-output-oracle-sensitivity-failures");
  if (taskTotals.receipt_verification_failures) blockers.push("receipt-verification-failures");
  if (savingsTotals.entries && savingsTotals.minimum_critical_anchor_retention_percent < 100) {
    blockers.push("critical-anchor-retention-below-100");
  }
  if (savingsTotals.entries && savingsTotals.minimum_source_evidence_coverage_percent < 100) {
    blockers.push("source-evidence-coverage-below-100");
  }
  if (promptTotals.entries && promptTotals.minimum_critical_anchor_retention_percent < 100) {
    blockers.push("prompt-preparation-critical-anchor-retention-below-100");
  }
  if (promptTotals.entries && promptTotals.minimum_source_evidence_coverage_percent < 100) {
    blockers.push("prompt-preparation-source-evidence-coverage-below-100");
  }

  const hasMeasuredImpact = savingsTotals.entries > 0
    || handoffTotals.entries > 0
    || taskTotals.entries > 0
    || promptTotals.entries > 0;
  const verified = hasMeasuredImpact && blockers.length === 0;

  return {
    status: verified ? "verified-impact" : hasMeasuredImpact ? "impact-needs-review" : "impact-ledger-empty",
    verified,
    blockers,
    warnings,
    measured: hasMeasuredImpact
  };
}

function buildImpactMetrics(evidence) {
  const savingsTotals = evidence.savingsLedger.totals;
  const handoffTotals = evidence.handoffLedger.totals;
  const taskTotals = evidence.taskOutcomeLedger.totals;
  const promptTotals = evidence.promptPreparationLedger.totals;

  return {
    delivered_context_pack_tokens: savingsTotals.delivered_tokens,
    delivered_context_pack_saved_tokens: savingsTotals.delivered_saved_tokens,
    delivered_context_pack_savings_percent: savingsTotals.delivered_savings_percent,
    verified_delivered_context_pack_tokens: savingsTotals.verified_delivered_tokens,
    verified_delivered_context_pack_saved_tokens: savingsTotals.verified_delivered_saved_tokens,
    verified_delivered_context_pack_savings_percent: savingsTotals.verified_delivered_savings_percent,
    quality_gated_delivered_context_pack_tokens: savingsTotals.quality_gated_delivered_tokens,
    quality_gated_delivered_context_pack_saved_tokens: savingsTotals.quality_gated_delivered_saved_tokens,
    quality_gated_delivered_context_pack_savings_percent: savingsTotals.quality_gated_delivered_savings_percent,
    start_prompt_tokens: handoffTotals.start_prompt_tokens,
    start_context_saved_tokens: handoffTotals.start_context_saved_tokens,
    start_context_savings_percent: handoffTotals.start_context_savings_percent,
    verified_start_prompt_tokens: handoffTotals.verified_start_prompt_tokens,
    verified_start_context_saved_tokens: handoffTotals.verified_start_context_saved_tokens,
    verified_start_context_savings_percent: handoffTotals.verified_start_context_savings_percent,
    quality_gated_start_prompt_tokens: handoffTotals.quality_gated_start_prompt_tokens,
    quality_gated_start_context_saved_tokens: handoffTotals.quality_gated_start_context_saved_tokens,
    quality_gated_start_context_savings_percent: handoffTotals.quality_gated_start_context_savings_percent,
    sendable_prompt_tokens: promptTotals.sendable_prompt_tokens,
    sendable_prompt_saved_tokens: promptTotals.sendable_prompt_saved_tokens,
    sendable_prompt_savings_percent: promptTotals.sendable_prompt_savings_percent,
    verified_sendable_prompt_tokens: promptTotals.verified_sendable_prompt_tokens,
    verified_sendable_prompt_saved_tokens: promptTotals.verified_sendable_prompt_saved_tokens,
    verified_sendable_prompt_savings_percent: promptTotals.verified_sendable_prompt_savings_percent,
    prepared_prompt_entries: promptTotals.entries,
    combined_original_tokens: evidence.combinedSavings.originalTokens,
    combined_delivered_tokens: evidence.combinedSavings.compactTokens,
    combined_saved_tokens: evidence.combinedSavings.savedTokens,
    combined_savings_percent: evidence.combinedSavings.percent,
    verified_combined_original_tokens: evidence.verifiedCombinedSavings.originalTokens,
    verified_combined_delivered_tokens: evidence.verifiedCombinedSavings.compactTokens,
    verified_combined_saved_tokens: evidence.verifiedCombinedSavings.savedTokens,
    verified_combined_savings_percent: evidence.verifiedCombinedSavings.percent,
    quality_gated_combined_original_tokens: evidence.qualityGatedCombinedSavings.originalTokens,
    quality_gated_combined_delivered_tokens: evidence.qualityGatedCombinedSavings.compactTokens,
    quality_gated_combined_saved_tokens: evidence.qualityGatedCombinedSavings.savedTokens,
    quality_gated_combined_savings_percent: evidence.qualityGatedCombinedSavings.percent,
    context_tokens_per_verified_task: taskTotals.context_tokens_per_verified_task,
    output_tokens_per_verified_task: taskTotals.output_tokens_per_verified_task,
    p95_delivered_tokens: savingsTotals.p95_delivered_tokens,
    p95_start_prompt_tokens: handoffTotals.p95_start_prompt_tokens,
    p95_sendable_prompt_tokens: promptTotals.p95_sendable_prompt_tokens,
    p95_output_tokens: taskTotals.p95_output_tokens
  };
}

function buildQualityMetrics(evidence) {
  const savingsTotals = evidence.savingsLedger.totals;
  const handoffTotals = evidence.handoffLedger.totals;
  const taskTotals = evidence.taskOutcomeLedger.totals;
  const promptTotals = evidence.promptPreparationLedger.totals;

  return {
    verified_packs: savingsTotals.verified_entries,
    quality_gated_pack_saving_entries: savingsTotals.quality_gated_saving_entries,
    review_packs: savingsTotals.needs_review_entries,
    verified_handoffs: handoffTotals.verified_handoffs,
    quality_gated_handoff_saving_handoffs: handoffTotals.quality_gated_handoff_saving_handoffs,
    review_handoffs: handoffTotals.needs_review_handoffs,
    verified_prompt_preparations: promptTotals.verified_preparations,
    quality_gated_prompt_saving_preparations: promptTotals.quality_gated_prompt_saving_preparations,
    verified_tasks: taskTotals.verified_tasks,
    task_verification_rate_percent: taskTotals.verification_rate_percent,
    review_prompt_preparations: promptTotals.needs_review_preparations,
    review_tasks: taskTotals.needs_review_tasks,
    full_context_fallbacks: savingsTotals.full_context_fallbacks,
    prompt_preparation_fallbacks: promptTotals.fallback_count,
    prompt_preparation_full_context_fallbacks: promptTotals.full_context_fallbacks,
    blocked_prompt_preparations: promptTotals.blocked_preparations,
    expanded_contexts: savingsTotals.expanded_contexts,
    risky_compressions: savingsTotals.risky_compressions,
    blocked_handoffs: handoffTotals.blocked_handoffs,
    minimum_critical_anchor_retention_percent: savingsTotals.minimum_critical_anchor_retention_percent,
    minimum_source_evidence_coverage_percent: savingsTotals.minimum_source_evidence_coverage_percent,
    receipt_verification_failures: taskTotals.receipt_verification_failures,
    output_oracle_failures: taskTotals.output_oracle_failures,
    output_oracle_sensitivity_failures: taskTotals.output_oracle_sensitivity_failures
  };
}

function buildBars(evidence) {
  return {
    delivered_context_pack_savings: formatSavingsBar(evidence.deliveredSavings),
    start_context_savings: formatSavingsBar(evidence.startSavings),
    sendable_prompt_savings: formatSavingsBar(evidence.sendablePromptSavings),
    combined_context_savings: formatSavingsBar(evidence.combinedSavings),
    verified_delivered_context_pack_savings: formatSavingsBar(evidence.verifiedDeliveredSavings),
    quality_gated_delivered_context_pack_savings: formatSavingsBar(evidence.qualityGatedDeliveredSavings),
    verified_start_context_savings: formatSavingsBar(evidence.verifiedStartSavings),
    verified_sendable_prompt_savings: formatSavingsBar(evidence.verifiedSendablePromptSavings),
    verified_combined_context_savings: formatSavingsBar(evidence.verifiedCombinedSavings),
    quality_gated_combined_context_savings: formatSavingsBar(evidence.qualityGatedCombinedSavings)
  };
}

function summarizeSavingsLedger(ledger) {
  return {
    schema: ledger.schema,
    path: ledger.path,
    entries: ledger.totals.entries,
    verified_entries: ledger.totals.verified_entries,
    quality_gated_saving_entries: ledger.totals.quality_gated_saving_entries,
    needs_review_entries: ledger.totals.needs_review_entries,
    delivered_savings_percent: ledger.totals.delivered_savings_percent,
    delivered_saved_tokens: ledger.totals.delivered_saved_tokens,
    delivered_tokens: ledger.totals.delivered_tokens,
    original_tokens: ledger.totals.original_tokens,
    verified_delivered_savings_percent: ledger.totals.verified_delivered_savings_percent,
    verified_delivered_saved_tokens: ledger.totals.verified_delivered_saved_tokens,
    verified_delivered_tokens: ledger.totals.verified_delivered_tokens,
    verified_original_tokens: ledger.totals.verified_original_tokens,
    quality_gated_delivered_savings_percent: ledger.totals.quality_gated_delivered_savings_percent,
    quality_gated_delivered_saved_tokens: ledger.totals.quality_gated_delivered_saved_tokens,
    quality_gated_delivered_tokens: ledger.totals.quality_gated_delivered_tokens,
    quality_gated_original_tokens: ledger.totals.quality_gated_original_tokens,
    p95_delivered_tokens: ledger.totals.p95_delivered_tokens,
    full_context_fallbacks: ledger.totals.full_context_fallbacks,
    risky_compressions: ledger.totals.risky_compressions,
    minimum_critical_anchor_retention_percent: ledger.totals.minimum_critical_anchor_retention_percent,
    minimum_source_evidence_coverage_percent: ledger.totals.minimum_source_evidence_coverage_percent
  };
}

function summarizeHandoffLedger(ledger) {
  return {
    schema: ledger.schema,
    path: ledger.path,
    entries: ledger.totals.entries,
    verified_handoffs: ledger.totals.verified_handoffs,
    quality_gated_handoff_saving_handoffs: ledger.totals.quality_gated_handoff_saving_handoffs,
    needs_review_handoffs: ledger.totals.needs_review_handoffs,
    inventory_tokens: ledger.totals.inventory_tokens,
    start_prompt_tokens: ledger.totals.start_prompt_tokens,
    start_context_saved_tokens: ledger.totals.start_context_saved_tokens,
    start_context_savings_percent: ledger.totals.start_context_savings_percent,
    verified_start_prompt_tokens: ledger.totals.verified_start_prompt_tokens,
    verified_start_context_saved_tokens: ledger.totals.verified_start_context_saved_tokens,
    verified_start_context_savings_percent: ledger.totals.verified_start_context_savings_percent,
    verified_inventory_tokens: ledger.totals.verified_inventory_tokens,
    quality_gated_start_prompt_tokens: ledger.totals.quality_gated_start_prompt_tokens,
    quality_gated_start_context_saved_tokens: ledger.totals.quality_gated_start_context_saved_tokens,
    quality_gated_start_context_savings_percent: ledger.totals.quality_gated_start_context_savings_percent,
    quality_gated_inventory_tokens: ledger.totals.quality_gated_inventory_tokens,
    p95_start_prompt_tokens: ledger.totals.p95_start_prompt_tokens,
    blocked_handoffs: ledger.totals.blocked_handoffs
  };
}

function summarizeTaskOutcomeLedger(ledger) {
  return {
    schema: ledger.schema,
    path: ledger.path,
    entries: ledger.totals.entries,
    verified_tasks: ledger.totals.verified_tasks,
    needs_review_tasks: ledger.totals.needs_review_tasks,
    verification_rate_percent: ledger.totals.verification_rate_percent,
    output_oracle_failures: ledger.totals.output_oracle_failures,
    output_oracle_sensitivity_failures: ledger.totals.output_oracle_sensitivity_failures,
    receipt_verification_failures: ledger.totals.receipt_verification_failures,
    context_tokens_per_verified_task: ledger.totals.context_tokens_per_verified_task,
    output_tokens_per_verified_task: ledger.totals.output_tokens_per_verified_task,
    p95_output_tokens: ledger.totals.p95_output_tokens
  };
}

function summarizePromptPreparationLedger(ledger) {
  return {
    schema: ledger.schema,
    path: ledger.path,
    entries: ledger.totals.entries,
    verified_preparations: ledger.totals.verified_preparations,
    quality_gated_prompt_saving_preparations: ledger.totals.quality_gated_prompt_saving_preparations,
    needs_review_preparations: ledger.totals.needs_review_preparations,
    input_tokens: ledger.totals.input_tokens,
    sendable_prompt_tokens: ledger.totals.sendable_prompt_tokens,
    sendable_prompt_saved_tokens: ledger.totals.sendable_prompt_saved_tokens,
    sendable_prompt_savings_percent: ledger.totals.sendable_prompt_savings_percent,
    verified_sendable_prompt_tokens: ledger.totals.verified_sendable_prompt_tokens,
    verified_sendable_prompt_saved_tokens: ledger.totals.verified_sendable_prompt_saved_tokens,
    verified_sendable_prompt_savings_percent: ledger.totals.verified_sendable_prompt_savings_percent,
    verified_input_tokens: ledger.totals.verified_input_tokens,
    p95_sendable_prompt_tokens: ledger.totals.p95_sendable_prompt_tokens,
    p95_sendable_saved_tokens: ledger.totals.p95_sendable_saved_tokens,
    fallback_count: ledger.totals.fallback_count,
    full_context_fallbacks: ledger.totals.full_context_fallbacks,
    blocked_preparations: ledger.totals.blocked_preparations,
    minimum_critical_anchor_retention_percent: ledger.totals.minimum_critical_anchor_retention_percent,
    minimum_source_evidence_coverage_percent: ledger.totals.minimum_source_evidence_coverage_percent
  };
}

function buildNextActions(gate) {
  if (gate.verified) {
    return [
      "Nutze diesen Impact Report als lesbaren Sparbeleg für den aktuellen Ledger-Satz.",
      "Zeichne Pack-, Handoff-, PromptPreparation- und TaskOutcome-Ledgers bei echten Codex-Läufen weiter auf, damit aus Schätzungen Verlauf wird."
    ];
  }
  if (!gate.measured) {
    return [
      "Führe zuerst sparkompass pilot . --ledger-dir .sparkompass/pilot-run aus oder zeichne einen echten Pack-/Handoff-/Task-Lauf auf.",
      "Starte danach sparkompass impact . mit denselben Ledger-Pfaden, inklusive PromptPreparationLedger, um die Ersparnis mit Qualitätsevidenz zu belegen."
    ];
  }
  return [
    "Behebe die gelisteten Blocker, bevor die Ersparnis als qualitätserhaltender Impact praesentiert wird.",
    "Bevorzuge neue verifizierte TaskOutcomeReceipts gegenüber größerer Ersparnis, wenn ein Zielkonflikt entsteht."
  ];
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
