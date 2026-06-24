import { buildContextEnvelopeFromPlan } from "./context-envelope.mjs";
import { buildContextPlan } from "./context-plan.mjs";
import { withEvidenceLoadHints } from "./evidence-hints.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildContextControlReport(rootPath, options = {}) {
  const plan = await buildContextPlan(rootPath, options);
  const envelope = buildContextEnvelopeFromPlan(plan, options);
  return buildContextControlReportFromArtifacts(plan, envelope);
}

export function buildContextControlReportFromArtifacts(plan, envelope) {
  const warnings = buildWarnings(plan, envelope);
  const readiness = buildReadiness(plan, envelope, warnings);

  return {
    schema: "ContextControlReportV1",
    root: plan.root,
    generated_at: new Date().toISOString(),
    task_profile: plan.task_profile,
    readiness,
    gates: {
      plan: {
        status: plan.gate.status,
        verified: plan.gate.verified,
        reasons: plan.gate.reasons
      },
      requirements: {
        enabled: plan.requirements.enabled,
        status: plan.requirements.status,
        covered: plan.requirements.covered,
        total: plan.requirements.total,
        missing: plan.requirements.missing
      },
      delta_coverage: {
        enabled: plan.delta_coverage?.enabled || false,
        status: plan.delta_coverage?.status || "not-used",
        verified: plan.delta_coverage?.verified ?? true,
        tracked_units: plan.delta_coverage?.tracked_units || 0,
        covered_units: plan.delta_coverage?.covered_units || 0,
        coverage_percent: plan.delta_coverage?.coverage_percent ?? 100,
        missing_units: plan.delta_coverage?.missing_units || []
      },
      risk_controls: {
        status: plan.risk_controls?.status || "unknown",
        risk_profile: plan.risk_controls?.risk_profile || plan.task_profile?.risk_profile || "balanced",
        relevant_risk_units: plan.risk_controls?.relevant_risk_units || 0,
        deferred_risk_units: plan.risk_controls?.deferred_risk_units || 0,
        reasons: plan.risk_controls?.reasons || []
      },
      envelope: {
        status: envelope.gate.status,
        verified: envelope.gate.verified,
        warnings: envelope.gate.advisory_warnings
      },
      prompt_cache: {
        status: envelope.cache_metrics.prefix_status,
        prefix_reuse_status: envelope.prefix_reuse.status,
        caveat: envelope.prompt_cache_strategy.caveat
      }
    },
    budget: {
      requested_tokens: plan.budget.requested_tokens,
      immediate_tokens: plan.budget.immediate_tokens,
      remaining_tokens: plan.budget.remaining_tokens,
      deferred_relevant_tokens: plan.budget.deferred_relevant_tokens,
      inventory_tokens: plan.budget.inventory_tokens,
      prompt_tokens: envelope.cache_metrics.prompt_estimated_tokens,
      reusable_prefix_tokens: envelope.cache_metrics.reusable_prefix_tokens,
      variable_tail_tokens: envelope.cache_metrics.variable_tail_tokens,
      on_demand_index_tokens: envelope.cache_metrics.on_demand_index_tokens,
      reusable_prefix_percent: envelope.cache_metrics.reusable_prefix_percent,
      variable_tail_percent: envelope.cache_metrics.variable_tail_percent
    },
    lanes: {
      immediate_context: summarizeLane(plan.lanes.immediate_context),
      on_demand_evidence: summarizeLane(plan.lanes.on_demand_evidence),
      omitted: summarizeLane(plan.lanes.omitted)
    },
    handoff: {
      send_order: envelope.assembly.send_order,
      on_demand_order: envelope.assembly.on_demand_order,
      stable_prefix_hash: envelope.assembly.stable_prefix_hash,
      variable_tail_hash: envelope.assembly.variable_tail_hash,
      on_demand_index_hash: envelope.assembly.on_demand_index_hash,
      full_prompt_hash: envelope.assembly.full_prompt_hash
    },
    evidence_protocol: {
      immediate: plan.evidence,
      requirements: collectRequirementEvidence(plan),
      on_demand: plan.lanes.on_demand_evidence.map((unit) => withEvidenceLoadHints({
        evidence_id: unit.evidence_id,
        unit_id: unit.id,
        file: unit.file,
        line: unit.line,
        source_hash: unit.source_hash
      })).slice(0, 80)
    },
    artifacts: {
      plan,
      envelope
    },
    next_actions: buildNextActions(plan, envelope, readiness, warnings)
  };
}

