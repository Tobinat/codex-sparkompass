import path from "node:path";
import { runBenchmark } from "./benchmark.mjs";
import { runDogfood } from "./dogfood.mjs";
import { buildEnvelopeLedgerReport, DEFAULT_ENVELOPE_LEDGER_PATH } from "./envelope-ledger.mjs";
import { buildHandoffLedgerReport, DEFAULT_HANDOFF_LEDGER_PATH } from "./handoff-ledger.mjs";
import { buildPromptPreparationLedgerReport, DEFAULT_PROMPT_PREPARATION_LEDGER_PATH } from "./prompt-preparation-ledger.mjs";
import { formatSavingsBar } from "./savings.mjs";
import { buildSavingsLedgerReport, DEFAULT_SAVINGS_LEDGER_PATH } from "./savings-ledger.mjs";
import { buildTaskOutcomeLedgerReport, DEFAULT_TASK_OUTCOME_LEDGER_PATH } from "./task-outcome-ledger.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildSparkompassScorecard(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const targetPercent = Number(options.targetPercent) || 35;
  const minSaving = Number(options.minSaving) || 35;
  const minAnchors = Number(options.minAnchors) || 75;
  const allowRisk = Boolean(options.allowRisk);
  const savingsLedgerPath = options.savingsLedger || options.ledger || DEFAULT_SAVINGS_LEDGER_PATH;
  const taskOutcomeLedgerPath = options.taskOutcomeLedger || DEFAULT_TASK_OUTCOME_LEDGER_PATH;
  const envelopeLedgerPath = options.envelopeLedger || DEFAULT_ENVELOPE_LEDGER_PATH;
  const handoffLedgerPath = options.handoffLedger || DEFAULT_HANDOFF_LEDGER_PATH;
  const promptPreparationLedgerPath = options.promptPreparationLedger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH;

  const dogfood = await runDogfood(root, {
    targetPercent,
    minSaving,
    minAnchors,
    allowRisk
  });
  const benchmark = await runBenchmark(root, {
    targetPercent
  });
  const savingsLedger = await buildSavingsLedgerReport(root, {
    ledger: savingsLedgerPath
  });
  const taskOutcomeLedger = await buildTaskOutcomeLedgerReport(root, {
    ledger: taskOutcomeLedgerPath
  });
  const envelopeLedger = await buildEnvelopeLedgerReport(root, {
    ledger: envelopeLedgerPath
  });
  const handoffLedger = await buildHandoffLedgerReport(root, {
    ledger: handoffLedgerPath
  });
  const promptPreparationLedger = await buildPromptPreparationLedgerReport(root, {
    ledger: promptPreparationLedgerPath
  });
  const checks = buildChecks({ dogfood, benchmark, allowRisk });
  const blockers = checks.filter((check) => check.required && !check.passed);
  const warnings = buildWarnings({ savingsLedger, taskOutcomeLedger, envelopeLedger, handoffLedger, promptPreparationLedger, allowRisk });
  const verified = blockers.length === 0;

  return {
    schema: "SparkompassScorecardV1",
    root,
    generated_at: new Date().toISOString(),
    target_percent: targetPercent,
    release_readiness: {
      status: verified ? "verified-scorecard" : "scorecard-needs-review",
      verified,
      blockers: blockers.map((check) => check.id),
      warnings
    },
    gates: {
      dogfood: {
        status: dogfood.gate.publishable ? "verified-publishable" : "dogfood-needs-review",
        verified: dogfood.gate.publishable,
        failures: dogfood.gate.failures
      },
      benchmark: {
        status: benchmark.totals.verified ? "verified-benchmark" : "benchmark-regression",
        verified: benchmark.totals.verified
      },
      task_outcome: {
        status: benchmark.totals.task_outcomes_verified === benchmark.totals.cases
          ? "verified-task-outcomes"
          : "task-outcomes-need-review",
        verified: benchmark.totals.task_outcomes_verified === benchmark.totals.cases,
        verified_count: benchmark.totals.task_outcomes_verified,
        total: benchmark.totals.cases
      }
    },
    checks,
    metrics: {
      dogfood: {
        average_savings_percent: dogfood.totals.averageSaving,
        minimum_anchor_retention_percent: dogfood.totals.minimumAnchorRetention,
        minimum_critical_anchor_retention_percent: dogfood.totals.minimumCriticalRetention,
        minimum_source_evidence_coverage_percent: dogfood.totals.minimumSourceCoverage,
        p95_delivered_tokens: dogfood.totals.p95DeliveredTokens,
        p95_saved_tokens: dogfood.totals.p95SavedTokens,
        expanded_contexts: dogfood.totals.expandedContexts,
        full_context_fallbacks: dogfood.totals.fallbacks,
        risky_compressions: dogfood.totals.risky,
        worst_case: dogfood.totals.worstCase
      },
      benchmark: {
        context_successes: benchmark.totals.context_successes,
        task_outcomes_verified: benchmark.totals.task_outcomes_verified,
        cases: benchmark.totals.cases,
        failure_corpus_successes: benchmark.totals.failure_corpus_successes,
        failure_corpus_cases: benchmark.totals.failure_corpus_cases,
        failure_corpus_coverage: benchmark.totals.failure_corpus_coverage,
        context_pack_quality: benchmark.totals.context_pack_quality,
        regressions: benchmark.totals.regressions,
        counterfactuals_detected: benchmark.totals.counterfactuals_detected,
        counterfactuals: benchmark.totals.counterfactuals,
        average_savings_percent: benchmark.totals.average_savings_percent,
        tokens_per_successful_case: benchmark.totals.tokens_per_successful_case,
        p95_delivered_tokens: benchmark.totals.p95_delivered_tokens,
        efficiency: benchmark.totals.efficiency,
        worst_case: benchmark.totals.worst_case
      },
      savings_ledger: summarizeSavingsLedger(savingsLedger),
      task_outcome_ledger: summarizeTaskOutcomeLedger(taskOutcomeLedger),
      envelope_ledger: summarizeEnvelopeLedger(envelopeLedger),
      handoff_ledger: summarizeHandoffLedger(handoffLedger),
      prompt_preparation_ledger: summarizePromptPreparationLedger(promptPreparationLedger)
    },
    artifacts: {
      dogfood: summarizeDogfood(dogfood),
      benchmark: summarizeBenchmark(benchmark),
      savings_ledger: summarizeSavingsLedger(savingsLedger),
      task_outcome_ledger: summarizeTaskOutcomeLedger(taskOutcomeLedger),
      envelope_ledger: summarizeEnvelopeLedger(envelopeLedger),
      handoff_ledger: summarizeHandoffLedger(handoffLedger),
      prompt_preparation_ledger: summarizePromptPreparationLedger(promptPreparationLedger)
    },
    next_actions: buildNextActions({ verified, warnings })
  };
}

