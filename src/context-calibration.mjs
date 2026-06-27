import { buildContextPack } from "./context-pack.mjs";
import { resolveContextPolicy } from "./context-policy.mjs";
import { formatNumber } from "./token-estimator.mjs";

export function calibrateContext(input, options = {}) {
  const label = options.label || "Eingabe";
  const riskProfile = String(options.riskProfile || "balanced");
  const basePolicy = resolveContextPolicy({
    riskProfile,
    targetPercent: Number(options.minTargetPercent) || 10
  });
  const minTargetPercent = Math.max(
    clampPercent(Number(options.minTargetPercent) || 10),
    basePolicy.min_target_percent
  );
  const maxTargetPercent = Math.max(minTargetPercent, clampPercent(Number(options.maxTargetPercent) || 90));
  const stepPercent = clampStep(Number(options.stepPercent) || 5);
  const keep = Array.isArray(options.keep) ? options.keep : [];
  const expect = Array.isArray(options.expect) ? options.expect : [];
  const expectRegex = Array.isArray(options.expectRegex) ? options.expectRegex : [];
  const explicitOraclePresent = getExplicitOracleTerms({ expect, expectRegex }).length > 0;
  const mode = options.mode || "auto";
  const requiredTargetPercents = Array.isArray(options.requiredTargetPercents)
    ? options.requiredTargetPercents
    : [];
  const attempts = [];
  const seenEffectiveTargets = new Set();

  for (const targetPercent of buildTargets(minTargetPercent, maxTargetPercent, stepPercent, requiredTargetPercents)) {
    const pack = buildContextPack(input, {
      label,
      targetPercent,
      riskProfile,
      mode,
      keep,
      expect,
      expectRegex,
      expansionTargets: []
    });
    const effectiveTarget = pack.receipt.context_selection.effective_target_percent;
    if (seenEffectiveTargets.has(effectiveTarget)) continue;
    seenEffectiveTargets.add(effectiveTarget);
    attempts.push(summarizeAttempt(pack));
  }

  const candidate = attempts.find((attempt) => attempt.verified) || null;
  const selected = explicitOraclePresent
    ? attempts.find((attempt) => (
      attempt.verified
        && attempt.acceptance_oracle_success === true
        && attempt.acceptance_oracle_sensitivity_success === true
    )) || null
    : null;
  const status = selected
    ? "verified-calibration"
    : explicitOraclePresent ? "calibration-needs-full-context" : "calibration-needs-oracle";
  const oracleGate = getCalibrationOracleGate({
    candidate,
    selected,
    explicitOraclePresent,
    attempts
  });

  return {
    schema: "ContextCalibrationV1",
    label,
    risk_profile: riskProfile,
    status,
    verified: status === "verified-calibration",
    explicit_oracle_required: true,
    explicit_oracle_present: explicitOraclePresent,
    oracle_gate: oracleGate,
    policy: basePolicy,
    search: {
      min_target_percent: minTargetPercent,
      max_target_percent: maxTargetPercent,
      step_percent: stepPercent
    },
    candidate,
    selected,
    attempts,
    recommendation: selected ? {
      target_percent: selected.effective_target_percent,
      risk_profile: riskProfile,
      command_hint: buildCommandHint(selected.effective_target_percent, riskProfile, expect, expectRegex)
    } : {
      target_percent: null,
      risk_profile: riskProfile,
      command_hint: buildCommandHint(null, riskProfile, expect, expectRegex)
    }
  };
}

