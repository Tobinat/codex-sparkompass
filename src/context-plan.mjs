import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAcceptanceOracle } from "./acceptance-oracle.mjs";
import { buildContextGraph } from "./context-graph.mjs";
import { buildContextInventory } from "./inventory.mjs";
import { resolveContextPolicy } from "./context-policy.mjs";
import { withEvidenceLoadHints } from "./evidence-hints.mjs";
import { formatNumber } from "./token-estimator.mjs";

const GRAPH_NEIGHBOR_WEIGHT = 14;

const TYPE_WEIGHTS = {
  function: 16,
  class: 14,
  export: 12,
  "log-error": 12,
  config: 10,
  heading: 8,
  import: 6,
  "stack-frame": 6
};

export async function buildContextPlan(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const goal = String(options.goal || "").trim();
  if (!goal) {
    throw new Error("Bitte ein Ziel angeben: sparkompass plan . --goal \"...\"");
  }

  const policy = resolveContextPolicy({ riskProfile: options.riskProfile });
  const budget = resolvePlanBudget(options.budget, policy);
  const explicitFiles = normalizeList(options.file || options.files || []);
  const done = normalizeList(options.done || []);
  const expect = normalizeList(options.expect || []);
  const expectRegex = normalizeList(options.expectRegex || []);
  const terms = buildTaskTerms([goal, ...done, ...explicitFiles, ...expect]);
  const excludeFiles = buildPlanExcludeFiles(root, options.cache, options.excludeFiles || []);
  const inventory = await buildContextInventory(root, {
    maxFiles: clampInteger(options.maxFiles, 300, 1, 2000),
    excludeFiles
  });
  const deltaIndex = await buildDeltaIndex(root, options.cache);
  const baseScored = inventory.units
    .map((unit) => scoreUnit(unit, {
      terms,
      explicitFiles,
      done,
      deltaIndex
    }));
  const graphContext = await buildGraphContext(root, baseScored, {
    enabled: Boolean(options.includeGraph || options.graph),
    maxFiles: clampInteger(options.maxFiles, 300, 1, 2000)
  });
  const scored = baseScored
    .map((unit) => applyGraphSignal(unit, graphContext))
    .map(annotateSelectionMetrics)
    .sort(comparePlanOrder);
  const relevant = scored.filter((unit) => unit.is_relevant);
  const selection = selectContextUnderBudget(relevant, budget);
  const { immediate, deferred, usedTokens } = selection;
  const riskControls = buildRiskControls(policy, {
    budget,
    usedTokens,
    immediate,
    deferred
  });

  const relevantIds = new Set(relevant.map((unit) => unit.id));
  const omitted = scored
    .filter((unit) => !relevantIds.has(unit.id))
    .slice(0, 40)
    .map((unit, index) => summarizeUnit(unit, "omitted", index));
  const immediateSummaries = immediate.map((unit, index) => summarizeUnit(unit, "immediate", index));
  const deferredSummaries = deferred.slice(0, 80).map((unit, index) => summarizeUnit(unit, "deferred", index));
  const requirements = await buildRequirementCoverage(root, inventory, {
    expect,
    expectRegex,
    immediate: immediateSummaries,
    deferred: deferredSummaries
  });
  const deltaCoverage = buildDeltaCoverage(deltaIndex, scored, {
    immediate: immediateSummaries,
    deferred: deferredSummaries
  });
  const gate = buildPlanGate({
    explicitFiles,
    immediate,
    budget,
    usedTokens,
    requirements,
    deltaCoverage,
    riskControls
  });
  const decisionTrace = buildDecisionTrace({
    inventory,
    scored,
    relevant,
    immediate: immediateSummaries,
    deferred,
    deferredSummaries,
    omitted,
    budget,
    usedTokens,
    optimizer: selection.optimizer,
    gate,
    riskControls,
    requirements,
    deltaCoverage
  });

  return {
    schema: "ContextPlanV1",
    root,
    generated_at: new Date().toISOString(),
    delta: summarizeDelta(deltaIndex, scored),
    graph: graphContext.summary,
    context_policy: policy,
    risk_controls: riskControls,
    optimizer: selection.optimizer,
    task_profile: {
      goal,
      done,
      expect,
      expectRegex,
      explicit_files: explicitFiles,
      terms,
      risk_profile: policy.risk_profile
    },
    budget: {
      requested_tokens: budget,
      immediate_tokens: usedTokens,
      remaining_tokens: Math.max(0, budget - usedTokens),
      deferred_relevant_tokens: deferred.reduce((sum, unit) => sum + unit.token_cost, 0),
      inventory_tokens: inventory.totals.estimated_tokens
    },
    totals: {
      inventory_units: inventory.units.length,
      relevant_units: relevant.length,
      immediate_units: immediateSummaries.length,
      deferred_units: deferred.length,
      omitted_units: Math.max(0, inventory.units.length - relevant.length)
    },
    lanes: {
      immediate_context: immediateSummaries,
      on_demand_evidence: deferredSummaries,
      omitted
    },
    requirements,
    delta_coverage: deltaCoverage,
    decision_trace: decisionTrace,
    evidence: immediateSummaries.map((unit, index) => withEvidenceLoadHints({
      evidence_id: unit.evidence_id,
      unit_id: unit.id,
      file: unit.file,
      line: unit.line,
      source_hash: unit.source_hash
    })),
    gate,
    next_actions: buildNextActions({
      immediate: immediateSummaries,
      deferred: deferredSummaries,
      requirements,
      deltaCoverage,
      gate
    })
  };
}

