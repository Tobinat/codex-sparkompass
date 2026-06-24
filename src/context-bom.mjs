import path from "node:path";
import { buildContextPlan } from "./context-plan.mjs";
import { withEvidenceLoadHints } from "./evidence-hints.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildContextBOM(rootPath, options = {}) {
  const plan = await buildContextPlan(rootPath, options);
  return buildContextBOMFromPlan(plan);
}

export function buildContextBOMFromPlan(plan) {
  const laneUnits = flattenPlanUnits(plan);
  const immediateTokens = sum(plan.lanes.immediate_context, "token_cost");
  const onDemandTokens = sum(plan.lanes.on_demand_evidence, "token_cost");
  const omittedTokens = sum(plan.lanes.omitted, "token_cost");
  const gate = buildBOMGate(plan);

  return {
    schema: "ContextBOMV1",
    root: plan.root,
    generated_at: new Date().toISOString(),
    task_profile: plan.task_profile,
    source_plan: {
      schema: plan.schema,
      generated_at: plan.generated_at,
      gate: plan.gate.status,
      optimizer: plan.optimizer.schema,
      risk_controls: plan.risk_controls?.status || "unknown",
      decision_trace: plan.decision_trace?.status || "unknown",
      delta: plan.delta.status,
      graph: plan.graph.status
    },
    gate,
    risk_controls: plan.risk_controls,
    budget: {
      requested_tokens: plan.budget.requested_tokens,
      immediate_tokens: immediateTokens,
      on_demand_tokens: onDemandTokens,
      omitted_preview_tokens: omittedTokens,
      inventory_tokens: plan.budget.inventory_tokens,
      immediate_budget_percent: percentage(immediateTokens, plan.budget.requested_tokens),
      on_demand_vs_immediate_percent: percentage(onDemandTokens, Math.max(1, immediateTokens + onDemandTokens))
    },
    lanes: {
      immediate_context: summarizeLane("immediate_context", plan.lanes.immediate_context, plan.budget.requested_tokens),
      on_demand_evidence: summarizeLane("on_demand_evidence", plan.lanes.on_demand_evidence, plan.budget.requested_tokens),
      omitted: summarizeLane("omitted_preview", plan.lanes.omitted, plan.budget.requested_tokens)
    },
    files: summarizeByFile(laneUnits),
    types: summarizeByType(laneUnits),
    decisions: summarizeDecisions(laneUnits),
    decision_trace: summarizeDecisionTrace(plan.decision_trace),
    must_survive: summarizeRequirements(plan.requirements),
    risk_register: buildRiskRegister(laneUnits),
    evidence_protocol: buildEvidenceProtocol(plan),
    next_actions: buildNextActions(plan, gate, onDemandTokens)
  };
}

export function formatContextBOMReport(bom) {
  return `
# ContextBOMV1

Ziel: ${bom.task_profile.goal}
Gate: ${bom.gate.status}

- Sofortkontext: ${formatNumber(bom.budget.immediate_tokens)}/${formatNumber(bom.budget.requested_tokens)} Tokens (${bom.budget.immediate_budget_percent}% des Budgets)
- On-Demand-Kontext: ${formatNumber(bom.budget.on_demand_tokens)} Tokens
- Omitted-Vorschau: ${formatNumber(bom.budget.omitted_preview_tokens)} Tokens
- Muss-Fakten: ${formatMustSurvive(bom.must_survive)}
- Risiko-Policy: ${formatRiskControls(bom.risk_controls)}
- Decision Trace: ${formatDecisionTrace(bom.decision_trace)}
- Dateien in BOM: ${formatNumber(bom.files.length)}
- Risikoregister: ${formatNumber(bom.risk_register.count)} Einheit(en)

## Lane-Mix

${formatLane(bom.lanes.immediate_context)}
${formatLane(bom.lanes.on_demand_evidence)}
${formatLane(bom.lanes.omitted)}

## Top-Dateien

${formatFileRows(bom.files)}

## Entscheidungsklassen

${formatDecisionRows(bom.decisions)}

## Risikoregister

${formatRiskRows(bom.risk_register)}

## Nächste Schritte

${bom.next_actions.map((action) => `- ${action}`).join("\n")}
${formatGateReasons(bom.gate.reasons)}
`.trim();
}

