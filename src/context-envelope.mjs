import { createHash } from "node:crypto";
import { buildContextPlan } from "./context-plan.mjs";
import { buildSourceHashLoadHint } from "./evidence-hints.mjs";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

const DEFAULT_CACHE_PREFIX_TOKENS = 1024;

export async function buildContextEnvelope(rootPath, options = {}) {
  const plan = await buildContextPlan(rootPath, options);
  return buildContextEnvelopeFromPlan(plan, options);
}

export function buildContextEnvelopeFromPlan(plan, options = {}) {
  const minCachePrefixTokens = clampInteger(
    options.minCachePrefixTokens,
    DEFAULT_CACHE_PREFIX_TOKENS,
    1,
    1_000_000
  );
  const staticSegment = buildSegment({
    id: "stable-prefix-0001",
    lane: "stable_prefix",
    role: "handoff_protocol",
    mutability: "static",
    purpose: "Keep this segment byte-identical across similar runs so prompt-cache prefixes can match.",
    text: buildHandoffProtocolText(plan)
  });
  const semiStableUnits = plan.lanes.immediate_context.filter((unit) => !isVolatileUnit(unit));
  const volatileUnits = plan.lanes.immediate_context.filter(isVolatileUnit);
  const semiStableSegment = buildSegment({
    id: "semi-stable-prefix-0001",
    lane: "semi_stable_prefix",
    role: "repository_map",
    mutability: plan.delta.enabled ? "content-addressed" : "unknown-without-delta-cache",
    purpose: "Repository units selected for the start context; keep before task-specific tail when unchanged.",
    text: buildUnitSegmentText("Semi-Stable Repository Map", semiStableUnits)
  });
  const taskSegment = buildSegment({
    id: "variable-tail-0001",
    lane: "variable_tail",
    role: "task_profile",
    mutability: "per-task",
    purpose: "Task-specific instructions belong after reusable prefix material.",
    text: buildTaskSegmentText(plan)
  });
  const volatileSegment = buildSegment({
    id: "variable-tail-0002",
    lane: "variable_tail",
    role: "changed_context",
    mutability: "volatile",
    purpose: "Changed or added units stay in the variable tail so they do not break reusable prefix material.",
    text: buildUnitSegmentText("Changed Or Added Immediate Context", volatileUnits)
  });
  const requirementSegment = buildSegment({
    id: "on-demand-0001",
    lane: "on_demand_index",
    role: "requirement_evidence",
    mutability: "source-backed",
    purpose: "Load these source-backed facts before relying on exact details.",
    text: buildRequirementSegmentText(plan)
  });
  const deferredSegment = buildSegment({
    id: "on-demand-0002",
    lane: "on_demand_index",
    role: "deferred_evidence",
    mutability: "source-backed",
    purpose: "Keep deferred context out of the initial prompt and load it only when needed.",
    text: buildUnitSegmentText("On-Demand Evidence Index", plan.lanes.on_demand_evidence)
  });
  const segments = [
    staticSegment,
    semiStableSegment,
    taskSegment,
    volatileSegment,
    requirementSegment,
    deferredSegment
  ];
  const promptSegments = segments.filter((segment) => segment.lane !== "on_demand_index");
  const onDemandSegments = segments.filter((segment) => segment.lane === "on_demand_index");
  const stablePrefixText = joinSegmentTexts([staticSegment, semiStableSegment]);
  const strictStablePrefixText = joinSegmentTexts([staticSegment]);
  const variableTailText = joinSegmentTexts([taskSegment, volatileSegment]);
  const promptText = joinSegmentTexts(promptSegments);
  const onDemandText = joinSegmentTexts(onDemandSegments);
  const prefixStats = estimateTextStats(stablePrefixText);
  const strictPrefixStats = estimateTextStats(strictStablePrefixText);
  const variableStats = estimateTextStats(variableTailText);
  const onDemandStats = estimateTextStats(onDemandText);
  const promptStats = estimateTextStats(promptText);
  const assembly = {
    send_order: promptSegments.map((segment) => segment.id),
    on_demand_order: onDemandSegments.map((segment) => segment.id),
    stable_prefix_hash: `sha256:${sha256(stablePrefixText)}`,
    strict_static_prefix_hash: `sha256:${sha256(strictStablePrefixText)}`,
    variable_tail_hash: `sha256:${sha256(variableTailText)}`,
    on_demand_index_hash: `sha256:${sha256(onDemandText)}`,
    full_prompt_hash: `sha256:${sha256(promptText)}`
  };
  const cacheMetrics = {
    schema: "ContextEnvelopeCacheMetricsV1",
    prompt_estimated_tokens: promptStats.estimatedTokens,
    strict_static_prefix_tokens: strictPrefixStats.estimatedTokens,
    reusable_prefix_tokens: prefixStats.estimatedTokens,
    variable_tail_tokens: variableStats.estimatedTokens,
    on_demand_index_tokens: onDemandStats.estimatedTokens,
    reusable_prefix_percent: percentage(prefixStats.estimatedTokens, promptStats.estimatedTokens),
    variable_tail_percent: percentage(variableStats.estimatedTokens, promptStats.estimatedTokens),
    prefix_status: prefixStats.estimatedTokens >= minCachePrefixTokens
      ? "prefix-meets-estimated-threshold"
      : "prefix-below-estimated-threshold",
    exact_prefix_hash: assembly.stable_prefix_hash
  };
  const prefixReuse = buildPrefixReuse(options.previousEnvelope, {
    assembly,
    cacheMetrics
  });
  const warnings = buildEnvelopeWarnings(plan, {
    prefixTokens: prefixStats.estimatedTokens,
    strictPrefixTokens: strictPrefixStats.estimatedTokens,
    minCachePrefixTokens,
    prefixReuse
  });

  return {
    schema: "ContextEnvelopeV1",
    root: plan.root,
    generated_at: new Date().toISOString(),
    plan: {
      schema: plan.schema,
      gate: plan.gate,
      optimizer: plan.optimizer,
      delta: plan.delta,
      graph: plan.graph,
      requirements: plan.requirements,
      budget: plan.budget,
      totals: plan.totals
    },
    task_profile: plan.task_profile,
    prompt_cache_strategy: {
      schema: "PromptCacheStrategyV1",
      strategy: "static-and-semi-stable-prefix-before-variable-tail",
      source_basis: "OpenAI prompt caching uses exact prompt prefixes; put static content before variable content.",
      min_cache_prefix_tokens: minCachePrefixTokens,
      exact_prefix_required: true,
      static_first: true,
      variable_last: true,
      caveat: "Token counts are estimates and do not prove a billed cache hit."
    },
    segments,
    assembly,
    cache_metrics: cacheMetrics,
    prefix_reuse: prefixReuse,
    prompt: {
      estimated_tokens: promptStats.estimatedTokens,
      hash: `sha256:${sha256(promptText)}`,
      text: promptText
    },
    on_demand_index: {
      estimated_tokens: onDemandStats.estimatedTokens,
      hash: `sha256:${sha256(onDemandText)}`,
      text: onDemandText
    },
    gate: {
      status: plan.gate.verified ? "verified-envelope" : "envelope-needs-review",
      verified: plan.gate.verified,
      reasons: plan.gate.reasons,
      advisory_warnings: warnings
    },
    next_actions: buildEnvelopeNextActions(plan, warnings, prefixReuse)
  };
}