export function formatContextControlReport(report) {
  return `
# ContextControlReportV1

Ziel: ${report.task_profile.goal}
Gate: ${report.readiness.status}

- Sofortkontext: ${formatNumber(report.budget.immediate_tokens)}/${formatNumber(report.budget.requested_tokens)} Tokens
- Nachlade-Kontext: ${formatNumber(report.budget.deferred_relevant_tokens)} relevante Tokens
- Prompt-Envelope: ${formatNumber(report.budget.prompt_tokens)} Tokens, davon ${formatNumber(report.budget.reusable_prefix_tokens)} Prefix-Tokens
- On-Demand-Index: ${formatNumber(report.budget.on_demand_index_tokens)} Tokens
- Muss-Fakten: ${formatRequirementSummary(report.gates.requirements)}
- Delta-Coverage: ${formatDeltaCoverageSummary(report.gates.delta_coverage)}
- Risiko-Policy: ${formatRiskControlSummary(report.gates.risk_controls)}
- Prompt-Cache-Status: ${report.gates.prompt_cache.status}
- Prefix-Wiederverwendung: ${report.gates.prompt_cache.prefix_reuse_status}
- Plan-Gate: ${report.gates.plan.status}
- Envelope-Gate: ${report.gates.envelope.status}

## Sofort Laden

${formatLaneRows(report.lanes.immediate_context)}

## Bei Bedarf Nachladen

${formatLaneRows(report.lanes.on_demand_evidence)}

## Handoff

Sende-Reihenfolge:
${report.handoff.send_order.map((id) => `- ${id}`).join("\n")}

On-Demand-Reihenfolge:
${report.handoff.on_demand_order.map((id) => `- ${id}`).join("\n")}

Hashes:
- Prefix: ${report.handoff.stable_prefix_hash}
- Variable Tail: ${report.handoff.variable_tail_hash}
- On-Demand: ${report.handoff.on_demand_index_hash}
- Voller Prompt: ${report.handoff.full_prompt_hash}

## Nächste Schritte

${report.next_actions.map((action) => `- ${action}`).join("\n")}
${formatWarnings(report.readiness.warnings)}
`.trim();
}

function buildReadiness(plan, envelope, warnings) {
  const blockingWarnings = buildBlockingWarnings(plan);
  const verified = plan.gate.verified && envelope.gate.verified && blockingWarnings.length === 0;
  return {
    status: verified ? "ready-for-handoff" : "needs-review",
    verified,
    blocking_warnings: blockingWarnings,
    warnings
  };
}

function buildWarnings(plan, envelope) {
  const warnings = [
    ...plan.gate.reasons,
    ...envelope.gate.advisory_warnings
  ];

  if (plan.requirements.enabled && plan.requirements.status === "requires-evidence-load") {
    warnings.push("must-survive-facts-require-on-demand-evidence");
  }
  if (plan.requirements.enabled && plan.requirements.missing.length) {
    warnings.push("must-survive-facts-missing");
  }
  if (!plan.lanes.immediate_context.length) {
    warnings.push("no-immediate-context-selected");
  }

  return [...new Set(warnings)];
}

function buildBlockingWarnings(plan) {
  const warnings = [...plan.gate.reasons];
  if (plan.requirements.enabled && plan.requirements.missing.length) {
    warnings.push("must-survive-facts-missing");
  }
  if (!plan.lanes.immediate_context.length) {
    warnings.push("no-immediate-context-selected");
  }
  return [...new Set(warnings)];
}