export function formatContextPlanReport(plan) {
  const immediate = plan.lanes.immediate_context.map((unit) => (
    `- ${unit.evidence_id} ${unit.type} ${unit.file}:${unit.line} ${unit.name} (${formatNumber(unit.token_cost)} Tokens, Score ${unit.utility_score}${formatUnitBadges(unit)})`
  )).join("\n");
  const deferred = plan.lanes.on_demand_evidence.slice(0, 16).map((unit) => (
    `- ${unit.evidence_id} ${unit.type} ${unit.file}:${unit.line} ${unit.name} (${formatNumber(unit.token_cost)} Tokens, Score ${unit.utility_score}${formatUnitBadges(unit)})`
  )).join("\n");

  return `
# ContextPlanV1

Ziel: ${plan.task_profile.goal}
Gate: ${plan.gate.status}

- Budget: ${formatNumber(plan.budget.immediate_tokens)}/${formatNumber(plan.budget.requested_tokens)} Tokens sofort verplant
- Relevante Einheiten: ${formatNumber(plan.totals.relevant_units)}
- Sofort laden: ${formatNumber(plan.totals.immediate_units)}
- Bei Bedarf nachladen: ${formatNumber(plan.totals.deferred_units)}
- Bewusst weggelassen: ${formatNumber(plan.totals.omitted_units)}
- Delta: ${formatDeltaSummary(plan.delta)}
- Delta-Coverage: ${formatDeltaCoverageSummary(plan.delta_coverage)}
- Graph: ${formatGraphSummary(plan.graph)}
- Optimierer: ${formatOptimizerSummary(plan.optimizer)}
- Decision Trace: ${formatDecisionTraceSummary(plan.decision_trace)}
- Risiko-Policy: ${formatRiskControlSummary(plan.risk_controls)}
- Muss-Fakten: ${formatRequirementSummary(plan.requirements)}

## Sofort Laden

${immediate || "- keine Einheiten ausgewählt"}

## Bei Bedarf Nachladen

${deferred || "- keine weiteren relevanten Einheiten"}

## Muss-Fakten

${formatRequirementRows(plan.requirements)}

## Nächste Schritte

${plan.next_actions.map((action) => `- ${action}`).join("\n")}
${formatGateReasons(plan.gate.reasons)}
`.trim();
}

function scoreUnit(unit, context) {
  const haystack = `${unit.type} ${unit.name} ${unit.file}`.toLowerCase();
  const identityKey = unitIdentityKey(unit);
  const deltaStatus = getDeltaStatus(unit, context.deltaIndex);
  const matchedTerms = context.terms.filter((term) => haystack.includes(term));
  const explicitFileMatch = context.explicitFiles.some((file) => unit.file === file || unit.file.endsWith(`/${file}`));
  const doneMatch = context.done.some((criterion) => haystack.includes(criterion.toLowerCase()));
  const taskRelevance = matchedTerms.length * 12 + (explicitFileMatch ? 45 : 0) + (doneMatch ? 8 : 0);
  const typeWeight = TYPE_WEIGHTS[unit.type] || 4;
  const riskValue = isRiskyUnit(unit) ? 16 : 0;
  const dependencyValue = unit.type === "import" ? 6 : 0;
  const noveltyValue = deltaStatus === "changed" ? 28 : deltaStatus === "added" ? 20 : 0;
  const baseRelevant = taskRelevance > 0 || explicitFileMatch || deltaStatus === "changed" || deltaStatus === "added";
  const utilityScore = taskRelevance + typeWeight + riskValue + dependencyValue + noveltyValue;

  return {
    ...unit,
    identity_key: identityKey,
    delta_status: deltaStatus,
    is_relevant: baseRelevant,
    graph_related: false,
    token_cost: Number(unit.estimated_tokens) || 1,
    utility_score: utilityScore,
    score_breakdown: {
      base_relevant: baseRelevant,
      task_relevance: taskRelevance,
      type_weight: typeWeight,
      risk_value: riskValue,
      dependency_value: dependencyValue,
      novelty_value: noveltyValue,
      graph_value: 0,
      matched_terms: matchedTerms,
      explicit_file_match: explicitFileMatch
    },
    selection_reason: buildSelectionReason({
      unit,
      matchedTerms,
      explicitFileMatch,
      riskValue,
      dependencyValue,
      deltaStatus
    })
  };
}

function summarizeUnit(unit, lane, index = 0) {
  return withEvidenceLoadHints({
    id: unit.id,
    unit_id: unit.id,
    evidence_id: `${lane}-${String(index + 1).padStart(4, "0")}`,
    type: unit.type,
    name: unit.name,
    file: unit.file,
    line: unit.line,
    source_hash: unit.source_hash,
    identity_key: unit.identity_key,
    delta_status: unit.delta_status,
    is_relevant: unit.is_relevant,
    graph_related: unit.graph_related,
    token_cost: unit.token_cost,
    utility_score: unit.utility_score,
    selection_priority: unit.selection_priority,
    selection_efficiency: unit.selection_efficiency,
    selection_lane_reason: unit.selection_lane_reason,
    score_breakdown: unit.score_breakdown,
    selection_reason: unit.selection_reason
  });
}