function flattenPlanUnits(plan) {
  return [
    ...annotateLane(plan.lanes.immediate_context, "immediate_context"),
    ...annotateLane(plan.lanes.on_demand_evidence, "on_demand_evidence"),
    ...annotateLane(plan.lanes.omitted, "omitted")
  ];
}

function annotateLane(units, lane) {
  return (units || []).map((unit) => ({
    ...unit,
    lane
  }));
}

function summarizeLane(lane, units, budget) {
  const tokens = sum(units, "token_cost");
  return {
    lane,
    units: units.length,
    tokens,
    budget_percent: percentage(tokens, budget),
    top_units: units
      .slice()
      .sort((left, right) => right.utility_score - left.utility_score || right.token_cost - left.token_cost)
      .slice(0, 12)
      .map(toBOMUnit)
  };
}

function summarizeByFile(units) {
  const groups = groupBy(units, (unit) => unit.file || "(unknown)");
  return [...groups.entries()]
    .map(([file, items]) => ({
      file,
      units: items.length,
      tokens: sum(items, "token_cost"),
      lanes: countBy(items, (item) => item.lane),
      types: countBy(items, (item) => item.type),
      delta_statuses: countBy(items, (item) => item.delta_status || "unknown"),
      max_utility_score: maximum(items.map((item) => item.utility_score)),
      evidence_ids: items.map((item) => item.evidence_id).filter(Boolean).slice(0, 12)
    }))
    .sort((left, right) => right.tokens - left.tokens || right.max_utility_score - left.max_utility_score)
    .slice(0, 24);
}

function summarizeByType(units) {
  const groups = groupBy(units, (unit) => unit.type || "unknown");
  return [...groups.entries()]
    .map(([type, items]) => ({
      type,
      units: items.length,
      tokens: sum(items, "token_cost"),
      lanes: countBy(items, (item) => item.lane),
      risk_units: items.filter(isRiskUnit).length
    }))
    .sort((left, right) => right.tokens - left.tokens || right.units - left.units);
}

function summarizeDecisions(units) {
  const groups = groupBy(units, (unit) => decisionKey(unit));
  return [...groups.entries()]
    .map(([decision, items]) => ({
      decision,
      units: items.length,
      tokens: sum(items, "token_cost"),
      lanes: countBy(items, (item) => item.lane),
      examples: items.slice(0, 8).map((item) => ({
        evidence_id: item.evidence_id,
        file: item.file,
        line: item.line,
        name: item.name,
        reason: item.selection_reason
      }))
    }))
    .sort((left, right) => right.tokens - left.tokens || right.units - left.units);
}

function summarizeRequirements(requirements) {
  if (!requirements?.enabled) {
    return {
      enabled: false,
      status: "not-set",
      total: 0,
      covered: 0,
      immediate: 0,
      on_demand: 0,
      missing: [],
      items: []
    };
  }

  return {
    enabled: true,
    status: requirements.status,
    total: requirements.total,
    covered: requirements.covered,
    immediate: requirements.immediate,
    on_demand: requirements.on_demand,
    missing: requirements.missing,
    items: requirements.items.map((item) => ({
      expectation_id: item.expectation_id,
      type: item.type,
      label: item.label,
      status: item.status,
      found: item.found,
      match_count: item.match_count,
      evidence: item.evidence.slice(0, 8).map((evidence) => ({
        evidence_id: evidence.evidence_id,
        file: evidence.file,
        line: evidence.line,
        lane: evidence.lane,
        source_hash: evidence.source_hash,
        load_hint: evidence.load_hint
      }))
    }))
  };
}