function summarizeLane(units) {
  return {
    count: units.length,
    estimated_tokens: units.reduce((sum, unit) => sum + (Number(unit.token_cost) || 0), 0),
    units: units.slice(0, 24).map((unit) => withEvidenceLoadHints({
      evidence_id: unit.evidence_id,
      unit_id: unit.id,
      type: unit.type,
      name: unit.name,
      file: unit.file,
      line: unit.line,
      token_cost: unit.token_cost,
      delta_status: unit.delta_status,
      graph_related: unit.graph_related,
      selection_reason: unit.selection_reason,
      source_hash: unit.source_hash
    }))
  };
}

function collectRequirementEvidence(plan) {
  if (!plan.requirements.enabled) return [];
  return plan.requirements.items.flatMap((item) => item.evidence.map((evidence) => withEvidenceLoadHints({
    requirement: item.label,
    status: item.status,
    evidence_id: evidence.evidence_id,
    file: evidence.file,
    line: evidence.line,
    lane: evidence.lane,
    source_hash: evidence.source_hash,
    load_hint: evidence.load_hint,
    source_hash_load_hint: evidence.source_hash_load_hint
  })));
}

function buildNextActions(plan, envelope, readiness, warnings) {
  const actions = [];
  if (readiness.verified) {
    actions.push("Use the envelope send_order as the start context for Codex.");
  } else {
    actions.push("Resolve readiness warnings before treating this as final handoff context.");
  }
  if (plan.lanes.on_demand_evidence.length) {
    actions.push("Load on-demand evidence through MCP by unit id or source hash only when exact source lines matter.");
  }
  if (plan.requirements.enabled && plan.requirements.status !== "covered-immediately") {
    actions.push("Load requirement evidence before relying on any must-survive fact.");
  }
  if (envelope.cache_metrics.prefix_status === "prefix-below-estimated-threshold") {
    actions.push("Expect context-ordering benefits, but not a meaningful prompt-cache prefix estimate yet.");
  }
  if (warnings.includes("delta-cache-not-supplied")) {
    actions.push("Run sparkompass cache before repeated work so stable, changed, and added units can be separated.");
  }
  actions.push("Record repeated envelopes with sparkompass envelope --ledger when measuring prefix stability over time.");
  actions.push("Use sparkompass shadow or pack with --expect before claiming task-level quality for compressed free-text context.");
  return [...new Set(actions)];
}

function formatLaneRows(lane) {
  if (!lane.units.length) return "- keine";
  return lane.units.map((unit) => (
    `- ${unit.evidence_id} ${unit.type} ${unit.file}:${unit.line} ${unit.name} (${formatNumber(unit.token_cost)} Tokens, ${unit.delta_status})`
  )).join("\n");
}

function formatRequirementSummary(requirements) {
  if (!requirements.enabled) return "nicht gesetzt";
  return `${requirements.covered}/${requirements.total}, ${requirements.status}`;
}

function formatDeltaCoverageSummary(deltaCoverage) {
  if (!deltaCoverage?.enabled) return "nicht genutzt";
  if (deltaCoverage.status === "cache-missing") return "Cache fehlt";
  return `${formatNumber(deltaCoverage.covered_units)}/${formatNumber(deltaCoverage.tracked_units)}, ${deltaCoverage.status}`;
}

function formatRiskControlSummary(riskControls) {
  if (!riskControls) return "nicht gesetzt";
  return `${riskControls.risk_profile}, ${riskControls.status}, ${formatNumber(riskControls.deferred_risk_units)} deferred`;
}

function formatWarnings(warnings = []) {
  if (!warnings.length) return "\n- Hinweise: keine";
  return `\n- Hinweise:\n${warnings.map((warning) => `  - ${warning}`).join("\n")}`;
}
