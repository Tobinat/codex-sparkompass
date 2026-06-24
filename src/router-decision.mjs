import { formatNumber } from "./token-estimator.mjs";
import { getToolProfile } from "./tool-profiles.mjs";

const DEFAULT_MIN_NET_GAIN_TOKENS = 1;
const QUALITY_REGRESSION_FLOOR = -2;

export function buildSparkompassRouterDecision(input = {}, options = {}) {
  const experiment = input.experiment || input;
  const overhead = input.overhead || null;
  const minNetGainTokens = Number(options.minNetGainTokens ?? DEFAULT_MIN_NET_GAIN_TOKENS);
  const requireQualityEvidence = options.requireQualityEvidence !== false;
  const analysis = analyzeExperiment(experiment, {
    minNetGainTokens,
    requireQualityEvidence
  });
  const profile = chooseProfile(analysis.mode, overhead);

  return {
    schema: "SparkompassRouterDecisionV1",
    created_at: new Date().toISOString(),
    mode: analysis.mode,
    reason: analysis.decisionReasons[0] || "",
    recommended_tool_profile: profile.name,
    profile,
    expected_net_gain_tokens: analysis.netGainTokens,
    expected_net_gain_percent: analysis.netGainPercent,
    evidence_stage: analysis.evidenceStage,
    quality: analysis.quality,
    efficiency: analysis.efficiency,
    usage: analysis.usage,
    safety_blockers: analysis.safetyBlockers,
    evidence_gaps: analysis.evidenceGaps,
    decision_reasons: analysis.decisionReasons,
    gate: {
      status: analysis.gateStatus,
      verified: analysis.verified,
      reasons: analysis.gateReasons
    },
    caveats: [
      "Routerentscheidungen sind lokale Steuerungsentscheidungen, keine offizielle Abrechnung.",
      "Modus compact sollte erst nach quality-noninferior Evidence fuer echte Aufgaben als Release-Beweis gelten.",
      "Offizielle Tokenwerte muessen aus Codex-JSONL-Usage-Events oder Workspace-Abrechnung stammen."
    ]
  };
}

export function formatSparkompassRouterDecision(decision) {
  const blockers = decision.safety_blockers.length
    ? decision.safety_blockers.map((item) => `- ${item}`).join("\n")
    : "- keine";
  const gaps = decision.evidence_gaps.length
    ? decision.evidence_gaps.map((item) => `- ${item}`).join("\n")
    : "- keine";
  const reasons = decision.decision_reasons.length
    ? decision.decision_reasons.map((item) => `- ${item}`).join("\n")
    : "- keine";

  return `
# SparkompassRouterDecisionV1

Gate: ${decision.gate.status}
Modus: ${decision.mode}
Tool-Profil: ${decision.recommended_tool_profile}

## Entscheidung

${reasons}

## Messwerte

- Evidence-Stage: ${decision.evidence_stage}
- Erwarteter Netto-Gewinn: ${formatSigned(decision.expected_net_gain_tokens)} Tokens (${formatSigned(decision.expected_net_gain_percent)}%)
- Task-Erfolgsdelta: ${formatSigned(decision.quality.task_success_delta_points)} Prozentpunkte
- Verifizierte Task-Effizienz: ${decision.efficiency.status}, ${formatMaybeNumber(decision.efficiency.optimized_tokens_per_verified_task)} Tokens/verifiziertem Task
- Basis raw: ${formatMaybeNumber(decision.usage.basis_raw_total_tokens)} Tokens
- Plugin kompakt: ${formatMaybeNumber(decision.usage.plugin_kompakt_total_tokens)} Tokens

## Sicherheitsblocker

${blockers}

## Evidence-Luecken

${gaps}

Hinweis: ${decision.caveats.join(" ")}
`.trim();
}