function summarizeDecisionTrace(trace) {
  if (!trace) {
    return {
      schema: "ContextDecisionTraceV1",
      status: "missing",
      verified: false,
      blocking_uncertainties: 1,
      review_uncertainties: 0,
      info_uncertainties: 0,
      budget_rejections: 0,
      unlisted_deferred_units: 0,
      unlisted_omitted_units: 0,
      top_budget_rejections: []
    };
  }

  const uncertainties = trace.uncertainty_register || [];
  return {
    schema: trace.schema,
    trace_id: trace.trace_id,
    status: trace.status,
    verified: trace.verified,
    strategy: trace.strategy,
    blocking_uncertainties: uncertainties.filter((item) => item.severity === "blocking").length,
    review_uncertainties: uncertainties.filter((item) => item.severity === "review").length,
    info_uncertainties: uncertainties.filter((item) => item.severity === "info").length,
    budget_rejections: trace.budget_decisions?.skipped_for_budget || 0,
    unlisted_deferred_units: trace.coverage?.unlisted_deferred_units || 0,
    unlisted_omitted_units: trace.coverage?.unlisted_omitted_units || 0,
    top_budget_rejections: (trace.budget_decisions?.top_budget_rejections || []).slice(0, 8)
  };
}

function buildRiskRegister(units) {
  const entries = units
    .filter(isRiskUnit)
    .sort((left, right) => laneRiskRank(left.lane) - laneRiskRank(right.lane)
      || right.utility_score - left.utility_score)
    .slice(0, 24)
    .map((unit) => withEvidenceLoadHints({
      evidence_id: unit.evidence_id,
      lane: unit.lane,
      file: unit.file,
      line: unit.line,
      type: unit.type,
      name: unit.name,
      risk_value: unit.score_breakdown?.risk_value || 0,
      token_cost: unit.token_cost,
      reason: unit.selection_reason,
      source_hash: unit.source_hash,
      load_hint: unit.lane === "immediate_context"
        ? "already in immediate context"
        : undefined
    }));

  return {
    count: units.filter(isRiskUnit).length,
    entries
  };
}

function buildEvidenceProtocol(plan) {
  return {
    immediate_evidence: (plan.evidence || []).slice(0, 80),
    requirement_evidence: summarizeRequirements(plan.requirements).items.flatMap((item) => item.evidence).slice(0, 80),
    on_demand_evidence: (plan.lanes.on_demand_evidence || []).slice(0, 80).map((unit) => withEvidenceLoadHints({
      evidence_id: unit.evidence_id,
      unit_id: unit.id,
      file: unit.file,
      line: unit.line,
      source_hash: unit.source_hash
    }))
  };
}

function buildBOMGate(plan) {
  const reasons = [...(plan.gate?.reasons || [])];
  if (plan.requirements?.enabled && plan.requirements.missing.length) {
    reasons.push("bom-must-survive-missing");
  }
  if (!plan.lanes?.immediate_context?.length) {
    reasons.push("bom-no-immediate-material");
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    status: uniqueReasons.length ? "bom-needs-review" : "verified-bom",
    verified: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    source_plan_gate: plan.gate.status
  };
}

function buildNextActions(plan, gate, onDemandTokens) {
  const actions = [];
  if (gate.verified) {
    actions.push("Nutze immediate_context als Startkontext und halte on_demand-Belege draußen, bis exakte Quellzeilen gebraucht werden.");
  } else {
    actions.push("Prüfe die BOM-Gate-Gründe, bevor dieser Kontextmix als Handoff-Vertrag genutzt wird.");
  }
  if (onDemandTokens > 0) {
    actions.push("Lade On-Demand-Belege per evidence_id statt ganze Dateien zu vergrößern.");
  }
  if (plan.requirements?.enabled && plan.requirements.status !== "covered-immediately") {
    actions.push("Kläre Muss-Fakten über die gelisteten Requirement-Belege, bevor komprimiert oder gepackt wird.");
  }
  actions.push("Nutze danach sparkompass control oder envelope, wenn die Handoff-Reihenfolge wichtig ist.");
  return actions;
}

