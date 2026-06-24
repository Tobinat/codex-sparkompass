import { createHash } from "node:crypto";
import { buildContextAblationAuditFromPlan } from "./context-ablation.mjs";
import { buildContextPlan } from "./context-plan.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildContextSlimmingPlan(rootPath, options = {}) {
  const plan = await buildContextPlan(rootPath, options);
  const ablationAudit = await buildContextAblationAuditFromPlan(plan, options);
  return buildContextSlimmingPlanFromArtifacts(plan, ablationAudit, options);
}

export function buildContextSlimmingPlanFromArtifacts(plan, ablationAudit, options = {}) {
  const maxMoves = clampInteger(options.maxMoves, 24, 1, 500);
  const immediateByEvidence = new Map((plan.lanes?.immediate_context || []).map((unit) => [unit.evidence_id, unit]));
  const checkedEvidenceIds = new Set((ablationAudit.ablations || []).map((item) => item.evidence_id));
  const critical = (ablationAudit.ablations || [])
    .filter((item) => item.status === "oracle-critical")
    .map((item) => annotateWithPlanUnit(item, immediateByEvidence, "keep-immediate"));
  const safeCandidates = (ablationAudit.ablations || [])
    .filter((item) => item.status === "ablation-safe-candidate")
    .map((item) => annotateWithPlanUnit(item, immediateByEvidence, "move-to-on-demand"))
    .sort(compareMoveCandidates);
  const moveToOnDemand = safeCandidates.slice(0, maxMoves);
  const movedIds = new Set(moveToOnDemand.map((item) => item.evidence_id));
  const retainedSafeCandidates = safeCandidates
    .filter((item) => !movedIds.has(item.evidence_id))
    .map((item) => ({ ...item, recommendation: "keep-immediate-budget-cap" }));
  const uncheckedImmediate = (plan.lanes?.immediate_context || [])
    .filter((unit) => !checkedEvidenceIds.has(unit.evidence_id))
    .map((unit) => summarizeUnit(unit, "keep-immediate-unchecked"));
  const keptImmediate = [
    ...critical,
    ...retainedSafeCandidates,
    ...uncheckedImmediate
  ].sort(compareByEvidenceId);
  const movedTokens = sum(moveToOnDemand, "token_cost");
  const originalImmediateTokens = Number(plan.budget?.immediate_tokens) || 0;
  const proposedImmediateTokens = Math.max(0, originalImmediateTokens - movedTokens);
  const originalOnDemandTokens = Number(plan.budget?.deferred_relevant_tokens) || 0;
  const proposedOnDemandTokens = originalOnDemandTokens + movedTokens;
  const coverageComplete = Number(ablationAudit.totals?.coverage_percent) === 100;
  const gate = buildGate({
    plan,
    ablationAudit,
    moveToOnDemand,
    critical,
    coverageComplete
  });

  return {
    schema: "ContextSlimmingPlanV1",
    slimming_id: `slim-${sha256([
      plan.root,
      plan.gate?.status || "",
      ablationAudit.audit_id,
      moveToOnDemand.map((item) => item.evidence_id).join(",")
    ].join("|")).slice(0, 12)}`,
    root: plan.root,
    generated_at: new Date().toISOString(),
    source_plan: {
      schema: plan.schema,
      gate: plan.gate?.status || "unknown",
      generated_at: plan.generated_at,
      immediate_units: plan.totals?.immediate_units || 0,
      on_demand_units: plan.totals?.deferred_units || 0,
      requested_tokens: plan.budget?.requested_tokens || 0,
      immediate_tokens: originalImmediateTokens,
      on_demand_tokens: originalOnDemandTokens,
      decision_trace: plan.decision_trace?.status || "unknown"
    },
    ablation_audit: {
      schema: ablationAudit.schema,
      audit_id: ablationAudit.audit_id,
      gate: ablationAudit.gate?.status || "unknown",
      verified: Boolean(ablationAudit.gate?.verified),
      coverage_percent: ablationAudit.totals?.coverage_percent || 0,
      oracle_critical_units: ablationAudit.totals?.oracle_critical_units || 0,
      ablation_safe_candidates: ablationAudit.totals?.ablation_safe_candidates || 0,
      counterfactuals_detected: ablationAudit.oracle?.counterfactuals_detected || 0,
      counterfactuals: ablationAudit.oracle?.counterfactuals || 0
    },
    policy: {
      schema: "ContextSlimmingPolicyV1",
      mode: "oracle-preserving-immediate-to-on-demand",
      max_moves: maxMoves,
      only_ablation_safe_units: true,
      keep_unchecked_immediate: true,
      keep_oracle_critical_immediate: true
    },
    gate,
    budget: {
      requested_tokens: plan.budget?.requested_tokens || 0,
      original_immediate_tokens: originalImmediateTokens,
      proposed_immediate_tokens: proposedImmediateTokens,
      additional_saved_tokens: movedTokens,
      additional_immediate_savings_percent: percent(movedTokens, originalImmediateTokens),
      original_on_demand_tokens: originalOnDemandTokens,
      proposed_on_demand_tokens: proposedOnDemandTokens,
      proposed_remaining_tokens: Math.max(0, (Number(plan.budget?.requested_tokens) || 0) - proposedImmediateTokens),
      inventory_tokens: plan.budget?.inventory_tokens || 0
    },
    proposal: {
      keep_immediate: keptImmediate,
      move_to_on_demand: moveToOnDemand,
      existing_on_demand_units: plan.lanes?.on_demand_evidence?.length || 0,
      existing_on_demand_tokens: originalOnDemandTokens,
      unchecked_immediate: uncheckedImmediate
    },
    next_actions: buildNextActions(gate)
  };
}