function analyzeExperiment(experiment, options = {}) {
  if (!experiment || experiment.schema !== "SparkompassExperimentRunV1") {
    return baseAnalysis({
      mode: "lazy",
      gateStatus: "router-needs-evidence",
      verified: true,
      evidenceStage: "missing-experiment",
      evidenceGaps: ["missing-experiment-run"],
      decisionReasons: ["Kein SparkompassExperimentRunV1 vorhanden; zuerst Evidence gezielt nachladen oder messen."]
    });
  }

  const gateReasons = Array.isArray(experiment.gate?.reasons) ? experiment.gate.reasons : [];
  const safetyBlockers = gateReasons.filter((reason) => reason.startsWith("quality-regression") || reason.startsWith("task-efficiency-regression"));
  const evidenceGaps = buildEvidenceGaps(experiment, gateReasons, options);
  const effects = experiment.effects || {};
  const efficiency = experiment.efficiency || {};
  const netGainTokens = numberOrNull(effects.net_product_gain_tokens);
  const netGainPercent = numberOrNull(effects.net_product_gain_percent);
  const taskDelta = numberOrNull(experiment.gate?.task_success_delta_points);
  const qualityStatus = safetyBlockers.length
    ? "regression"
    : taskDelta === null
      ? "unmeasured"
      : taskDelta >= QUALITY_REGRESSION_FLOOR
        ? "noninferior"
        : "regression";
  if (qualityStatus === "regression" && safetyBlockers.length === 0) {
    safetyBlockers.push(`quality-regression:${taskDelta}`);
  }

  const usage = {
    basis_raw_total_tokens: numberOrNull(effects.basis_raw_median_total_tokens),
    basis_kompakt_total_tokens: numberOrNull(effects.basis_kompakt_median_total_tokens),
    plugin_raw_total_tokens: numberOrNull(effects.plugin_raw_median_total_tokens),
    plugin_kompakt_total_tokens: numberOrNull(effects.plugin_kompakt_median_total_tokens),
    pure_compression_gain_tokens: numberOrNull(effects.pure_compression_gain_tokens),
    plugin_overhead_tokens: numberOrNull(effects.plugin_overhead_tokens),
    net_product_gain_tokens: netGainTokens,
    integration_effect_tokens: numberOrNull(effects.integration_effect_tokens)
  };

  if (safetyBlockers.length) {
    const blockerReason = safetyBlockers.some((reason) => reason.startsWith("task-efficiency-regression"))
      ? "Verifizierte Task-Effizienz regressiert; voller Kontext ist die sichere Route."
      : "Qualitaetsregression erkannt; voller Kontext ist die sichere Route.";
    return baseAnalysis({
      mode: "full",
      gateStatus: "verified-router-decision",
      verified: true,
      evidenceStage: experiment.gate?.status || "unknown",
      safetyBlockers,
      evidenceGaps,
      netGainTokens,
      netGainPercent,
      usage,
      efficiency: buildEfficiency(efficiency),
      quality: buildQuality(qualityStatus, taskDelta),
      decisionReasons: [blockerReason]
    });
  }

  const hardMeasurementGaps = evidenceGaps.filter((gap) => ![
    "missing-quality-noninferior-evidence",
    "missing-verified-task-efficiency"
  ].includes(gap));
  if (netGainTokens !== null && netGainTokens < options.minNetGainTokens && hardMeasurementGaps.length === 0) {
    return baseAnalysis({
      mode: "bypass",
      gateStatus: "verified-router-decision",
      verified: true,
      evidenceStage: experiment.gate?.status || "unknown",
      evidenceGaps,
      netGainTokens,
      netGainPercent,
      usage,
      efficiency: buildEfficiency(efficiency),
      quality: buildQuality(qualityStatus, taskDelta),
      decisionReasons: ["Kompakter Plugin-Lauf ist netto nicht guenstiger als die Raw-Basis."]
    });
  }

  if (evidenceGaps.length || netGainTokens === null) {
    return baseAnalysis({
      mode: "lazy",
      gateStatus: "verified-router-decision",
      verified: true,
      evidenceStage: experiment.gate?.status || "unknown",
      safetyBlockers,
      evidenceGaps,
      netGainTokens,
      netGainPercent,
      usage,
      efficiency: buildEfficiency(efficiency),
      quality: buildQuality(qualityStatus, taskDelta),
      decisionReasons: ["Evidence ist noch nicht stark genug fuer compact; nutze On-Demand/Lazy-Kontext und miss weiter."]
    });
  }

  return baseAnalysis({
    mode: "compact",
    gateStatus: "verified-router-decision",
    verified: true,
    evidenceStage: experiment.gate?.status || "unknown",
    netGainTokens,
    netGainPercent,
    usage,
    efficiency: buildEfficiency(efficiency),
    quality: buildQuality(qualityStatus, taskDelta),
    decisionReasons: ["Quality-noninferior Evidence und verifizierte Task-Effizienz liegen vor; die kompakte Plugin-Variante spart netto Tokens."]
  });
}