function selectContextUnderBudget(relevant, budget) {
  const immediate = [];
  const selectedIds = new Set();
  let usedTokens = 0;
  let selectedSeedUnits = 0;
  let selectedDensityUnits = 0;
  let overflowSelected = false;

  const addIfFits = (unit, reason) => {
    if (selectedIds.has(unit.id)) return false;
    if (usedTokens + unit.token_cost > budget) return false;
    immediate.push({
      ...unit,
      selection_lane_reason: reason
    });
    selectedIds.add(unit.id);
    usedTokens += unit.token_cost;
    if (reason === "seed") selectedSeedUnits += 1;
    if (reason === "density") selectedDensityUnits += 1;
    return true;
  };

  const seedUnits = relevant
    .filter(isOptimizerSeed)
    .sort(comparePlanOrder);
  for (const unit of seedUnits) {
    addIfFits(unit, "seed");
  }

  const densityUnits = relevant
    .filter((unit) => !selectedIds.has(unit.id))
    .sort(compareEfficiencyOrder);
  for (const unit of densityUnits) {
    addIfFits(unit, "density");
  }

  if (!immediate.length && relevant.length) {
    const fallback = relevant.find((unit) => unit.token_cost <= budget) || relevant[0];
    overflowSelected = fallback.token_cost > budget;
    immediate.push({
      ...fallback,
      selection_lane_reason: overflowSelected ? "oversized-fallback" : "fallback-under-budget"
    });
    selectedIds.add(fallback.id);
    usedTokens += fallback.token_cost;
  }

  const deferred = relevant
    .filter((unit) => !selectedIds.has(unit.id))
    .map((unit) => ({
      ...unit,
      selection_lane_reason: "budget-limit"
    }));

  return {
    immediate,
    deferred,
    usedTokens,
    optimizer: {
      schema: "ContextBudgetOptimizerV1",
      strategy: "seed-then-density-greedy",
      budget_tokens: budget,
      used_tokens: usedTokens,
      remaining_tokens: Math.max(0, budget - usedTokens),
      relevant_units: relevant.length,
      seed_units: seedUnits.length,
      selected_seed_units: selectedSeedUnits,
      selected_density_units: selectedDensityUnits,
      deferred_relevant_units: deferred.length,
      skipped_for_budget: deferred.length,
      overflow_selected: overflowSelected,
      density_sort: true
    }
  };
}

function buildDecisionTrace(context) {
  const immediate = context.immediate || [];
  const deferredSummaries = context.deferredSummaries || [];
  const deferred = context.deferred || [];
  const omitted = context.omitted || [];
  const omittedTotal = Math.max(0, (context.inventory?.units?.length || 0) - (context.relevant?.length || 0));
  const unlistedDeferred = Math.max(0, deferred.length - deferredSummaries.length);
  const unlistedOmitted = Math.max(0, omittedTotal - omitted.length);
  const riskReasons = context.riskControls?.reasons || [];
  const uncertainty = buildDecisionUncertaintyRegister({
    requirements: context.requirements,
    deltaCoverage: context.deltaCoverage,
    riskControls: context.riskControls,
    gate: context.gate,
    unlistedDeferred,
    unlistedOmitted
  });
  const status = context.gate?.verified && !uncertainty.some((item) => item.severity === "blocking")
    ? "verified-decision-trace"
    : "decision-trace-needs-review";

  return {
    schema: "ContextDecisionTraceV1",
    trace_id: `decision-trace-${sha256([
      context.inventory?.inventory_id || context.inventory?.root || "",
      context.budget,
      context.usedTokens,
      immediate.map((unit) => unit.id).join(","),
      deferredSummaries.map((unit) => unit.id).join(","),
      context.gate?.status || ""
    ].join("|")).slice(0, 12)}`,
    status,
    verified: status === "verified-decision-trace",
    strategy: context.optimizer?.strategy || "unknown",
    coverage: {
      inventory_units: context.inventory?.units?.length || 0,
      relevant_units: context.relevant?.length || 0,
      immediate_units: immediate.length,
      deferred_units: deferred.length,
      deferred_trace_units: deferredSummaries.length,
      unlisted_deferred_units: unlistedDeferred,
      omitted_units: omittedTotal,
      omitted_preview_units: omitted.length,
      unlisted_omitted_units: unlistedOmitted
    },
    budget_decisions: {
      requested_tokens: context.budget,
      used_tokens: context.usedTokens,
      remaining_tokens: Math.max(0, context.budget - context.usedTokens),
      skipped_for_budget: context.optimizer?.skipped_for_budget || 0,
      overflow_selected: Boolean(context.optimizer?.overflow_selected),
      top_budget_rejections: deferred
        .slice()
        .sort(comparePlanOrder)
        .slice(0, 12)
        .map((unit) => toDecisionTraceUnit(unit, "on_demand_evidence", "budget-limit"))
    },
    lane_decisions: [
      summarizeDecisionLane("immediate_context", immediate),
      summarizeDecisionLane("on_demand_evidence", deferredSummaries),
      summarizeDecisionLane("omitted_preview", omitted)
    ],
    risk_decisions: {
      risk_profile: context.riskControls?.risk_profile || "unknown",
      status: context.riskControls?.status || "unknown",
      immediate_risk_units: context.riskControls?.immediate_risk_units || 0,
      deferred_risk_units: context.riskControls?.deferred_risk_units || 0,
      review_required: riskReasons.length > 0,
      reasons: riskReasons,
      deferred_preview: context.riskControls?.deferred_preview || []
    },
    delta_decisions: summarizeDecisionDelta(context.deltaCoverage),
    requirement_decisions: summarizeDecisionRequirements(context.requirements),
    uncertainty_register: uncertainty,
    quality_contract: [
      "Use immediate_context as the only eager start context.",
      "Load on_demand_evidence before relying on exact deferred source details.",
      "Treat blocking uncertainty as a review gate, not as successful compression.",
      "Use source_hash and evidence_id when expanding a decision."
    ]
  };
}

