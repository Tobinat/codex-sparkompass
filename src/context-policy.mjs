const PROFILES = {
  compact: {
    risk_profile: "compact",
    default_target_percent: 25,
    min_target_percent: 10,
    expansion_targets: [40, 55, 70, 90],
    default_start_budget_tokens: 600,
    min_start_budget_tokens: 300,
    risk_unit_policy: "allow-deferred-risk-units",
    deferred_risk_units_require_review: false,
    description: "Prefer maximum savings, still verified before release."
  },
  balanced: {
    risk_profile: "balanced",
    default_target_percent: 35,
    min_target_percent: 10,
    expansion_targets: [50, 65, 70, 90],
    default_start_budget_tokens: 800,
    min_start_budget_tokens: 400,
    risk_unit_policy: "allow-deferred-risk-units-with-evidence",
    deferred_risk_units_require_review: false,
    description: "Default balance between savings and context completeness."
  },
  careful: {
    risk_profile: "careful",
    default_target_percent: 50,
    min_target_percent: 35,
    expansion_targets: [65, 80, 90],
    default_start_budget_tokens: 1200,
    min_start_budget_tokens: 800,
    risk_unit_policy: "review-deferred-risk-units",
    deferred_risk_units_require_review: true,
    description: "Start with more context for code, logs, configuration, and ambiguous tasks."
  },
  strict: {
    risk_profile: "strict",
    default_target_percent: 70,
    min_target_percent: 50,
    expansion_targets: [80, 90],
    default_start_budget_tokens: 1600,
    min_start_budget_tokens: 1200,
    risk_unit_policy: "block-deferred-risk-units",
    deferred_risk_units_require_review: true,
    description: "Conservative profile for high-risk or safety-sensitive context."
  }
};

export function resolveContextPolicy(options = {}) {
  const requestedProfile = normalizeProfileName(options.riskProfile || options.risk || "balanced");
  const profile = PROFILES[requestedProfile] || PROFILES.balanced;
  const rawTarget = Number(options.targetPercent);
  const userTargetPercent = Number.isFinite(rawTarget) && rawTarget > 0
    ? clampPercent(rawTarget)
    : null;
  const effectiveTargetPercent = clampPercent(Math.max(
    userTargetPercent ?? profile.default_target_percent,
    profile.min_target_percent
  ));
  const expansionTargets = buildExpansionTargets(effectiveTargetPercent, profile, options.expansionTargets);

  return {
    schema: "ContextPolicyV1",
    requested_risk_profile: requestedProfile,
    risk_profile: profile.risk_profile,
    unknown_risk_profile: requestedProfile !== profile.risk_profile,
    description: profile.description,
    user_target_percent: userTargetPercent,
    effective_target_percent: effectiveTargetPercent,
    min_target_percent: profile.min_target_percent,
    expansion_targets: expansionTargets,
    default_start_budget_tokens: profile.default_start_budget_tokens,
    min_start_budget_tokens: profile.min_start_budget_tokens,
    risk_unit_policy: profile.risk_unit_policy,
    deferred_risk_units_require_review: profile.deferred_risk_units_require_review
  };
}

function buildExpansionTargets(effectiveTargetPercent, profile, overrideTargets) {
  const configuredTargets = Array.isArray(overrideTargets)
    ? overrideTargets
    : profile.expansion_targets;

  const targets = configuredTargets
    .map((target) => clampPercent(Number(target) || 0))
    .filter((target) => target >= effectiveTargetPercent);

  return [...new Set(targets)].sort((left, right) => left - right);
}

function normalizeProfileName(value) {
  const normalized = String(value || "balanced").trim().toLowerCase();
  if (normalized === "safe" || normalized === "high") return "careful";
  if (normalized === "safety" || normalized === "critical") return "strict";
  if (normalized === "normal" || normalized === "standard") return "balanced";
  return normalized;
}

function clampPercent(value) {
  return Math.min(90, Math.max(10, Math.round(value)));
}