export function formatSparkompassScorecard(scorecard) {
  return `
# SparkompassScorecardV1

Pfad: ${scorecard.root}
Gate: ${scorecard.release_readiness.status}

- Dogfood: ${scorecard.gates.dogfood.status}, ${scorecard.metrics.dogfood.average_savings_percent}% Ersparnis, kritische Anker ${scorecard.metrics.dogfood.minimum_critical_anchor_retention_percent}%, Belege ${scorecard.metrics.dogfood.minimum_source_evidence_coverage_percent}%
- Benchmark: ${scorecard.gates.benchmark.status}, Kontext ${scorecard.metrics.benchmark.context_successes}/${scorecard.metrics.benchmark.cases}, TaskOutcome ${scorecard.metrics.benchmark.task_outcomes_verified}/${scorecard.metrics.benchmark.cases}, Regressionen ${scorecard.metrics.benchmark.regressions}
- Failure-Corpus-Klassen: ${formatFailureCorpusCoverageLine(scorecard.metrics.benchmark.failure_corpus_coverage)}
- ContextPack-Qualität: ${formatBenchmarkContextPackQualityLine(scorecard.metrics.benchmark.context_pack_quality)}
- Benchmark-Effizienz: ${formatBenchmarkEfficiencyLine(scorecard.metrics.benchmark.efficiency)}
- Gegenfakten: ${formatNumber(scorecard.metrics.benchmark.counterfactuals_detected)}/${formatNumber(scorecard.metrics.benchmark.counterfactuals)} erkannt
- Tokens pro bestandenem Benchmark-Fall: ${formatNumber(scorecard.metrics.benchmark.tokens_per_successful_case)}
- Dogfood p95 geliefert/gespart: ${formatNumber(scorecard.metrics.dogfood.p95_delivered_tokens)} / ${formatNumber(scorecard.metrics.dogfood.p95_saved_tokens)}
- SavingsLedger: ${formatSavingsLedgerLine(scorecard.metrics.savings_ledger)}
- TaskOutcomeLedger: ${formatTaskOutcomeLedgerLine(scorecard.metrics.task_outcome_ledger)}
- EnvelopeLedger: ${formatEnvelopeLedgerLine(scorecard.metrics.envelope_ledger)}
- HandoffLedger: ${formatHandoffLedgerLine(scorecard.metrics.handoff_ledger)}
- PromptPreparationLedger: ${formatPromptPreparationLedgerLine(scorecard.metrics.prompt_preparation_ledger)}

## Blocker

${formatBlockers(scorecard)}

## Hinweise

${formatWarnings(scorecard.release_readiness.warnings)}

## Nächste Schritte

${scorecard.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

function buildChecks({ dogfood, benchmark, allowRisk }) {
  return [
    {
      id: "dogfood-publishable",
      label: "Dogfood Gate",
      required: true,
      passed: dogfood.gate.publishable,
      evidence: dogfood.gate.publishable ? "verified-publishable" : dogfood.gate.failures.join("; ")
    },
    {
      id: "critical-anchors-100",
      label: "Critical anchors",
      required: true,
      passed: dogfood.totals.minimumCriticalRetention === 100,
      evidence: `${dogfood.totals.minimumCriticalRetention}%`
    },
    {
      id: "source-evidence-100",
      label: "Source evidence",
      required: true,
      passed: dogfood.totals.minimumSourceCoverage === 100,
      evidence: `${dogfood.totals.minimumSourceCoverage}%`
    },
    {
      id: "full-context-fallbacks-zero",
      label: "Full-context fallbacks",
      required: true,
      passed: dogfood.totals.fallbacks === 0,
      evidence: String(dogfood.totals.fallbacks)
    },
    {
      id: "risky-compressions-zero",
      label: "Risky compressions",
      required: !allowRisk,
      passed: allowRisk || dogfood.totals.risky === 0,
      evidence: String(dogfood.totals.risky)
    },
    {
      id: "benchmark-verified",
      label: "Benchmark Gate",
      required: true,
      passed: benchmark.totals.verified,
      evidence: benchmark.totals.verified ? "verified-benchmark" : "benchmark-regression"
    },
    {
      id: "benchmark-context-success",
      label: "Benchmark context success",
      required: true,
      passed: benchmark.totals.context_successes === benchmark.totals.cases,
      evidence: `${benchmark.totals.context_successes}/${benchmark.totals.cases}`
    },
    {
      id: "benchmark-task-outcomes",
      label: "Benchmark task outcomes",
      required: true,
      passed: benchmark.totals.task_outcomes_verified === benchmark.totals.cases,
      evidence: `${benchmark.totals.task_outcomes_verified}/${benchmark.totals.cases}`
    },
    {
      id: "failure-corpus-coverage",
      label: "Failure corpus coverage",
      required: true,
      passed: Boolean(benchmark.totals.failure_corpus_coverage?.verified),
      evidence: formatFailureCorpusCoverageLine(benchmark.totals.failure_corpus_coverage)
    },
    {
      id: "benchmark-context-pack-quality",
      label: "Benchmark ContextPack quality",
      required: true,
      passed: Boolean(benchmark.totals.context_pack_quality?.verified),
      evidence: formatBenchmarkContextPackQualityLine(benchmark.totals.context_pack_quality)
    },
    {
      id: "benchmark-regressions-zero",
      label: "Benchmark regressions",
      required: true,
      passed: benchmark.totals.regressions === 0,
      evidence: String(benchmark.totals.regressions)
    },
    {
      id: "counterfactuals-detected",
      label: "Counterfactual sensitivity",
      required: true,
      passed: benchmark.totals.counterfactuals > 0
        && benchmark.totals.counterfactuals_detected === benchmark.totals.counterfactuals,
      evidence: `${benchmark.totals.counterfactuals_detected}/${benchmark.totals.counterfactuals}`
    }
  ];
}

function buildWarnings({ savingsLedger, taskOutcomeLedger, envelopeLedger, handoffLedger, promptPreparationLedger, allowRisk }) {
  const warnings = [];
  if (allowRisk) warnings.push("riskante-verdichtungen-würden-nicht-blockieren");
  if (!savingsLedger.totals.entries) warnings.push("no-savings-ledger-entries");
  if (savingsLedger.totals.needs_review_entries) warnings.push("savings-ledger-review-entries");
  if (!taskOutcomeLedger.totals.entries) {
    warnings.push("no-task-outcome-ledger-entries");
  } else {
    if (!taskOutcomeLedger.totals.verified_tasks) warnings.push("task-outcome-ledger-no-verified-tasks");
    if (taskOutcomeLedger.totals.needs_review_tasks) warnings.push("task-outcome-ledger-review-tasks");
    if (taskOutcomeLedger.totals.output_oracle_failures) warnings.push("task-outcome-ledger-output-oracle-failures");
    if (taskOutcomeLedger.totals.output_oracle_sensitivity_failures) warnings.push("task-outcome-ledger-output-oracle-sensitivity-failures");
    if (taskOutcomeLedger.totals.receipt_verification_failures) warnings.push("task-outcome-ledger-receipt-verification-failures");
  }
  if (!envelopeLedger.totals.entries) warnings.push("no-envelope-ledger-entries");
  if (!handoffLedger.totals.entries) {
    warnings.push("no-handoff-ledger-entries");
  } else if (handoffLedger.totals.needs_review_handoffs) {
    warnings.push("handoff-ledger-review-handoffs");
  }
  if (!promptPreparationLedger.totals.entries) {
    warnings.push("no-prompt-preparation-ledger-entries");
  } else {
    if (!promptPreparationLedger.totals.verified_preparations) warnings.push("prompt-preparation-ledger-no-verified-preparations");
    if (promptPreparationLedger.totals.needs_review_preparations) warnings.push("prompt-preparation-ledger-review-preparations");
    if (promptPreparationLedger.totals.full_context_fallbacks) warnings.push("prompt-preparation-ledger-full-context-fallbacks");
    if (promptPreparationLedger.totals.blocked_preparations) warnings.push("prompt-preparation-ledger-blocked-preparations");
  }
  return warnings;
}

function summarizeDogfood(dogfood) {
  return {
    schema: "SparkompassDogfoodSummaryV1",
    gate: dogfood.gate,
    totals: dogfood.totals,
    cases: dogfood.results.map((result) => result.error
      ? {
        label: result.label,
        error: result.error
      }
      : {
        label: result.label,
        gate_status: result.receipt.gate.status,
        quality_status: result.compressed.quality.status,
        delivered_tokens: result.receipt.delivered_tokens,
        savings_percent: result.receipt.savings.delivered.percent,
        critical_anchor_retention_percent: result.receipt.critical_anchors.retention_percent,
        source_evidence_coverage_percent: Math.round(result.receipt.source_evidence.coverage * 100),
        fallback_mode: result.context.mode
      })
  };
}

function summarizeBenchmark(benchmark) {
  return {
    schema: "SparkompassBenchmarkSummaryV1",
    totals: benchmark.totals,
    cases: benchmark.cases.map((item) => ({
      id: item.id,
      category: item.category,
      failure_class: item.failure_class,
      gate_status: item.gate_status,
      fallback_mode: item.fallback_mode,
      quality_status: item.quality_status,
      context_success: item.context_success,
      regression: item.regression,
      task_outcome_status: item.task_outcome.status,
      task_output_tokens: item.task_outcome.output_tokens,
      delivered_tokens: item.delivered_tokens,
      savings_percent: item.savings_percent
    }))
  };
}

function formatFailureCorpusCoverageLine(coverage) {
  if (!coverage || coverage.schema !== "FailureCorpusCoverageV1") {
    return "nicht berechnet";
  }
  const line = `${coverage.verified_classes.length}/${coverage.required_classes.length} verifiziert`;
  if (coverage.verified) return line;
  const details = [
    coverage.missing_classes.length ? `fehlend ${coverage.missing_classes.join(", ")}` : "",
    coverage.failed_classes.length ? `fehlgeschlagen ${coverage.failed_classes.join(", ")}` : ""
  ].filter(Boolean).join("; ");
  return details ? `${line}, ${details}` : line;
}

function formatBenchmarkContextPackQualityLine(quality) {
  if (!quality || quality.schema !== "BenchmarkContextPackQualityV1") {
    return "nicht berechnet";
  }
  const line = `${quality.verified_cases}/${quality.cases} verifiziert, kritische Anker min. ${quality.minimum_critical_anchor_retention_percent}%, Belege min. ${quality.minimum_source_evidence_coverage_percent}%`;
  if (quality.verified) return line;
  const details = quality.failed_cases
    .map((item) => `${item.id}: ${item.failures.join(",")}`)
    .join("; ");
  return details ? `${line}, Fehler ${details}` : line;
}

function formatBenchmarkEfficiencyLine(efficiency) {
  if (!efficiency || efficiency.schema !== "BenchmarkEfficiencyMetricsV1") {
    return "nicht berechnet";
  }
  return `${formatNumber(efficiency.total_cost_tokens_per_verified_task)} Tokens/verifiziertem Task, Delta ${efficiency.task_success_delta_percent}%, Fallback ${efficiency.fallback_rate_percent}%, Nachladen ${efficiency.on_demand_load_rate_percent}%, Cache ${efficiency.cache_hit_rate_percent}%`;
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
    fallback_rate_percent: ledger.totals.fallback_rate_percent,
    full_context_fallbacks: ledger.totals.full_context_fallbacks,
    risky_compressions: ledger.totals.risky_compressions
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
    review_rate_percent: ledger.totals.review_rate_percent,
    failed_exit_tasks: ledger.totals.failed_exit_tasks,
    output_oracle_failures: ledger.totals.output_oracle_failures,
    output_oracle_sensitivity_failures: ledger.totals.output_oracle_sensitivity_failures,
    receipt_verification_failures: ledger.totals.receipt_verification_failures,
    linked_context_packs: ledger.totals.linked_context_packs,
    output_tokens_per_verified_task: ledger.totals.output_tokens_per_verified_task,
    context_tokens_per_verified_task: ledger.totals.context_tokens_per_verified_task,
    p95_output_tokens: ledger.totals.p95_output_tokens,
    p95_context_pack_delivered_tokens: ledger.totals.p95_context_pack_delivered_tokens,
    average_duration_ms: ledger.totals.average_duration_ms,
    p95_duration_ms: ledger.totals.p95_duration_ms,
    review_reasons: ledger.totals.review_reasons || []
  };
}

function summarizeEnvelopeLedger(ledger) {
  return {
    schema: ledger.schema,
    path: ledger.path,
    entries: ledger.totals.entries,
    verified_envelopes: ledger.totals.verified_envelopes,
    prefix_reuse_percent: ledger.totals.prefix_reuse_percent,
    estimated_reused_prefix_tokens: ledger.totals.estimated_reused_prefix_tokens,
    reusable_prefix_tokens: ledger.totals.reusable_prefix_tokens,
    full_prefix_reuse_count: ledger.totals.full_prefix_reuse_count,
    static_prefix_only_reuse_count: ledger.totals.static_prefix_only_reuse_count,
    prefix_changed_count: ledger.totals.prefix_changed_count
  };
}

function summarizeHandoffLedger(ledger) {
  return {
    schema: ledger.schema,
    path: ledger.path,
    entries: ledger.totals.entries,
    verified_handoffs: ledger.totals.verified_handoffs,
    quality_gated_handoff_saving_handoffs: ledger.totals.quality_gated_handoff_saving_handoffs,
    start_context_savings_percent: ledger.totals.start_context_savings_percent,
    start_context_saved_tokens: ledger.totals.start_context_saved_tokens,
    inventory_tokens: ledger.totals.inventory_tokens,
    start_prompt_tokens: ledger.totals.start_prompt_tokens,
    verified_start_context_savings_percent: ledger.totals.verified_start_context_savings_percent,
    verified_start_context_saved_tokens: ledger.totals.verified_start_context_saved_tokens,
    verified_inventory_tokens: ledger.totals.verified_inventory_tokens,
    verified_start_prompt_tokens: ledger.totals.verified_start_prompt_tokens,
    quality_gated_start_context_savings_percent: ledger.totals.quality_gated_start_context_savings_percent,
    quality_gated_start_context_saved_tokens: ledger.totals.quality_gated_start_context_saved_tokens,
    quality_gated_inventory_tokens: ledger.totals.quality_gated_inventory_tokens,
    quality_gated_start_prompt_tokens: ledger.totals.quality_gated_start_prompt_tokens,
    p95_start_prompt_tokens: ledger.totals.p95_start_prompt_tokens,
    blocked_handoffs: ledger.totals.blocked_handoffs
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
    verified_input_tokens: ledger.totals.verified_input_tokens,
    verified_sendable_prompt_tokens: ledger.totals.verified_sendable_prompt_tokens,
    verified_sendable_prompt_saved_tokens: ledger.totals.verified_sendable_prompt_saved_tokens,
    verified_sendable_prompt_savings_percent: ledger.totals.verified_sendable_prompt_savings_percent,
    p95_sendable_prompt_tokens: ledger.totals.p95_sendable_prompt_tokens,
    p95_sendable_saved_tokens: ledger.totals.p95_sendable_saved_tokens,
    fallback_count: ledger.totals.fallback_count,
    full_context_fallbacks: ledger.totals.full_context_fallbacks,
    blocked_preparations: ledger.totals.blocked_preparations
  };
}

function buildNextActions({ verified, warnings }) {
  if (!verified) {
    return [
      "Fixiere zuerst die Blocker, bevor diese Version als publishable gilt.",
      "Nutze die Dogfood- und Benchmark-Details, um verlorene Anker, Regressionen oder TaskOutcome-Fehler einzugrenzen."
    ];
  }

  const actions = [
    "Nutze dies als lokales Release-Qualitätssignal und führe vor einer Veröffentlichung zusätzlich sparkompass package-audit, package-smoke, plugin-smoke und release-audit aus.",
    "Nutze sparkompass handoff für den nächsten echten Codex-Startkontext und lade exakte Belege nur bei Bedarf nach."
  ];
  if (warnings.includes("no-savings-ledger-entries")) {
    actions.push("Zeichne echte ContextPack-Läufe mit sparkompass pack --ledger auf, um eine Sparhistorie aufzubauen.");
  }
  if (warnings.includes("no-task-outcome-ledger-entries")) {
    actions.push("Zeichne echte Check-Ergebnisse mit sparkompass task run --ledger auf, um Tokens pro verifiziertem Task zu messen.");
  }
  if (warnings.includes("no-envelope-ledger-entries")) {
    actions.push("Zeichne wiederholte Envelope-Läufe mit sparkompass envelope --ledger auf, um Prefix-Stabilität zu messen.");
  }
  if (warnings.includes("no-handoff-ledger-entries")) {
    actions.push("Zeichne echte Codex-Startkontexte mit sparkompass handoff --ledger auf, um Handoff-Ersparnis über Zeit zu messen.");
  }
  if (warnings.includes("no-prompt-preparation-ledger-entries")) {
    actions.push("Bereite große geplante Prompts mit sparkompass prompt-prepare --ledger vor, um sendbare Prompt-Ersparnis über Zeit zu messen.");
  }
  return actions;
}

function formatSavingsLedgerLine(ledger) {
  if (!ledger.entries) return "keine Einträge";
  return `${formatNumber(ledger.entries)} Einträge, ${formatNumber(ledger.verified_entries)} verifiziert (${formatNumber(ledger.quality_gated_saving_entries)} sparend), ${formatSavingsBar({
    originalTokens: ledger.original_tokens,
    compactTokens: ledger.delivered_tokens,
    savedTokens: ledger.delivered_saved_tokens,
    percent: ledger.delivered_savings_percent
  })}, qualitätsgegated ${formatSavingsBar({
    originalTokens: ledger.quality_gated_original_tokens,
    compactTokens: ledger.quality_gated_delivered_tokens,
    savedTokens: ledger.quality_gated_delivered_saved_tokens,
    percent: ledger.quality_gated_delivered_savings_percent
  })}, verifiziert ${formatSavingsBar({
    originalTokens: ledger.verified_original_tokens,
    compactTokens: ledger.verified_delivered_tokens,
    savedTokens: ledger.verified_delivered_saved_tokens,
    percent: ledger.verified_delivered_savings_percent
  })}, Fallbacks ${ledger.full_context_fallbacks}`;
}

function formatTaskOutcomeLedgerLine(ledger) {
  if (!ledger.entries) return "keine Einträge";
  return `${formatNumber(ledger.entries)} Einträge, ${formatNumber(ledger.verified_tasks)} verifiziert (${formatNumber(ledger.verification_rate_percent)}%), ${formatNumber(ledger.output_tokens_per_verified_task)} Output-Tokens/verifiziertem Task`;
}

function formatEnvelopeLedgerLine(ledger) {
  if (!ledger.entries) return "keine Einträge";
  return `${formatNumber(ledger.entries)} Einträge, ${ledger.prefix_reuse_percent}% Prefix-Reuse (${formatNumber(ledger.estimated_reused_prefix_tokens)} von ${formatNumber(ledger.reusable_prefix_tokens)} Tokens)`;
}

function formatHandoffLedgerLine(ledger) {
  if (!ledger.entries) return "keine Einträge";
  return `${formatNumber(ledger.entries)} Einträge, ${formatSavingsBar({
    originalTokens: ledger.inventory_tokens,
    compactTokens: ledger.start_prompt_tokens,
    savedTokens: ledger.start_context_saved_tokens,
    percent: ledger.start_context_savings_percent
  })}, sparend ${formatNumber(ledger.quality_gated_handoff_saving_handoffs)}/${formatNumber(ledger.verified_handoffs)}, qualitätsgegated ${formatSavingsBar({
    originalTokens: ledger.quality_gated_inventory_tokens,
    compactTokens: ledger.quality_gated_start_prompt_tokens,
    savedTokens: ledger.quality_gated_start_context_saved_tokens,
    percent: ledger.quality_gated_start_context_savings_percent
  })}, blockiert ${formatNumber(ledger.blocked_handoffs)}`;
}

function formatPromptPreparationLedgerLine(ledger) {
  if (!ledger.entries) return "keine Einträge";
  return `${formatNumber(ledger.entries)} Einträge, ${formatNumber(ledger.verified_preparations)} verifiziert (${formatNumber(ledger.quality_gated_prompt_saving_preparations)} sparend), ${formatSavingsBar({
    originalTokens: ledger.input_tokens,
    compactTokens: ledger.sendable_prompt_tokens,
    savedTokens: ledger.sendable_prompt_saved_tokens,
    percent: ledger.sendable_prompt_savings_percent
  })}, qualitätsgegated ${formatSavingsBar({
    originalTokens: ledger.verified_input_tokens,
    compactTokens: ledger.verified_sendable_prompt_tokens,
    savedTokens: ledger.verified_sendable_prompt_saved_tokens,
    percent: ledger.verified_sendable_prompt_savings_percent
  })}, Fallbacks ${formatNumber(ledger.fallback_count)}`;
}

function formatBlockers(scorecard) {
  if (!scorecard.release_readiness.blockers.length) return "- keine";
  return scorecard.checks
    .filter((check) => scorecard.release_readiness.blockers.includes(check.id))
    .map((check) => `- ${check.id}: ${check.evidence}`)
    .join("\n");
}

function formatWarnings(warnings) {
  if (!warnings.length) return "- keine";
  return warnings.map((warning) => `- ${warning}`).join("\n");
}