export function formatContextEnvelopeReport(envelope) {
  return `
# ContextEnvelopeV1

Ziel: ${envelope.task_profile.goal}
Gate: ${envelope.gate.status}

- Prompt-Layout: ${formatNumber(envelope.cache_metrics.reusable_prefix_tokens)} Prefix-Tokens, ${formatNumber(envelope.cache_metrics.variable_tail_tokens)} variable Tail-Tokens
- On-Demand-Index: ${formatNumber(envelope.cache_metrics.on_demand_index_tokens)} Tokens, nicht für den Startprompt gedacht
- Prompt-Cache-Status: ${envelope.cache_metrics.prefix_status}
- Prefix-Wiederverwendung: ${formatPrefixReuse(envelope.prefix_reuse)}
- Prefix-Hash: ${envelope.assembly.stable_prefix_hash}
- Voller Prompt-Hash: ${envelope.assembly.full_prompt_hash}

## Sende-Reihenfolge

${envelope.assembly.send_order.map((id) => `- ${id}`).join("\n")}

## Segmente

${envelope.segments.map(formatSegmentRow).join("\n")}

## Nächste Schritte

${envelope.next_actions.map((action) => `- ${action}`).join("\n")}
${formatWarnings(envelope.gate.advisory_warnings)}
`.trim();
}

function buildSegment({ id, lane, role, mutability, purpose, text }) {
  const stats = estimateTextStats(text);
  return {
    id,
    lane,
    role,
    mutability,
    purpose,
    estimated_tokens: stats.estimatedTokens,
    hash: `sha256:${sha256(text)}`,
    text
  };
}

function buildHandoffProtocolText() {
  return [
    "## Stable Prefix: Sparkompass Handoff Protocol",
    "",
    "- Treat ContextEnvelopeV1 as a context layout, not as proof that Codex internals were changed.",
    "- Keep stable_prefix and semi_stable_prefix byte-identical across similar runs when possible.",
    "- Use variable_tail for the current task, changed units, diffs, errors, and fresh decisions.",
    "- Load on_demand_index evidence by unit id or source hash before relying on exact source details.",
    "- Preserve must-survive facts and critical anchors exactly."
  ].join("\n");
}