function summarizeDecisionLane(lane, units) {
  return {
    lane,
    units: units.length,
    tokens: units.reduce((sum, unit) => sum + (Number(unit.token_cost) || 0), 0),
    decision_reasons: countByLocal(units, (unit) => unit.selection_lane_reason || unit.selection_priority || "unknown"),
    priority_mix: countByLocal(units, (unit) => unit.selection_priority || "unknown"),
    top_units: units
      .slice()
      .sort((left, right) => right.utility_score - left.utility_score || left.token_cost - right.token_cost)
      .slice(0, 8)
      .map((unit) => toDecisionTraceUnit(unit, lane, unit.selection_lane_reason || unit.selection_priority || "unknown"))
  };
}

function toDecisionTraceUnit(unit, lane, decision) {
  const base = {
    evidence_id: unit.evidence_id || null,
    unit_id: unit.id,
    lane,
    decision,
    type: unit.type,
    name: unit.name,
    file: unit.file,
    line: unit.line,
    token_cost: unit.token_cost,
    utility_score: unit.utility_score,
    selection_efficiency: unit.selection_efficiency,
    selection_priority: unit.selection_priority,
    selection_reason: unit.selection_reason,
    delta_status: unit.delta_status,
    graph_related: Boolean(unit.graph_related),
    source_hash: unit.source_hash
  };
  if (lane === "immediate_context") {
    return {
      ...base,
      load_hint: "already in immediate context",
      source_hash_load_hint: withEvidenceLoadHints(base).source_hash_load_hint,
      load_hints: {
        evidence: "already in immediate context",
        source_hash: withEvidenceLoadHints(base).source_hash_load_hint
      }
    };
  }
  return withEvidenceLoadHints(base);
}

function summarizeDecisionDelta(deltaCoverage) {
  if (!deltaCoverage?.enabled) {
    return {
      enabled: false,
      status: "not-used",
      verified: true,
      tracked_units: 0,
      covered_units: 0,
      missing_units: []
    };
  }

  return {
    enabled: true,
    status: deltaCoverage.status,
    verified: deltaCoverage.verified,
    tracked_units: deltaCoverage.tracked_units,
    covered_units: deltaCoverage.covered_units,
    immediate_units: deltaCoverage.immediate_units,
    on_demand_units: deltaCoverage.on_demand_units,
    coverage_percent: deltaCoverage.coverage_percent,
    missing_units: deltaCoverage.missing_units
  };
}