export function formatContextSlimmingPlanReport(slimming) {
  return `
# ContextSlimmingPlanV1

Gate: ${slimming.gate.status}
Pfad: ${slimming.root}

- Ausgangsplan: ${slimming.source_plan.gate}, ${formatNumber(slimming.source_plan.immediate_units)} Sofort-Einheiten, ${formatNumber(slimming.source_plan.immediate_tokens)} Sofort-Tokens
- Ablation: ${slimming.ablation_audit.gate}, Coverage ${slimming.ablation_audit.coverage_percent}%, Kritisch ${formatNumber(slimming.ablation_audit.oracle_critical_units)}, Safe ${formatNumber(slimming.ablation_audit.ablation_safe_candidates)}
- Vorschlag: ${formatNumber(slimming.proposal.move_to_on_demand.length)} Einheiten nach On-Demand verschieben
- Zusatzersparnis im Sofortkontext: ${formatNumber(slimming.budget.additional_saved_tokens)} Tokens (${slimming.budget.additional_immediate_savings_percent}%)
- Neuer Sofortkontext: ${formatNumber(slimming.budget.proposed_immediate_tokens)}/${formatNumber(slimming.budget.requested_tokens)} Tokens
- Neuer On-Demand-Kontext: ${formatNumber(slimming.budget.proposed_on_demand_tokens)} Tokens

## Im Sofortkontext behalten

${formatRows(slimming.proposal.keep_immediate)}

## Nach On-Demand verschieben

${formatRows(slimming.proposal.move_to_on_demand)}

## Blocker

${slimming.gate.blockers.length ? slimming.gate.blockers.map((item) => `- ${item}`).join("\n") : "- keine"}

## Hinweise

${slimming.gate.warnings.length ? slimming.gate.warnings.map((item) => `- ${item}`).join("\n") : "- keine"}

## Nächste Schritte

${slimming.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

function buildGate({ plan, ablationAudit, moveToOnDemand, critical, coverageComplete }) {
  const blockers = [];
  const warnings = [];

  if (!plan.gate?.verified) blockers.push("source-plan-not-verified");
  if (!ablationAudit.gate?.verified) blockers.push("ablation-audit-not-verified");
  if (!coverageComplete) blockers.push("ablation-coverage-incomplete");
  if (!critical.length) blockers.push("no-oracle-critical-unit");
  if (!moveToOnDemand.length) blockers.push("no-ablation-safe-move");
  if ((ablationAudit.gate?.warnings || []).length) warnings.push(...ablationAudit.gate.warnings.map((item) => `ablation:${item}`));

  const verified = blockers.length === 0;

  return {
    status: verified ? "verified-slimming-plan" : "slimming-plan-needs-review",
    verified,
    blockers,
    warnings
  };
}

function annotateWithPlanUnit(item, immediateByEvidence, recommendation) {
  const unit = immediateByEvidence.get(item.evidence_id);
  return {
    ...summarizeUnit(unit || item, recommendation),
    missing_after_removal: item.missing_after_removal || [],
    oracle_still_passes: Boolean(item.oracle_still_passes),
    total_expectations: item.total_expectations || 0
  };
}

function summarizeUnit(unit, recommendation) {
  return {
    evidence_id: unit.evidence_id,
    unit_id: unit.id || unit.unit_id,
    file: unit.file,
    line: unit.line,
    type: unit.type,
    name: unit.name,
    token_cost: Number(unit.token_cost) || 0,
    source_hash: unit.source_hash || unit.expected_source_hash || "",
    recommendation,
    load_hint: unit.load_hint || `sparkompass_load_evidence unitId=${unit.id || unit.unit_id || ""}`.trim()
  };
}

function formatRows(rows) {
  if (!rows.length) return "- keine";
  return rows.slice(0, 18).map((item) => (
    `- ${item.evidence_id} ${item.file}:${item.line} ${item.name} (${formatNumber(item.token_cost)} Tokens, ${item.recommendation})`
  )).join("\n");
}

function buildNextActions(gate) {
  if (gate.verified) {
    return [
      "Verschiebe nur die gelisteten move_to_on_demand Einheiten und halte oracle-kritische Einheiten im Sofortkontext.",
      "Führe danach ablation-audit und evidence-audit erneut aus, bevor der schlankere Handoff genutzt wird."
    ];
  }
  return [
    "Behebe die Blocker, bevor der Sofortkontext weiter verkleinert wird.",
    "Nutze ein explizites Oracle und vollständige Ablation-Coverage, damit Slimming nicht nur auf Bauchgefühl basiert."
  ];
}

function compareMoveCandidates(left, right) {
  return right.token_cost - left.token_cost || String(left.evidence_id).localeCompare(String(right.evidence_id));
}

function compareByEvidenceId(left, right) {
  return String(left.evidence_id).localeCompare(String(right.evidence_id));
}

function sum(items, field) {
  return items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
}

function percent(part, total) {
  return total > 0 ? Math.round((Number(part) / Number(total)) * 100) : 0;
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