function buildTaskSegmentText(plan) {
  const requirements = plan.requirements?.enabled
    ? `${plan.requirements.covered}/${plan.requirements.total} found, ${plan.requirements.status}`
    : "not set";
  return [
    "## Variable Tail: Task Profile",
    "",
    `Goal: ${plan.task_profile.goal}`,
    `Risk profile: ${plan.task_profile.risk_profile}`,
    `Done criteria: ${formatList(plan.task_profile.done)}`,
    `Explicit files: ${formatList(plan.task_profile.explicit_files)}`,
    `Must-survive exact facts: ${formatList(plan.task_profile.expect)}`,
    `Must-survive regex facts: ${formatList(plan.task_profile.expectRegex)}`,
    `Requirement coverage: ${requirements}`,
    `Plan gate: ${plan.gate.status}`,
    `Plan schema: ${plan.schema}`,
    `Immediate budget: ${plan.budget.immediate_tokens}/${plan.budget.requested_tokens} estimated tokens`,
    `Optimizer: ${plan.optimizer.strategy}`
  ].join("\n");
}

function buildPrefixReuse(previousEnvelope, current) {
  const base = {
    schema: "ContextEnvelopePrefixReuseV1",
    enabled: Boolean(previousEnvelope),
    status: "not-compared",
    exact_stable_prefix_match: null,
    exact_static_prefix_match: null,
    estimated_reusable_prefix_tokens: 0,
    invalidated_prefix_tokens: current.cacheMetrics.reusable_prefix_tokens,
    reusable_prefix_percent: 0,
    current_stable_prefix_hash: current.assembly.stable_prefix_hash,
    previous_stable_prefix_hash: null,
    current_static_prefix_hash: current.assembly.strict_static_prefix_hash,
    previous_static_prefix_hash: null,
    current_prompt_hash: current.assembly.full_prompt_hash,
    previous_prompt_hash: null,
    caveat: "This estimates byte-identical prefix reuse; it does not prove a billed prompt-cache hit."
  };

  if (!previousEnvelope) return base;
  if (previousEnvelope.schema !== "ContextEnvelopeV1" || !previousEnvelope.assembly) {
    return {
      ...base,
      status: "previous-envelope-invalid",
      invalidated_prefix_tokens: current.cacheMetrics.reusable_prefix_tokens
    };
  }

  const previousStableHash = previousEnvelope.assembly.stable_prefix_hash || "";
  const previousStaticHash = previousEnvelope.assembly.strict_static_prefix_hash || "";
  const previousPromptHash = previousEnvelope.assembly.full_prompt_hash || previousEnvelope.prompt?.hash || "";
  const exactStableMatch = previousStableHash === current.assembly.stable_prefix_hash;
  const exactStaticMatch = previousStaticHash === current.assembly.strict_static_prefix_hash;
  const estimatedReusableTokens = exactStableMatch
    ? current.cacheMetrics.reusable_prefix_tokens
    : exactStaticMatch
      ? current.cacheMetrics.strict_static_prefix_tokens
      : 0;

  return {
    ...base,
    status: exactStableMatch
      ? "full-prefix-reusable"
      : exactStaticMatch
        ? "static-prefix-only-reusable"
        : "prefix-changed",
    exact_stable_prefix_match: exactStableMatch,
    exact_static_prefix_match: exactStaticMatch,
    estimated_reusable_prefix_tokens: estimatedReusableTokens,
    invalidated_prefix_tokens: Math.max(0, current.cacheMetrics.reusable_prefix_tokens - estimatedReusableTokens),
    reusable_prefix_percent: percentage(estimatedReusableTokens, current.cacheMetrics.reusable_prefix_tokens),
    previous_stable_prefix_hash: previousStableHash || null,
    previous_static_prefix_hash: previousStaticHash || null,
    previous_prompt_hash: previousPromptHash || null
  };
}

function buildUnitSegmentText(title, units) {
  const rows = units.map((unit) => [
    `- ${unit.evidence_id} ${unit.type} ${unit.file}:${unit.line} ${unit.name}`,
    `  tokens=${unit.token_cost}`,
    `  delta=${unit.delta_status}`,
    `  priority=${unit.selection_priority}`,
    `  source=${unit.source_hash}`,
    `  load=${unit.load_hint || `sparkompass_load_evidence unitId=${unit.id}`}`,
    `  raw=${unit.source_hash_load_hint || buildSourceHashLoadHint(unit)}`
  ].join("\n"));
  return [
    `## ${title}`,
    "",
    rows.join("\n") || "- none"
  ].join("\n");
}

