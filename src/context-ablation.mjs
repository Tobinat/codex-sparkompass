import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAcceptanceOracle, buildCounterfactualChecks, evaluateAcceptanceOracle } from "./acceptance-oracle.mjs";
import { buildContextPlan } from "./context-plan.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildContextAblationAudit(rootPath, options = {}) {
  const plan = await buildContextPlan(rootPath, options);
  return buildContextAblationAuditFromPlan(plan, options);
}

export async function buildContextAblationAuditFromPlan(plan, options = {}) {
  const maxUnits = clampInteger(options.maxUnits, 80, 1, 500);
  const expectations = buildExpectationSpecs(plan.task_profile || options);
  const oracle = buildAcceptanceOracle(expectations);
  const sourceUnits = (plan.lanes?.immediate_context || []).slice(0, maxUnits);
  const allImmediateUnits = plan.lanes?.immediate_context || [];
  const segments = [];

  for (const unit of sourceUnits) {
    segments.push(await loadSegment(plan.root, unit));
  }

  const validSegments = segments.filter((segment) => segment.source_verified);
  const baseText = buildSurfaceText(validSegments);
  const baseline = evaluateAcceptanceOracle(baseText, oracle);
  const counterfactuals = buildCounterfactualChecks(baseText, oracle);
  const detectedCounterfactuals = counterfactuals.filter((item) => item.detected);
  const ablations = validSegments.map((segment) => buildSegmentAblation(validSegments, segment, oracle));
  const sourceFailures = segments.filter((segment) => !segment.source_verified);
  const criticalUnits = ablations.filter((item) => item.status === "oracle-critical");
  const redundantUnits = ablations.filter((item) => item.status === "ablation-safe-candidate");
  const warnings = [];

  if (allImmediateUnits.length > sourceUnits.length) warnings.push("ablation-audit-truncated");
  if (!oracle.expectations.length) warnings.push("ablation-audit-needs-oracle");
  if (plan.gate?.status !== "verified-plan") warnings.push(`plan-${plan.gate?.status || "unknown"}`);
  if (oracle.expectations.length && !baseline.success) warnings.push("baseline-oracle-failed");
  if (counterfactuals.length && detectedCounterfactuals.length !== counterfactuals.length) warnings.push("oracle-insensitive");
  if (sourceFailures.length) warnings.push("source-segment-load-failed");
  if (oracle.expectations.length && baseline.success && !criticalUnits.length) warnings.push("no-oracle-critical-unit-found");

  const verified = oracle.expectations.length > 0
    && plan.gate?.verified
    && baseline.success
    && sourceFailures.length === 0
    && counterfactuals.length > 0
    && detectedCounterfactuals.length === counterfactuals.length;

  return {
    schema: "ContextAblationAuditV1",
    audit_id: `ablation-audit-${sha256([
      plan.root,
      plan.gate?.status || "",
      oracle.expectations.map((item) => item.id).join(","),
      ablations.map((item) => `${item.evidence_id}:${item.status}`).join("|")
    ].join("|")).slice(0, 12)}`,
    root: plan.root,
    generated_at: new Date().toISOString(),
    source_plan: {
      schema: plan.schema,
      generated_at: plan.generated_at,
      gate: plan.gate.status,
      immediate_units: allImmediateUnits.length,
      immediate_tokens: plan.budget.immediate_tokens,
      requested_tokens: plan.budget.requested_tokens,
      decision_trace: plan.decision_trace?.status || "unknown"
    },
    oracle: {
      schema: oracle.schema,
      expectations: oracle.expectations,
      baseline_success: baseline.success,
      baseline_missing: baseline.missing,
      counterfactuals: counterfactuals.length,
      counterfactuals_detected: detectedCounterfactuals.length
    },
    gate: {
      status: verified ? "verified-ablation-audit" : "ablation-audit-needs-review",
      verified,
      reasons: buildReasons({
        oracle,
        plan,
        baseline,
        sourceFailures,
        counterfactuals,
        detectedCounterfactuals
      }),
      warnings
    },
    totals: {
      immediate_units: allImmediateUnits.length,
      checked_units: segments.length,
      source_verified_units: validSegments.length,
      source_failed_units: sourceFailures.length,
      oracle_expectations: oracle.expectations.length,
      oracle_critical_units: criticalUnits.length,
      ablation_safe_candidates: redundantUnits.length,
      ablation_safe_tokens: redundantUnits.reduce((sum, item) => sum + item.token_cost, 0),
      coverage_percent: allImmediateUnits.length ? Math.round((segments.length / allImmediateUnits.length) * 100) : 100
    },
    baseline,
    ablations,
    source_failures: sourceFailures,
    next_actions: buildNextActions({
      verified,
      oracle,
      baseline,
      criticalUnits,
      redundantUnits,
      warnings
    })
  };
}