function summarizeDecisionRequirements(requirements) {
  if (!requirements?.enabled) {
    return {
      enabled: false,
      status: "not-set",
      total: 0,
      covered: 0,
      missing: []
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
    evidence_loads_required: requirements.items.filter((item) => item.status === "on_demand" || item.status === "source").length
  };
}

function buildDecisionUncertaintyRegister(context) {
  const items = [];
  if (context.requirements?.enabled && context.requirements.missing.length) {
    items.push({
      id: "required-expectation-missing",
      severity: "blocking",
      detail: `${context.requirements.missing.length} must-survive expectation(s) missing`,
      action: "Add source context or correct the expectation before handoff."
    });
  }
  if (context.requirements?.enabled && context.requirements.status === "requires-evidence-load") {
    items.push({
      id: "requirement-evidence-on-demand",
      severity: "review",
      detail: `${context.requirements.on_demand} must-survive expectation(s) require evidence loading`,
      action: "Load listed requirement evidence before relying on exact facts."
    });
  }
  if (context.deltaCoverage?.enabled && context.deltaCoverage.status === "cache-missing") {
    items.push({
      id: "delta-cache-missing",
      severity: "blocking",
      detail: "Delta-aware planning was requested but the cache is missing.",
      action: "Create the cache or rerun without delta assumptions."
    });
  }
  if (context.deltaCoverage?.enabled && context.deltaCoverage.status === "partial") {
    items.push({
      id: "delta-coverage-incomplete",
      severity: "blocking",
      detail: `${context.deltaCoverage.missing_units.length} changed/added preview unit(s) are not addressable`,
      action: "Increase budget or load missing delta evidence before handoff."
    });
  }
  for (const reason of context.riskControls?.reasons || []) {
    items.push({
      id: reason,
      severity: "blocking",
      detail: "Risk policy requires review before this plan is handoff-ready.",
      action: "Increase start budget or load deferred risk evidence."
    });
  }
  if (context.unlistedDeferred > 0) {
    items.push({
      id: "deferred-trace-truncated",
      severity: "info",
      detail: `${context.unlistedDeferred} deferred relevant unit(s) are outside the bounded trace preview`,
      action: "Raise maxFiles or use lookup/load evidence for narrower follow-up context."
    });
  }
  if (context.unlistedOmitted > 0) {
    items.push({
      id: "omitted-trace-truncated",
      severity: "info",
      detail: `${context.unlistedOmitted} omitted unit(s) are outside the bounded preview`,
      action: "Use inventory or lookup when omitted context matters."
    });
  }
  if (context.gate?.reasons?.length) {
    for (const reason of context.gate.reasons) {
      if (items.some((item) => item.id === reason)) continue;
      items.push({
        id: reason,
        severity: "blocking",
        detail: "ContextPlan gate requires review.",
        action: "Resolve the gate reason before treating the plan as verified."
      });
    }
  }
  return items;
}

function annotateSelectionMetrics(unit) {
  const efficiency = unit.token_cost ? unit.utility_score / unit.token_cost : unit.utility_score;
  return {
    ...unit,
    selection_priority: selectionPriority(unit),
    selection_efficiency: Math.round(efficiency * 1000) / 1000
  };
}

function selectionPriority(unit) {
  if (unit.score_breakdown?.explicit_file_match) return "explicit-file";
  if (unit.delta_status === "changed") return "changed";
  if (unit.delta_status === "added") return "added";
  if (unit.graph_related) return "graph-neighbor";
  return "candidate";
}

function isOptimizerSeed(unit) {
  return unit.selection_priority === "explicit-file"
    || unit.selection_priority === "changed"
    || unit.selection_priority === "added";
}

function comparePlanOrder(left, right) {
  return right.utility_score - left.utility_score
    || left.token_cost - right.token_cost
    || left.file.localeCompare(right.file)
    || left.line - right.line;
}

function compareEfficiencyOrder(left, right) {
  return right.selection_efficiency - left.selection_efficiency
    || right.utility_score - left.utility_score
    || left.token_cost - right.token_cost
    || left.file.localeCompare(right.file)
    || left.line - right.line;
}

async function buildGraphContext(root, scoredUnits, options) {
  if (!options.enabled) {
    return {
      relatedIds: new Set(),
      summary: {
        enabled: false,
        status: "not-used",
        related_units: 0,
        edges_considered: 0,
        total_edges: 0,
        total_nodes: 0
      }
    };
  }

  const baseRelevantIds = new Set(scoredUnits
    .filter((unit) => unit.is_relevant)
    .map((unit) => unit.id));
  const graph = await buildContextGraph(root, {
    maxFiles: options.maxFiles
  });
  const relatedIds = new Set();
  let edgesConsidered = 0;

  if (baseRelevantIds.size) {
    for (const edge of graph.edges) {
      const fromRelevant = baseRelevantIds.has(edge.from);
      const toRelevant = baseRelevantIds.has(edge.to);
      if (!fromRelevant && !toRelevant) continue;

      edgesConsidered += 1;
      if (fromRelevant && !toRelevant) relatedIds.add(edge.to);
      if (toRelevant && !fromRelevant) relatedIds.add(edge.from);
    }
  }

  return {
    relatedIds,
    summary: {
      enabled: true,
      status: baseRelevantIds.size ? "expanded" : "no-seeds",
      related_units: relatedIds.size,
      edges_considered: edgesConsidered,
      total_edges: graph.totals.edges,
      total_nodes: graph.totals.nodes
    }
  };
}

function applyGraphSignal(unit, graphContext) {
  if (!graphContext.summary.enabled) {
    return unit;
  }

  if (!graphContext.relatedIds.has(unit.id)) {
    return {
      ...unit,
      score_breakdown: {
        ...unit.score_breakdown,
        graph_value: 0
      }
    };
  }

  return {
    ...unit,
    is_relevant: true,
    graph_related: true,
    utility_score: unit.utility_score + GRAPH_NEIGHBOR_WEIGHT,
    score_breakdown: {
      ...unit.score_breakdown,
      graph_value: GRAPH_NEIGHBOR_WEIGHT
    },
    selection_reason: appendSelectionReason(unit.selection_reason, "graph neighbor")
  };
}

function appendSelectionReason(current, reason) {
  return current ? `${current}; ${reason}` : reason;
}

async function buildRequirementCoverage(root, inventory, options = {}) {
  const oracle = buildAcceptanceOracle([
    ...normalizeList(options.expect || []),
    ...normalizeList(options.expectRegex || []).map((pattern) => ({ type: "regex", pattern }))
  ]);
  const immediateByLocation = new Map((options.immediate || []).map((unit) => [`${unit.file}:${unit.line}`, unit]));
  const deferredByLocation = new Map((options.deferred || []).map((unit) => [`${unit.file}:${unit.line}`, unit]));
  const files = [...new Set((inventory.units || []).map((unit) => unit.file))];
  const items = [];

  for (const expectation of oracle.expectations) {
    const matches = await findRequirementMatches(root, files, expectation);
    const evidence = matches.slice(0, 12).map((match, index) => {
      const locationKey = `${match.file}:${match.line}`;
      const immediateUnit = immediateByLocation.get(locationKey);
      const deferredUnit = deferredByLocation.get(locationKey);
      const lane = immediateUnit ? "immediate" : deferredUnit ? "on_demand" : "source";

      return withEvidenceLoadHints({
        evidence_id: `req-${expectation.id.slice(4, 10)}-${String(index + 1).padStart(3, "0")}`,
        file: match.file,
        line: match.line,
        source_hash: match.source_hash,
        line_text: match.line_text,
        lane,
        unit_id: immediateUnit?.id || deferredUnit?.id || null
      });
    });
    const status = buildRequirementStatus(evidence, matches);

    items.push({
      expectation_id: expectation.id,
      type: expectation.type,
      label: expectation.label,
      value: expectation.type === "contains" ? expectation.value : undefined,
      pattern: expectation.type === "regex" ? expectation.pattern : undefined,
      flags: expectation.type === "regex" ? expectation.flags : undefined,
      status,
      found: matches.length > 0,
      match_count: matches.length,
      evidence,
      error: matches.error || null
    });
  }

  const missing = items.filter((item) => !item.found);
  const immediate = items.filter((item) => item.status === "immediate");
  const onDemand = items.filter((item) => item.status === "on_demand" || item.status === "source");

  return {
    schema: "ContextPlanRequirementCoverageV1",
    enabled: oracle.expectations.length > 0,
    oracle: {
      schema: oracle.schema,
      type: oracle.type,
      expectations: oracle.expectations
    },
    status: !oracle.expectations.length
      ? "not-set"
      : missing.length
        ? "missing"
        : onDemand.length
          ? "requires-evidence-load"
          : "covered-immediately",
    total: items.length,
    covered: items.length - missing.length,
    immediate: immediate.length,
    on_demand: onDemand.length,
    missing: missing.map((item) => item.label),
    items
  };
}

async function findRequirementMatches(root, files, expectation) {
  const matches = [];
  const regexResult = expectation.type === "regex" ? compileRequirementRegex(expectation) : null;
  if (regexResult && !regexResult.regex) {
    matches.error = regexResult.error;
    return matches;
  }

  for (const file of files) {
    const text = await fs.readFile(path.join(root, file), "utf8");
    const lines = text.split(/\r\n|\r|\n/);
    lines.forEach((line, index) => {
      const matched = expectation.type === "regex"
        ? regexResult.regex.test(line)
        : line.includes(expectation.value);
      if (!matched) return;
      matches.push({
        file,
        line: index + 1,
        source_hash: `sha256:${sha256(line.trim())}`,
        line_text: line.trim()
      });
    });
  }

  return matches;
}

function compileRequirementRegex(expectation) {
  try {
    return {
      regex: new RegExp(expectation.pattern, expectation.flags || ""),
      error: null
    };
  } catch (error) {
    return {
      regex: null,
      error: error?.message || String(error)
    };
  }
}

function buildRequirementStatus(evidence, matches) {
  if (!matches.length) return "missing";
  if (evidence.some((item) => item.lane === "immediate")) return "immediate";
  if (evidence.some((item) => item.lane === "on_demand")) return "on_demand";
  return "source";
}

function buildPlanGate({ explicitFiles, immediate, budget, usedTokens, requirements, deltaCoverage, riskControls }) {
  const reasons = [];
  if (!immediate.length) {
    reasons.push("no-immediate-context-selected");
  }
  if (explicitFiles.length && !explicitFiles.some((file) => immediate.some((unit) => unit.file === file || unit.file.endsWith(`/${file}`)))) {
    reasons.push("explicit-file-not-selected");
  }
  if (usedTokens > budget) {
    reasons.push("budget-exceeded");
  }
  if (requirements?.enabled && requirements.missing.length) {
    reasons.push("required-expectation-missing");
  }
  if (deltaCoverage?.enabled && deltaCoverage.status === "cache-missing") {
    reasons.push("delta-cache-missing");
  }
  if (deltaCoverage?.enabled && deltaCoverage.status === "partial") {
    reasons.push("delta-coverage-incomplete");
  }
  if (riskControls?.reasons?.length) {
    reasons.push(...riskControls.reasons);
  }

  return {
    status: reasons.length ? "plan-needs-review" : "verified-plan",
    verified: reasons.length === 0,
    reasons,
    requirements: {
      immediate_context_selected: true,
      explicit_files_represented_when_given: true,
      immediate_tokens_lte_budget: true,
      evidence_ids_present: true,
      required_expectations_found_when_given: requirements?.enabled ? true : null,
      delta_coverage_satisfied: deltaCoverage?.enabled ? deltaCoverage.verified : null,
      risk_controls_satisfied: riskControls ? riskControls.status === "risk-controls-satisfied" : null
    }
  };
}

function buildNextActions({ immediate, deferred, requirements, deltaCoverage, gate }) {
  const actions = [];
  if (immediate.length) {
    actions.push("Load immediate_context first; avoid reading whole files until evidence is needed.");
  }
  if (deferred.length) {
    actions.push("Use sparkompass_load_evidence or sparkompass_load_source_hash for on_demand_evidence items before relying on exact source details.");
  }
  if (requirements?.enabled && requirements.status === "requires-evidence-load") {
    actions.push("Load requirement evidence before packing so must-survive facts are verified from source lines.");
  }
  if (deltaCoverage?.status === "partial") {
    actions.push("Increase the budget or load missing delta evidence before handoff; changed/added units are not all addressable.");
  }
  if (deltaCoverage?.status === "cache-missing") {
    actions.push("Create the requested context cache before relying on delta-aware planning.");
  }
  if (gate.reasons.includes("strict-risk-unit-deferred") || gate.reasons.includes("careful-risk-unit-deferred")) {
    actions.push("Increase the start budget or load deferred risk units before treating this plan as handoff-ready.");
  }
  actions.push("Run sparkompass_shadow_compare after packing task evidence when exact facts or regex patterns are known.");
  if (!gate.verified) {
    actions.push("Review plan gate reasons before using this context plan.");
  }
  return actions;
}

function buildRiskControls(policy, context) {
  const immediateRiskUnits = context.immediate.filter(isRiskyScoredUnit);
  const deferredRiskUnits = context.deferred.filter(isRiskyScoredUnit);
  const relevantRiskUnits = immediateRiskUnits.length + deferredRiskUnits.length;
  const budgetBelowPolicyMinimum = relevantRiskUnits > 0 && context.budget < policy.min_start_budget_tokens;
  const reasons = [];

  if (budgetBelowPolicyMinimum && policy.deferred_risk_units_require_review) {
    reasons.push(`${policy.risk_profile}-start-budget-below-risk-floor`);
  }
  if (deferredRiskUnits.length && policy.deferred_risk_units_require_review) {
    reasons.push(`${policy.risk_profile}-risk-unit-deferred`);
  }

  return {
    schema: "ContextPlanRiskControlsV1",
    risk_profile: policy.risk_profile,
    policy: {
      risk_unit_policy: policy.risk_unit_policy,
      default_start_budget_tokens: policy.default_start_budget_tokens,
      min_start_budget_tokens: policy.min_start_budget_tokens,
      deferred_risk_units_require_review: policy.deferred_risk_units_require_review
    },
    budget: {
      requested_tokens: context.budget,
      used_tokens: context.usedTokens,
      below_policy_minimum: budgetBelowPolicyMinimum
    },
    relevant_risk_units: relevantRiskUnits,
    immediate_risk_units: immediateRiskUnits.length,
    deferred_risk_units: deferredRiskUnits.length,
    deferred_preview: deferredRiskUnits.slice(0, 12).map(toRiskControlUnit),
    status: reasons.length ? "risk-review-required" : "risk-controls-satisfied",
    reasons,
    caveat: "Risk controls are heuristic planning gates; load source evidence before relying on exact omitted details."
  };
}

function toRiskControlUnit(unit) {
  return withEvidenceLoadHints({
    unit_id: unit.id,
    type: unit.type,
    name: unit.name,
    file: unit.file,
    line: unit.line,
    token_cost: unit.token_cost,
    utility_score: unit.utility_score,
    selection_reason: unit.selection_reason,
    source_hash: unit.source_hash
  });
}

function buildSelectionReason({ unit, matchedTerms, explicitFileMatch, riskValue, dependencyValue, deltaStatus }) {
  const reasons = [];
  if (matchedTerms.length) reasons.push(`matched terms: ${matchedTerms.join(", ")}`);
  if (explicitFileMatch) reasons.push("explicit file");
  if (deltaStatus === "changed") reasons.push("changed since cache");
  if (deltaStatus === "added") reasons.push("new since cache");
  if (riskValue) reasons.push("risk-bearing unit");
  if (dependencyValue) reasons.push("dependency/import signal");
  if (!reasons.length) reasons.push(`${unit.type} unit`);
  return reasons.join("; ");
}

async function buildDeltaIndex(root, cachePath) {
  if (!cachePath) {
    return {
      enabled: false,
      cache_path: null,
      units: new Map(),
      missing: false,
      error: null
    };
  }

  const resolvedPath = path.isAbsolute(String(cachePath))
    ? String(cachePath)
    : path.resolve(root, String(cachePath));

  try {
    const cache = JSON.parse(await fs.readFile(resolvedPath, "utf8"));
    const units = new Map((cache.units || []).map((unit) => [unit.identity_key || unitIdentityKey(unit), unit]));
    return {
      enabled: true,
      cache_path: resolvedPath,
      cache_id: cache.cache_id || null,
      units,
      missing: false,
      error: null
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        enabled: true,
        cache_path: resolvedPath,
        cache_id: null,
        units: new Map(),
        missing: true,
        error: "cache-not-found"
      };
    }
    throw error;
  }
}

