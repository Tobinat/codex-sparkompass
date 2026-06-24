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
  const mode = options.mode || "auto";
  const attempts = [];
  const seenEffectiveTargets = new Set();

  for (const targetPercent of buildTargets(minTargetPercent, maxTargetPercent, stepPercent)) {
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

  const selected = attempts.find((attempt) => attempt.verified) || null;

  return {
    schema: "ContextCalibrationV1",
    label,
    risk_profile: riskProfile,
    policy: basePolicy,
    search: {
      min_target_percent: minTargetPercent,
      max_target_percent: maxTargetPercent,
      step_percent: stepPercent
    },
    selected,
    verified: Boolean(selected),
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

export function formatCalibrationReport(calibration) {
  const rows = calibration.attempts.map((attempt) => (
    `- ${attempt.effective_target_percent}%: ${attempt.verified ? "verified" : "unsicher"}, ${attempt.savings_percent}% gespart, ${formatNumber(attempt.delivered_tokens)} Tokens, ${formatAcceptance(attempt)}, ${attempt.reasons.length ? attempt.reasons.join(", ") : "keine Probleme"}`
  )).join("\n");
  const selected = calibration.selected
    ? `${calibration.selected.effective_target_percent}% (${calibration.selected.savings_percent}% gespart, ${formatNumber(calibration.selected.delivered_tokens)} Tokens)`
    : "keine direkt verifizierte Zielgröße";

  return `
# Context Calibration v1

Quelle: ${calibration.label}
Risikoprofil: ${calibration.risk_profile}
Suche: ${calibration.search.min_target_percent}% bis ${calibration.search.max_target_percent}% in ${calibration.search.step_percent}%-Schritten

- Ergebnis: ${calibration.verified ? "verified-calibration" : "calibration-needs-full-context"}
- Empfohlene Zielgröße: ${selected}
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
    acceptance_oracle_missing: candidateAttempt.acceptance_oracle_missing || []
  };
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
  if (attempt.acceptance_oracle_success) return "Oracle: bestanden";
  return `Oracle: fehlt ${attempt.acceptance_oracle_missing.join(", ")}`;
}

function quoteShell(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

function buildTargets(minTargetPercent, maxTargetPercent, stepPercent) {
  const targets = [];
  for (let target = minTargetPercent; target <= maxTargetPercent; target += stepPercent) {
    targets.push(target);
  }
  if (!targets.includes(maxTargetPercent)) targets.push(maxTargetPercent);
  return [...new Set(targets)].sort((left, right) => left - right);
}

function clampPercent(value) {
  return Math.min(90, Math.max(10, Math.round(value)));
}

function clampStep(value) {
  return Math.min(25, Math.max(1, Math.round(value)));
}