export function buildCalibratedContextPack(input, options = {}) {
  const requestedPolicy = resolveContextPolicy({
    riskProfile: String(options.riskProfile || "balanced"),
    targetPercent: Number(options.targetPercent)
  });
  const calibration = calibrateContext(input, {
    label: options.label,
    minTargetPercent: Number(options.autoMinTargetPercent ?? options.minTargetPercent) || requestedPolicy.min_target_percent,
    maxTargetPercent: Number(options.autoMaxTargetPercent ?? options.maxTargetPercent) || 90,
    stepPercent: Number(options.autoStepPercent ?? options.stepPercent) || 5,
    riskProfile: String(options.riskProfile || "balanced"),
    mode: String(options.mode || "auto"),
    keep: Array.isArray(options.keep) ? options.keep : [],
    expect: Array.isArray(options.expect) ? options.expect : [],
    expectRegex: Array.isArray(options.expectRegex) ? options.expectRegex : [],
    requiredTargetPercents: [requestedPolicy.effective_target_percent]
  });
  const autoTargetDecision = resolveAutoTargetDecision(calibration, requestedPolicy, options);
  const pack = buildContextPack(input, {
    ...options,
    targetPercent: autoTargetDecision.target_percent || Number(options.targetPercent) || undefined
  });
  const summary = buildAutoTargetSummary(calibration, requestedPolicy, options, autoTargetDecision);
  pack.autoTarget = summary;
  pack.receipt.context_selection.auto_target = summary;
  return pack;
}

export function formatCalibrationReport(calibration) {
  const rows = calibration.attempts.map((attempt) => (
    `- ${attempt.effective_target_percent}%: ${attempt.verified ? "verified" : "unsicher"}, ${attempt.savings_percent}% gespart, ${formatNumber(attempt.delivered_tokens)} Tokens, ${formatAcceptance(attempt)}, ${attempt.reasons.length ? attempt.reasons.join(", ") : "keine Probleme"}`
  )).join("\n");
  const selected = calibration.selected
    ? `${calibration.selected.effective_target_percent}% (${calibration.selected.savings_percent}% gespart, ${formatNumber(calibration.selected.delivered_tokens)} Tokens)`
    : "keine direkt verifizierte Zielgröße";
  const candidate = calibration.candidate
    ? `${calibration.candidate.effective_target_percent}% (${calibration.candidate.savings_percent}% gespart, ${formatNumber(calibration.candidate.delivered_tokens)} Tokens)`
    : "kein kompakter Kandidat";

  return `
# Context Calibration v1

Quelle: ${calibration.label}
Risikoprofil: ${calibration.risk_profile}
Suche: ${calibration.search.min_target_percent}% bis ${calibration.search.max_target_percent}% in ${calibration.search.step_percent}%-Schritten

- Ergebnis: ${calibration.status || (calibration.verified ? "verified-calibration" : "calibration-needs-full-context")}
- Oracle-Gate: ${calibration.oracle_gate || "unknown"}
- Empfohlene Zielgröße: ${selected}
- Kompakter Diagnose-Kandidat: ${candidate}
- Befehl: ${calibration.recommendation.command_hint}

## Versuche

${rows || "- keine"}
`.trim();
}

function summarizeAttempt(pack) {
  const receipt = pack.receipt;
  const selection = receipt.context_selection;
  const reasons = receipt.fallback.reasons || [];
  const candidateAttempt = selection.attempts.find((attempt) => attempt.target_percent === selection.effective_target_percent)
    || selection.attempts.at(-1)
    || {};
  const verified = receipt.gate.status === "verified-publishable" && pack.context.mode === "compact-context";

  return {
    target_percent: selection.requested_target_percent,
    effective_target_percent: selection.effective_target_percent,
    verified,
    mode: pack.context.mode,
    gate_status: receipt.gate.status,
    reasons,
    savings_percent: receipt.ersparnis_prozent,
    delivered_tokens: receipt.delivered_tokens,
    critical_anchor_retention_percent: receipt.critical_anchors.retention_percent,
    source_evidence_coverage_percent: Math.round(receipt.source_evidence.coverage * 100),
    quality_status: receipt.quality.status,
    acceptance_oracle_success: candidateAttempt.acceptance_oracle_success ?? null,
    acceptance_oracle_missing: candidateAttempt.acceptance_oracle_missing || [],
    acceptance_oracle_sensitivity_success: candidateAttempt.acceptance_oracle_sensitivity_success ?? null,
    acceptance_oracle_sensitivity_missed: candidateAttempt.acceptance_oracle_sensitivity_missed || []
  };
}