function toBOMUnit(unit) {
  return withEvidenceLoadHints({
    evidence_id: unit.evidence_id,
    unit_id: unit.id,
    type: unit.type,
    name: unit.name,
    file: unit.file,
    line: unit.line,
    token_cost: unit.token_cost,
    utility_score: unit.utility_score,
    selection_priority: unit.selection_priority,
    selection_lane_reason: unit.selection_lane_reason,
    selection_reason: unit.selection_reason,
    delta_status: unit.delta_status,
    graph_related: unit.graph_related,
    source_hash: unit.source_hash
  });
}

function decisionKey(unit) {
  if (unit.lane === "immediate_context") {
    return `immediate:${unit.selection_lane_reason || unit.selection_priority || "selected"}`;
  }
  if (unit.lane === "on_demand_evidence") {
    return `on-demand:${unit.selection_lane_reason || "budget-limit"}`;
  }
  return `omitted:${unit.selection_priority || "not-relevant"}`;
}

function isRiskUnit(unit) {
  return Number(unit.score_breakdown?.risk_value) > 0
    || /\b(force|delete|drop|secret|token|auth|password|credential|security|unsafe|migration|reset)\b/i.test(`${unit.name} ${unit.file} ${unit.selection_reason}`);
}

function laneRiskRank(lane) {
  if (lane === "immediate_context") return 0;
  if (lane === "on_demand_evidence") return 1;
  return 2;
}

function formatLane(lane) {
  return `- ${lane.lane}: ${formatNumber(lane.units)} Einheiten, ${formatNumber(lane.tokens)} Tokens (${lane.budget_percent}% Budget)`;
}

function formatFileRows(files) {
  if (!files.length) return "- keine";
  return files.slice(0, 10).map((file) => (
    `- ${file.file}: ${formatNumber(file.tokens)} Tokens, ${formatNumber(file.units)} Einheiten, Lanes ${formatObjectCounts(file.lanes)}`
  )).join("\n");
}

function formatDecisionRows(decisions) {
  if (!decisions.length) return "- keine";
  return decisions.slice(0, 10).map((decision) => (
    `- ${decision.decision}: ${formatNumber(decision.units)} Einheiten, ${formatNumber(decision.tokens)} Tokens`
  )).join("\n");
}

function formatRiskRows(register) {
  if (!register.entries.length) return "- keine";
  return register.entries.slice(0, 10).map((entry) => (
    `- ${entry.evidence_id} ${entry.lane} ${entry.file}:${entry.line} ${entry.name} (${formatNumber(entry.token_cost)} Tokens)`
  )).join("\n");
}

function formatMustSurvive(mustSurvive) {
  if (!mustSurvive.enabled) return "nicht gesetzt";
  return `${mustSurvive.covered}/${mustSurvive.total} gefunden, ${mustSurvive.status}`;
}

function formatRiskControls(riskControls) {
  if (!riskControls) return "nicht gesetzt";
  return `${riskControls.risk_profile}, ${riskControls.status}, ${formatNumber(riskControls.deferred_risk_units)} deferred`;
}

function formatDecisionTrace(trace) {
  if (!trace) return "nicht gesetzt";
  return `${trace.status}, ${formatNumber(trace.budget_rejections)} Budget-Ablehnungen, ${formatNumber(trace.blocking_uncertainties)} Blocker`;
}

function formatGateReasons(reasons) {
  if (!reasons.length) return "";
  return `\n## Gate-Gründe\n\n${reasons.map((reason) => `- ${reason}`).join("\n")}`;
}

function formatObjectCounts(value) {
  return Object.entries(value || {})
    .map(([key, count]) => `${key}:${count}`)
    .join(", ") || "keine";
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return groups;
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function sum(items, field) {
  return (items || []).reduce((total, item) => total + (Number(item[field]) || 0), 0);
}

function maximum(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : 0;
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