function buildEvidenceGaps(experiment, gateReasons, options = {}) {
  const gaps = [];
  if (!experiment.summary?.runs) gaps.push("no-runs");
  if (experiment.summary?.verified_runs !== experiment.summary?.runs) gaps.push("unverified-official-usage");
  if (experiment.summary?.usage_invariant_verified_runs !== experiment.summary?.runs) gaps.push("usage-invariant-failures");
  if (gateReasons.some((reason) => reason.startsWith("metadata-incomplete"))) gaps.push("metadata-incomplete");
  if (gateReasons.some((reason) => reason.startsWith("missing-variants"))) gaps.push("missing-four-arm-matrix");
  if (gateReasons.some((reason) => reason.startsWith("repeat-under-target"))) gaps.push("repeat-under-target");
  if (options.requireQualityEvidence && experiment.gate?.status !== "quality-noninferior") {
    gaps.push("missing-quality-noninferior-evidence");
  }
  if (options.requireQualityEvidence && experiment.efficiency?.status !== "verified-task-efficiency") {
    gaps.push(experiment.efficiency?.status === "task-efficiency-regression"
      ? "verified-task-efficiency-regression"
      : "missing-verified-task-efficiency");
  }
  return unique(gaps);
}

function chooseProfile(mode, overhead) {
  const preferred = {
    bypass: "minimal",
    compact: "standard",
    lazy: "minimal",
    full: "debug"
  }[mode] || "debug";
  const profile = findProfile(overhead, preferred);
  if (profile) {
    return {
      name: profile.name,
      tool_count: profile.tool_count,
      estimated_catalog_tokens: profile.estimated_tokens,
      estimated_catalog_savings_tokens: profile.saved_tokens_vs_full,
      estimated_catalog_savings_percent: profile.saved_percent_vs_full
    };
  }
  const definition = getToolProfile(preferred);
  return {
    name: definition.name,
    tool_count: null,
    estimated_catalog_tokens: null,
    estimated_catalog_savings_tokens: null,
    estimated_catalog_savings_percent: null
  };
}

function findProfile(overhead, profileName) {
  return Array.isArray(overhead?.profiles)
    ? overhead.profiles.find((profile) => profile.name === profileName)
    : null;
}

function buildQuality(status, taskDelta) {
  return {
    status,
    task_success_delta_points: taskDelta,
    noninferior_floor_points: QUALITY_REGRESSION_FLOOR
  };
}

function buildEfficiency(efficiency = {}) {
  return {
    status: efficiency.status || "unknown",
    verified: Boolean(efficiency.verified),
    baseline_tokens_per_verified_task: numberOrNull(efficiency.baseline_tokens_per_verified_task),
    optimized_tokens_per_verified_task: numberOrNull(efficiency.optimized_tokens_per_verified_task),
    tokens_per_verified_task_saved: numberOrNull(efficiency.tokens_per_verified_task_saved),
    tokens_per_verified_task_saved_percent: numberOrNull(efficiency.tokens_per_verified_task_saved_percent),
    verified_successful_tasks_per_1000_token_gain: numberOrNull(efficiency.verified_successful_tasks_per_1000_token_gain)
  };
}

function baseAnalysis(overrides = {}) {
  return {
    mode: overrides.mode || "lazy",
    gateStatus: overrides.gateStatus || "verified-router-decision",
    verified: overrides.verified ?? true,
    gateReasons: overrides.gateReasons || [],
    safetyBlockers: overrides.safetyBlockers || [],
    evidenceGaps: overrides.evidenceGaps || [],
    decisionReasons: overrides.decisionReasons || [],
    evidenceStage: overrides.evidenceStage || "unknown",
    netGainTokens: overrides.netGainTokens ?? null,
    netGainPercent: overrides.netGainPercent ?? null,
    quality: overrides.quality || buildQuality("unmeasured", null),
    efficiency: overrides.efficiency || buildEfficiency(),
    usage: overrides.usage || {
      basis_raw_total_tokens: null,
      basis_kompakt_total_tokens: null,
      plugin_raw_total_tokens: null,
      plugin_kompakt_total_tokens: null,
      pure_compression_gain_tokens: null,
      plugin_overhead_tokens: null,
      net_product_gain_tokens: null,
      integration_effect_tokens: null
    }
  };
}

function formatSigned(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "n/a";
  const number = Number(value);
  return number > 0 ? `+${formatNumber(number)}` : formatNumber(number);
}

function formatMaybeNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? "n/a"
    : formatNumber(value);
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function unique(items) {
  return Array.from(new Set(items));
}