function buildAutoTargetSummary(calibration, requestedPolicy, options = {}, decision = null) {
  const autoTargetDecision = decision || resolveAutoTargetDecision(calibration, requestedPolicy, options);
  const {
    baseline,
    candidate,
    selected,
    explicitOraclePresent,
    candidateOracleVerified,
    candidateOracleSensitive,
    candidateNotMoreTokensThanBaseline,
    status,
    oracleGate
  } = autoTargetDecision;
  const additionalSavedTokens = selected && baseline
    ? Math.max(0, baseline.delivered_tokens - selected.delivered_tokens)
    : null;
  const additionalSavingsPercent = selected && baseline && baseline.delivered_tokens > 0
    ? Math.round((additionalSavedTokens / baseline.delivered_tokens) * 100)
    : null;
  const selectedNotMoreTokensThanBaseline = selected && baseline
    ? selected.delivered_tokens <= baseline.delivered_tokens
    : null;
  const savingsGate = getAutoTargetSavingsGate({
    baseline,
    candidate,
    status,
    explicitOraclePresent,
    candidateOracleVerified,
    candidateOracleSensitive,
    candidateNotMoreTokensThanBaseline,
    selectedNotMoreTokensThanBaseline,
    additionalSavedTokens
  });
  const candidateAdditionalSavedTokens = candidate && baseline
    ? Math.max(0, baseline.delivered_tokens - candidate.delivered_tokens)
    : null;
  const candidateAdditionalSavingsPercent = candidate && baseline && baseline.delivered_tokens > 0
    ? Math.round((candidateAdditionalSavedTokens / baseline.delivered_tokens) * 100)
    : null;

  return {
    schema: "ContextAutoTargetV1",
    enabled: true,
    status,
    explicit_oracle_required: true,
    explicit_oracle_present: explicitOraclePresent,
    oracle_gate: oracleGate,
    baseline_target_percent: requestedPolicy.effective_target_percent,
    baseline_gate_status: baseline?.gate_status || null,
    baseline_delivered_tokens: baseline?.delivered_tokens || null,
    candidate_target_percent: candidate?.effective_target_percent || null,
    candidate_gate_status: candidate?.gate_status || null,
    candidate_savings_percent: candidate?.savings_percent || null,
    candidate_delivered_tokens: candidate?.delivered_tokens || null,
    candidate_acceptance_oracle_success: candidate?.acceptance_oracle_success ?? null,
    candidate_acceptance_oracle_sensitivity_success: candidate?.acceptance_oracle_sensitivity_success ?? null,
    candidate_acceptance_oracle_sensitivity_missed: candidate?.acceptance_oracle_sensitivity_missed || [],
    candidate_not_more_tokens_than_baseline: candidateNotMoreTokensThanBaseline,
    candidate_additional_saved_tokens_vs_baseline: candidateAdditionalSavedTokens,
    candidate_additional_savings_percent_vs_baseline: candidateAdditionalSavingsPercent,
    selected_target_percent: selected?.effective_target_percent || null,
    selected_gate_status: selected?.gate_status || null,
    selected_savings_percent: selected?.savings_percent || null,
    selected_delivered_tokens: selected?.delivered_tokens || null,
    selected_acceptance_oracle_success: selected?.acceptance_oracle_success ?? null,
    selected_acceptance_oracle_sensitivity_success: selected?.acceptance_oracle_sensitivity_success ?? null,
    selected_not_more_tokens_than_baseline: selectedNotMoreTokensThanBaseline,
    savings_gate: savingsGate,
    additional_saved_tokens_vs_baseline: additionalSavedTokens,
    additional_savings_percent_vs_baseline: additionalSavingsPercent,
    quality_contract: {
      explicit_acceptance_oracle_required: true,
      explicit_acceptance_oracle_present: explicitOraclePresent,
      critical_anchor_retention_percent: 100,
      source_evidence_coverage_percent: 100,
      risky_compressions: 0,
      selected_not_more_tokens_than_baseline: true,
      acceptance_oracle_success: explicitOraclePresent ? candidateOracleVerified : null,
      acceptance_oracle_sensitivity: explicitOraclePresent ? candidateOracleSensitive : null
    },
    search: calibration.search,
    attempts: calibration.attempts.map((attempt) => ({
      effective_target_percent: attempt.effective_target_percent,
      verified: attempt.verified,
      mode: attempt.mode,
      gate_status: attempt.gate_status,
      reasons: attempt.reasons,
      delivered_tokens: attempt.delivered_tokens,
      savings_percent: attempt.savings_percent,
      critical_anchor_retention_percent: attempt.critical_anchor_retention_percent,
      source_evidence_coverage_percent: attempt.source_evidence_coverage_percent,
      acceptance_oracle_success: attempt.acceptance_oracle_success,
      acceptance_oracle_missing: attempt.acceptance_oracle_missing,
      acceptance_oracle_sensitivity_success: attempt.acceptance_oracle_sensitivity_success,
      acceptance_oracle_sensitivity_missed: attempt.acceptance_oracle_sensitivity_missed
    }))
  };
}