function getDeltaStatus(unit, deltaIndex) {
  if (!deltaIndex?.enabled) return "unknown";
  const previous = deltaIndex.units.get(unitIdentityKey(unit));
  if (!previous) return "added";
  return previous.source_hash === unit.source_hash ? "stable" : "changed";
}

function summarizeDelta(deltaIndex, scoredUnits) {
  if (!deltaIndex?.enabled) {
    return {
      enabled: false,
      cache_path: null,
      cache_id: null,
      status: "not-used",
      stable: 0,
      added: 0,
      changed: 0,
      unknown: scoredUnits.length
    };
  }

  const counts = scoredUnits.reduce((acc, unit) => {
    acc[unit.delta_status] = (acc[unit.delta_status] || 0) + 1;
    return acc;
  }, {});

  return {
    enabled: true,
    cache_path: deltaIndex.cache_path,
    cache_id: deltaIndex.cache_id,
    status: deltaIndex.missing ? "cache-missing" : "compared",
    stable: counts.stable || 0,
    added: counts.added || 0,
    changed: counts.changed || 0,
    unknown: counts.unknown || 0
  };
}

function buildDeltaCoverage(deltaIndex, scoredUnits, lanes = {}) {
  const base = {
    schema: "ContextPlanDeltaCoverageV1",
    enabled: Boolean(deltaIndex?.enabled),
    cache_status: deltaIndex?.missing ? "cache-missing" : deltaIndex?.enabled ? "compared" : "not-used",
    status: "not-used",
    verified: true,
    changed_units: 0,
    added_units: 0,
    tracked_units: 0,
    covered_units: 0,
    immediate_units: 0,
    on_demand_units: 0,
    missing_units: [],
    coverage_percent: 100,
    caveat: "Delta coverage is based on semantic unit identity and source hashes, not billing data."
  };

  if (!deltaIndex?.enabled) {
    return base;
  }
  if (deltaIndex.missing) {
    return {
      ...base,
      status: "cache-missing",
      verified: false,
      coverage_percent: 0
    };
  }

  const visibleById = new Map();
  for (const unit of lanes.immediate || []) {
    visibleById.set(unit.id, "immediate");
  }
  for (const unit of lanes.deferred || []) {
    if (!visibleById.has(unit.id)) visibleById.set(unit.id, "on_demand");
  }

  const tracked = scoredUnits
    .filter((unit) => unit.delta_status === "changed" || unit.delta_status === "added")
    .map((unit) => withEvidenceLoadHints({
      id: unit.id,
      unit_id: unit.id,
      type: unit.type,
      name: unit.name,
      file: unit.file,
      line: unit.line,
      delta_status: unit.delta_status,
      token_cost: unit.token_cost,
      lane: visibleById.get(unit.id) || "missing",
      source_hash: unit.source_hash
    }));
  const covered = tracked.filter((unit) => unit.lane !== "missing");
  const immediate = tracked.filter((unit) => unit.lane === "immediate");
  const onDemand = tracked.filter((unit) => unit.lane === "on_demand");
  const missing = tracked.filter((unit) => unit.lane === "missing");
  const status = tracked.length === 0
    ? "no-changes"
    : missing.length
      ? "partial"
      : "covered";

  return {
    ...base,
    status,
    verified: status !== "partial",
    changed_units: tracked.filter((unit) => unit.delta_status === "changed").length,
    added_units: tracked.filter((unit) => unit.delta_status === "added").length,
    tracked_units: tracked.length,
    covered_units: covered.length,
    immediate_units: immediate.length,
    on_demand_units: onDemand.length,
    missing_units: missing.slice(0, 24),
    coverage_percent: tracked.length ? Math.round((covered.length / tracked.length) * 100) : 100
  };
}