function buildRequirementSegmentText(plan) {
  if (!plan.requirements?.enabled) {
    return [
      "## On-Demand Requirement Evidence",
      "",
      "- none"
    ].join("\n");
  }

  const rows = plan.requirements.items.flatMap((item) => {
    if (!item.evidence.length) {
      return [`- ${item.label}: ${item.status}`];
    }
    return item.evidence.slice(0, 6).map((evidence) => [
      `- ${item.label}: ${item.status}`,
      `  evidence=${evidence.evidence_id}`,
      `  source=${evidence.file}:${evidence.line}`,
      `  lane=${evidence.lane}`,
      `  hash=${evidence.source_hash}`,
      `  load=${evidence.load_hint}`,
      `  raw=${evidence.source_hash_load_hint || buildSourceHashLoadHint(evidence)}`
    ].join("\n"));
  });

  return [
    "## On-Demand Requirement Evidence",
    "",
    rows.join("\n") || "- none"
  ].join("\n");
}

function buildEnvelopeWarnings(plan, metrics) {
  const warnings = [];
  if (!plan.gate.verified) {
    warnings.push("plan-gate-not-verified");
  }
  if (plan.requirements?.enabled && plan.requirements.missing.length) {
    warnings.push("required-expectation-missing");
  }
  if (!plan.delta.enabled) {
    warnings.push("delta-cache-not-supplied");
  }
  if (metrics.prefixTokens < metrics.minCachePrefixTokens) {
    warnings.push("reusable-prefix-below-cache-threshold-estimate");
  }
  if (metrics.strictPrefixTokens < metrics.minCachePrefixTokens && !plan.lanes.immediate_context.length) {
    warnings.push("static-prefix-too-small-for-cache-estimate");
  }
  if (metrics.prefixReuse?.status === "previous-envelope-invalid") {
    warnings.push("previous-envelope-invalid");
  }
  if (metrics.prefixReuse?.status === "prefix-changed") {
    warnings.push("previous-prefix-not-reusable");
  }
  return warnings;
}

function buildEnvelopeNextActions(plan, warnings, prefixReuse) {
  const actions = [
    "Place send_order segments first and keep their order stable.",
    "Keep stable and semi-stable prefix text unchanged across repeated API/Codex runs when the repository map is unchanged.",
    "Append variable_tail content after the reusable prefix.",
    "Use on_demand_index entries through MCP before relying on exact source lines."
  ];
  if (plan.requirements?.enabled && plan.requirements.status === "requires-evidence-load") {
    actions.push("Load requirement evidence before building a ContextPack for this task.");
  }
  if (warnings.includes("reusable-prefix-below-cache-threshold-estimate")) {
    actions.push("Do not expect a prompt-cache win from this envelope alone; use it for safer context order and combine it with repeated stable prefixes.");
  }
  if (prefixReuse?.enabled && prefixReuse.status === "static-prefix-only-reusable") {
    actions.push("Only the static handoff prefix matched the previous envelope; keep repository-map changes in the variable tail when possible.");
  }
  if (prefixReuse?.enabled && prefixReuse.status === "prefix-changed") {
    actions.push("The stable prefix changed; compare envelope hashes before expecting reuse across turns.");
  }
  if (!plan.gate.verified) {
    actions.push("Resolve the plan gate reasons before treating the envelope as release-ready context.");
  }
  return actions;
}

function isVolatileUnit(unit) {
  return unit.delta_status === "changed" || unit.delta_status === "added";
}

function joinSegmentTexts(segments) {
  return segments.map((segment) => segment.text).join("\n\n");
}

function formatSegmentRow(segment) {
  return `- ${segment.id}: ${segment.lane}, ${segment.role}, ${segment.mutability}, ${formatNumber(segment.estimated_tokens)} Tokens`;
}

function formatPrefixReuse(prefixReuse) {
  if (!prefixReuse?.enabled) return "nicht verglichen";
  const percent = Math.round(prefixReuse.reusable_prefix_percent || 0);
  const width = 24;
  const filled = Math.round((Math.min(100, percent) / 100) * width);
  const empty = Math.max(0, width - filled);
  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${percent}% wiederverwendbar (${formatNumber(prefixReuse.estimated_reusable_prefix_tokens)} von ${formatNumber(prefixReuse.estimated_reusable_prefix_tokens + prefixReuse.invalidated_prefix_tokens)} Prefix-Tokens), ${prefixReuse.status}`;
}

function formatWarnings(warnings = []) {
  if (!warnings.length) return "\n- Hinweise: keine";
  return `\n- Hinweise:\n${warnings.map((warning) => `  - ${warning}`).join("\n")}`;
}

function formatList(values = []) {
  return values.length ? values.join(", ") : "none";
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