function resolveAutoTargetDecision(calibration, requestedPolicy, options = {}) {
  const explicitOraclePresent = getExplicitOracleTerms(options).length > 0;
  const baseline = calibration.attempts.find((attempt) => (
    attempt.effective_target_percent === requestedPolicy.effective_target_percent
  )) || null;
  const candidate = calibration.candidate || calibration.selected || null;
  const candidateNotMoreTokensThanBaseline = candidate && baseline
    ? candidate.delivered_tokens <= baseline.delivered_tokens
    : null;
  const candidateOracleVerified = candidate?.acceptance_oracle_success === true;
  const candidateOracleSensitive = candidate?.acceptance_oracle_sensitivity_success === true;
  const canUseCandidate = Boolean(
    candidate
      && baseline
      && candidateNotMoreTokensThanBaseline
      && explicitOraclePresent
      && candidateOracleVerified
      && candidateOracleSensitive
  );
  const selected = canUseCandidate ? candidate : baseline;
  const status = getAutoTargetStatus({
    baseline,
    candidate,
    candidateNotMoreTokensThanBaseline,
    candidateOracleVerified,
    candidateOracleSensitive,
    explicitOraclePresent
  });
  const oracleGate = getAutoTargetOracleGate({
    candidate,
    candidateOracleVerified,
    candidateOracleSensitive,
    explicitOraclePresent
  });

  return {
    baseline,
    candidate,
    selected,
    explicitOraclePresent,
    candidateOracleVerified,
    candidateOracleSensitive,
    candidateNotMoreTokensThanBaseline,
    canUseCandidate,
    status,
    oracleGate,
    target_percent: selected?.effective_target_percent || requestedPolicy.effective_target_percent
  };
}

function getAutoTargetStatus({
  baseline,
  candidate,
  candidateNotMoreTokensThanBaseline,
  candidateOracleVerified,
  candidateOracleSensitive,
  explicitOraclePresent
}) {
  if (!explicitOraclePresent) return "auto-target-needs-oracle";
  if (!candidate || !baseline) return "auto-target-needs-review";
  if (!candidateNotMoreTokensThanBaseline) return "auto-target-needs-review";
  if (!candidateOracleVerified) return "auto-target-needs-review";
  if (!candidateOracleSensitive) return "auto-target-needs-review";
  return "verified-auto-target";
}

function getAutoTargetOracleGate({ candidate, candidateOracleVerified, candidateOracleSensitive, explicitOraclePresent }) {
  if (!explicitOraclePresent) return "oracle-required";
  if (!candidate) return "no-verified-target";
  if (!candidateOracleVerified) return "oracle-not-verified";
  if (!candidateOracleSensitive) return "oracle-insensitive";
  return "verified-oracle";
}