function unitIdentityKey(unit) {
  return unit.identity_key || `${unit.type}:${unit.file}:${unit.name}`;
}

function buildTaskTerms(values) {
  return [...new Set(values
    .flatMap((value) => String(value || "").toLowerCase().split(/[^a-z0-9_$.-]+/i))
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .filter((term) => !["the", "und", "oder", "mit", "for", "when", "done", "fix", "bug"].includes(term)))];
}

function buildPlanExcludeFiles(root, cachePath, extraFiles = []) {
  const files = [];
  if (cachePath) {
    files.push(path.isAbsolute(String(cachePath))
      ? String(cachePath)
      : path.resolve(root, String(cachePath)));
  }
  for (const file of normalizeList(extraFiles)) {
    files.push(path.isAbsolute(String(file)) ? String(file) : path.resolve(root, String(file)));
  }
  return files;
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function formatRequirementSummary(requirements) {
  if (!requirements?.enabled) return "nicht gesetzt";
  return `${formatNumber(requirements.covered)}/${formatNumber(requirements.total)} gefunden, ${requirements.status}`;
}

function formatRiskControlSummary(riskControls) {
  if (!riskControls) return "nicht gesetzt";
  const deferred = riskControls.deferred_risk_units
    ? `, ${formatNumber(riskControls.deferred_risk_units)} riskante Einheit(en) deferred`
    : "";
  return `${riskControls.risk_profile}, ${riskControls.status}${deferred}`;
}

function formatRequirementRows(requirements) {
  if (!requirements?.enabled) return "- keine Muss-Fakten gesetzt";
  return requirements.items.map((item) => {
    const firstEvidence = item.evidence[0];
    const hint = firstEvidence ? `, ${firstEvidence.file}:${firstEvidence.line}` : "";
    return `- ${item.label}: ${item.status}${hint}`;
  }).join("\n");
}

function isRiskyUnit(unit) {
  const text = `${unit.type} ${unit.name} ${unit.file}`.toLowerCase();
  return /error|fatal|exception|failed|auth|token|secret|migration|force|delete|config/.test(text);
}

function isRiskyScoredUnit(unit) {
  return (Number(unit.score_breakdown?.risk_value) || 0) > 0 || isRiskyUnit(unit);
}

function resolvePlanBudget(value, policy) {
  return clampInteger(
    value,
    policy.default_start_budget_tokens || 800,
    50,
    100_000
  );
}

function formatGateReasons(reasons = []) {
  if (!reasons.length) return "\n- Gate-Probleme: keine";
  return `\n- Gate-Probleme:\n${reasons.map((reason) => `  - ${reason}`).join("\n")}`;
}

function formatUnitBadges(unit) {
  const badges = [];
  if (unit.delta_status && unit.delta_status !== "unknown") badges.push(unit.delta_status);
  if (unit.graph_related) badges.push("graph");
  return badges.length ? `, ${badges.join(", ")}` : "";
}

function formatDeltaSummary(delta) {
  if (!delta?.enabled) return "nicht genutzt";
  if (delta.status === "cache-missing") return `Cache fehlt (${delta.cache_path})`;
  return `${formatNumber(delta.changed)} geändert, ${formatNumber(delta.added)} neu, ${formatNumber(delta.stable)} stabil`;
}

function formatDeltaCoverageSummary(deltaCoverage) {
  if (!deltaCoverage?.enabled) return "nicht genutzt";
  if (deltaCoverage.status === "cache-missing") return "Cache fehlt";
  return `${formatNumber(deltaCoverage.covered_units)}/${formatNumber(deltaCoverage.tracked_units)} geändert/neu adressierbar, ${deltaCoverage.status}`;
}

function formatGraphSummary(graph) {
  if (!graph?.enabled) return "nicht genutzt";
  if (graph.status === "no-seeds") return `keine Startknoten (${formatNumber(graph.total_nodes)} Knoten, ${formatNumber(graph.total_edges)} Kanten)`;
  return `${formatNumber(graph.related_units)} Nachbarn aus ${formatNumber(graph.edges_considered)} Kanten`;
}

function formatOptimizerSummary(optimizer) {
  if (!optimizer) return "nicht genutzt";
  const overflow = optimizer.overflow_selected ? ", mit Budget-Überlauf" : "";
  return `${optimizer.strategy}, ${formatNumber(optimizer.used_tokens)}/${formatNumber(optimizer.budget_tokens)} Tokens, ${formatNumber(optimizer.skipped_for_budget)} nach Bedarf${overflow}`;
}

function formatDecisionTraceSummary(trace) {
  if (!trace) return "nicht genutzt";
  const blocking = (trace.uncertainty_register || []).filter((item) => item.severity === "blocking").length;
  const review = (trace.uncertainty_register || []).filter((item) => item.severity === "review").length;
  const truncated = trace.coverage?.unlisted_deferred_units || trace.coverage?.unlisted_omitted_units
    ? `, Vorschau begrenzt (${formatNumber((trace.coverage.unlisted_deferred_units || 0) + (trace.coverage.unlisted_omitted_units || 0))} nicht gelistet)`
    : "";
  return `${trace.status}, ${formatNumber(trace.coverage?.immediate_units || 0)} sofort, ${formatNumber(trace.coverage?.deferred_units || 0)} on-demand, ${formatNumber(blocking)} Blocker, ${formatNumber(review)} Review${truncated}`;
}

function countByLocal(items, keyFn) {
  return (items || []).reduce((acc, item) => {
    const key = keyFn(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