export function formatContextAblationAuditReport(audit) {
  return `
# ContextAblationAuditV1

Gate: ${audit.gate.status}
Pfad: ${audit.root}

- Oracle-Erwartungen: ${formatNumber(audit.totals.oracle_expectations)}
- Sofort-Einheiten geprüft: ${formatNumber(audit.totals.checked_units)}/${formatNumber(audit.totals.immediate_units)}
- Oracle-kritische Einheiten: ${formatNumber(audit.totals.oracle_critical_units)}
- Ablation-sichere Kandidaten: ${formatNumber(audit.totals.ablation_safe_candidates)} (${formatNumber(audit.totals.ablation_safe_tokens)} Tokens)
- Gegenfakten erkannt: ${formatNumber(audit.oracle.counterfactuals_detected)}/${formatNumber(audit.oracle.counterfactuals)}
- Baseline-Oracle: ${audit.oracle.baseline_success ? "bestanden" : "fehlgeschlagen"}

## Kritische Einheiten

${formatCriticalRows(audit.ablations)}

## Kandidaten für On-Demand

${formatSafeRows(audit.ablations)}

## Hinweise

${audit.gate.warnings.length ? audit.gate.warnings.map((item) => `- ${item}`).join("\n") : "- keine"}

## Nächste Schritte

${audit.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

function buildExpectationSpecs(profile = {}) {
  return [
    ...normalizeList(profile.expect || []),
    ...normalizeList(profile.expectRegex || []).map((pattern) => ({ type: "regex", pattern }))
  ];
}

async function loadSegment(root, unit) {
  try {
    const absolutePath = resolveInsideRoot(root, unit.file);
    const text = await fs.readFile(absolutePath, "utf8");
    const lines = text.split(/\r\n|\r|\n/);
    const line = lines[unit.line - 1];
    if (line === undefined) {
      return failedSegment(unit, "line-missing", "line-not-found");
    }
    const actualHash = `sha256:${sha256(line.trim())}`;
    return {
      evidence_id: unit.evidence_id,
      unit_id: unit.id,
      type: unit.type,
      name: unit.name,
      file: unit.file,
      line: unit.line,
      token_cost: Number(unit.token_cost) || 0,
      expected_source_hash: unit.source_hash,
      actual_source_hash: actualHash,
      source_verified: actualHash === unit.source_hash,
      source_status: actualHash === unit.source_hash ? "verified" : "hash-mismatch",
      line_text: line.trim(),
      surface_text: formatSegmentSurface(unit, line.trim())
    };
  } catch (error) {
    return failedSegment(unit, error?.code === "ENOENT" ? "file-missing" : "source-load-error", error?.message || String(error));
  }
}

function failedSegment(unit, status, reason) {
  return {
    evidence_id: unit.evidence_id,
    unit_id: unit.id,
    type: unit.type,
    name: unit.name,
    file: unit.file,
    line: unit.line,
    token_cost: Number(unit.token_cost) || 0,
    expected_source_hash: unit.source_hash,
    actual_source_hash: null,
    source_verified: false,
    source_status: status,
    reason,
    line_text: "",
    surface_text: ""
  };
}

function buildSegmentAblation(segments, removed, oracle) {
  const remaining = segments.filter((segment) => segment.evidence_id !== removed.evidence_id);
  const result = evaluateAcceptanceOracle(buildSurfaceText(remaining), oracle);
  const changed = !result.success;
  return {
    evidence_id: removed.evidence_id,
    unit_id: removed.unit_id,
    file: removed.file,
    line: removed.line,
    type: removed.type,
    name: removed.name,
    token_cost: removed.token_cost,
    status: changed ? "oracle-critical" : "ablation-safe-candidate",
    oracle_still_passes: result.success,
    missing_after_removal: result.missing,
    retained_expectations: result.matched_count,
    total_expectations: result.total,
    recommendation: changed
      ? "keep-immediate"
      : "candidate-for-on-demand-after-review"
  };
}

function buildSurfaceText(segments) {
  return segments.map((segment) => segment.surface_text).join("\n");
}

function formatSegmentSurface(unit, lineText) {
  return [
    `evidence:${unit.evidence_id} unit:${unit.id}`,
    `source:${unit.file}:${unit.line}`,
    lineText
  ].join("\n");
}

function buildReasons(context) {
  const reasons = [];
  if (!context.oracle.expectations.length) reasons.push("oracle-missing");
  if (!context.plan.gate?.verified) reasons.push("plan-not-verified");
  if (!context.baseline.success) reasons.push("baseline-oracle-failed");
  if (context.sourceFailures.length) reasons.push("source-segment-load-failed");
  if (!context.counterfactuals.length) reasons.push("counterfactuals-missing");
  if (context.counterfactuals.length && context.detectedCounterfactuals.length !== context.counterfactuals.length) {
    reasons.push("oracle-insensitive-to-counterfactual-removal");
  }
  return reasons;
}

function buildNextActions(context) {
  const actions = [];
  if (!context.oracle.expectations.length) {
    actions.push("Füge --expect oder --expect-regex hinzu; ohne Oracle kann Ablation keine Qualität prüfen.");
    return actions;
  }
  if (!context.baseline.success) {
    actions.push("Erhoehe das Planbudget oder lade fehlende Requirement-Evidence, bis das Baseline-Oracle besteht.");
  }
  if (context.criticalUnits.length) {
    actions.push("Behalte oracle-kritische Einheiten im Sofortkontext oder ersetze sie nur durch gleichwertig verifizierte Evidence.");
  }
  if (context.redundantUnits.length) {
    actions.push("Prüfe ablation-sichere Kandidaten als mögliche On-Demand-Evidence, bevor der Startprompt weiter verkleinert wird.");
  }
  if (context.warnings.includes("oracle-insensitive")) {
    actions.push("Schärfe das Oracle; es muss Gegenfakten erkennen, sonst ist die Sparentscheidung nicht belastbar.");
  }
  if (context.verified) {
    actions.push("Nutze den Plan mit bekannter oracle-kritischer Spur; reduziere nur Kandidaten, die danach erneut verified-ablation-audit bleiben.");
  }
  return actions;
}

function formatCriticalRows(ablations) {
  const rows = ablations.filter((item) => item.status === "oracle-critical");
  if (!rows.length) return "- keine";
  return rows.slice(0, 16).map((item) => (
    `- ${item.evidence_id} ${item.file}:${item.line} ${item.name} (${formatNumber(item.token_cost)} Tokens, fehlt danach: ${item.missing_after_removal.join(", ")})`
  )).join("\n");
}

function formatSafeRows(ablations) {
  const rows = ablations.filter((item) => item.status === "ablation-safe-candidate");
  if (!rows.length) return "- keine";
  return rows.slice(0, 16).map((item) => (
    `- ${item.evidence_id} ${item.file}:${item.line} ${item.name} (${formatNumber(item.token_cost)} Tokens)`
  )).join("\n");
}

function resolveInsideRoot(root, file) {
  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Ablation path escapes root: ${file}`);
  }
  return resolved;
}

function normalizeList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item).split("\n"))
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