function getAutoTargetSavingsGate({
  baseline,
  candidate,
  status,
  explicitOraclePresent,
  candidateOracleVerified,
  candidateOracleSensitive,
  candidateNotMoreTokensThanBaseline,
  selectedNotMoreTokensThanBaseline,
  additionalSavedTokens
}) {
  if (!explicitOraclePresent) return "oracle-required";
  if (!candidate) return "no-verified-target";
  if (!baseline) return "baseline-missing";
  if (!candidateNotMoreTokensThanBaseline || !selectedNotMoreTokensThanBaseline) return "auto-target-regression";
  if (!candidateOracleVerified) return "oracle-not-verified";
  if (!candidateOracleSensitive) return "oracle-insensitive";
  if (status !== "verified-auto-target") return "auto-target-needs-review";
  if (additionalSavedTokens > 0) return "verified-additional-saving";
  return "verified-no-additional-saving";
}

function getCalibrationOracleGate({ candidate, selected, explicitOraclePresent, attempts = [] }) {
  if (!explicitOraclePresent) return "oracle-required";
  if (!candidate) {
    if (attempts.some((attempt) => attempt.reasons.includes("source-acceptance-oracle-insensitive")
      || attempt.reasons.includes("acceptance-oracle-insensitive"))) {
      return "oracle-insensitive";
    }
    if (attempts.some((attempt) => attempt.reasons.includes("source-acceptance-oracle-failed")
      || attempt.reasons.includes("acceptance-oracle-miss"))) {
      return "oracle-not-verified";
    }
    return "no-verified-target";
  }
  if (selected?.acceptance_oracle_success === true && selected?.acceptance_oracle_sensitivity_success === true) {
    return "verified-oracle";
  }
  if (candidate.acceptance_oracle_success !== true) return "oracle-not-verified";
  if (candidate.acceptance_oracle_sensitivity_success !== true) return "oracle-insensitive";
  return "oracle-not-verified";
}

function getExplicitOracleTerms(options = {}) {
  return [
    ...(Array.isArray(options.expect) ? options.expect : []),
    ...(Array.isArray(options.expectRegex) ? options.expectRegex : [])
  ].filter((term) => String(term || "").length > 0);
}

function buildCommandHint(targetPercent, riskProfile, expect, expectRegex) {
  const parts = ["sparkompass pack"];
  if (targetPercent) parts.push("--target", String(targetPercent));
  parts.push("--risk-profile", riskProfile);
  for (const term of expect) {
    parts.push("--expect", quoteShell(term));
  }
  for (const pattern of expectRegex) {
    parts.push("--expect-regex", quoteShell(pattern));
  }
  return parts.join(" ");
}

function formatAcceptance(attempt) {
  if (attempt.acceptance_oracle_success === null) return "Oracle: nicht gesetzt";
  if (attempt.acceptance_oracle_success && attempt.acceptance_oracle_sensitivity_success === false) {
    return `Oracle: bestanden, aber nicht sensitiv (${attempt.acceptance_oracle_sensitivity_missed.join(", ")})`;
  }
  if (attempt.acceptance_oracle_success) return "Oracle: bestanden und sensitiv";
  return `Oracle: fehlt ${attempt.acceptance_oracle_missing.join(", ")}`;
}

function quoteShell(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

function buildTargets(minTargetPercent, maxTargetPercent, stepPercent, requiredTargetPercents = []) {
  const targets = [];
  for (let target = minTargetPercent; target <= maxTargetPercent; target += stepPercent) {
    targets.push(target);
  }
  if (!targets.includes(maxTargetPercent)) targets.push(maxTargetPercent);
  for (const target of requiredTargetPercents) {
    targets.push(clampPercent(Number(target) || 0));
  }
  return [...new Set(targets)].sort((left, right) => left - right);
}

function clampPercent(value) {
  return Math.min(90, Math.max(10, Math.round(value)));
}

function clampStep(value) {
  return Math.min(25, Math.max(1, Math.round(value)));
}
