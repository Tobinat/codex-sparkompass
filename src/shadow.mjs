import { createHash } from "node:crypto";
import { buildAcceptanceOracle, buildCounterfactualChecks, evaluateAcceptanceOracle } from "./acceptance-oracle.mjs";
import { buildContextPack } from "./context-pack.mjs";
import { formatNumber, estimateTextStats } from "./token-estimator.mjs";

export function runShadowComparison(input, options = {}) {
  const source = normalizeText(input);
  const label = options.label || "Eingabe";
  const expectationSpecs = [
    ...normalizeList(options.expect || options.expectedTerms || []),
    ...normalizeList(options.expectRegex || []).map((pattern) => ({ type: "regex", pattern }))
  ];
  const oracle = buildAcceptanceOracle(expectationSpecs);

  if (!source) {
    throw new Error("ShadowRunV1 needs non-empty input text.");
  }
  if (!oracle.expectations.length) {
    throw new Error("ShadowRunV1 needs at least one --expect or --expect-regex rule.");
  }

  const pack = buildContextPack(source, {
    label,
    targetPercent: Number(options.targetPercent) || 35,
    riskProfile: options.riskProfile || "balanced",
    mode: options.mode || "auto",
    keep: normalizeTerms(options.keep || []),
    expansionTargets: Array.isArray(options.expansionTargets) ? options.expansionTargets : undefined
  });
  const fullStats = estimateTextStats(source);
  const fullOracle = evaluateAcceptanceOracle(source, oracle);
  const contextOracle = evaluateAcceptanceOracle(pack.context.text, oracle);
  const counterfactuals = buildCounterfactualChecks(pack.context.text, oracle);
  const detectedCounterfactuals = counterfactuals.filter((check) => check.detected);
  const regression = fullOracle.success && !contextOracle.success;
  const oracleSensitive = counterfactuals.length > 0 && detectedCounterfactuals.length === counterfactuals.length;
  const receiptSafe = (
    pack.receipt.critical_anchors.retention_percent === 100
    && Math.round(pack.receipt.source_evidence.coverage * 100) === 100
    && pack.receipt.quality.risky === false
  );
  const gate = buildShadowGate({
    fullOracle,
    contextOracle,
    regression,
    oracleSensitive,
    receiptSafe
  });

  return {
    schema: "ShadowRunV1",
    label,
    oracle: {
      ...oracle,
      expected_terms: oracle.expected_terms
    },
    full_context: {
      success: fullOracle.success,
      missing: fullOracle.missing,
      tokens: fullStats.estimatedTokens,
      source_hash: `sha256:${sha256(source)}`
    },
    sparkompass_context: {
      success: contextOracle.success,
      missing: contextOracle.missing,
      tokens: pack.receipt.delivered_tokens,
      mode: pack.context.mode,
      gate_status: pack.receipt.gate.status,
      context_pack_id: pack.contextPackId,
      receipt: pack.receipt
    },
    comparison: {
      regression,
      oracle_sensitive: oracleSensitive,
      counterfactuals,
      counterfactuals_detected: detectedCounterfactuals.length,
      savings_percent: pack.receipt.savings.delivered.percent,
      saved_tokens: pack.receipt.savings.delivered.saved_tokens,
      tokens_per_successful_case: contextOracle.success ? pack.receipt.delivered_tokens : null,
      fallback_used: pack.fallbackUsed,
      fallback_mode: pack.fallbackMode
    },
    gate,
    context: options.includeContext ? {
      text: pack.context.text
    } : undefined
  };
}

export function formatShadowReport(shadow) {
  const rows = shadow.oracle.expectations.map((expectation) => {
    const label = expectation.label;
    const fullOk = shadow.full_context.missing.includes(label) ? "fehlt" : "ok";
    const contextOk = shadow.sparkompass_context.missing.includes(label) ? "fehlt" : "ok";
    return `- ${label}: Vollkontext ${fullOk}, Sparkompass ${contextOk}`;
  }).join("\n");

  return `
# Sparkompass Shadow Run

Quelle: ${shadow.label}
Gate: ${shadow.gate.status}

- Vollkontext: ${shadow.full_context.success ? "bestanden" : "fehlgeschlagen"}, ${formatNumber(shadow.full_context.tokens)} Tokens
- Sparkompass-Kontext: ${shadow.sparkompass_context.success ? "bestanden" : "fehlgeschlagen"}, ${formatNumber(shadow.sparkompass_context.tokens)} Tokens, ${shadow.sparkompass_context.mode}
- Regression gegen Vollkontext: ${shadow.comparison.regression ? "ja" : "nein"}
- Gegenfakten erkannt: ${formatNumber(shadow.comparison.counterfactuals_detected)}/${formatNumber(shadow.comparison.counterfactuals.length)}
- Echte Ersparnis: ${shadow.comparison.savings_percent}% (${formatNumber(shadow.comparison.saved_tokens)} Tokens)
- Tokens pro erfolgreichem Shadow-Fall: ${shadow.comparison.tokens_per_successful_case === null ? "nicht bestanden" : formatNumber(shadow.comparison.tokens_per_successful_case)}
- Fallback: ${shadow.comparison.fallback_used ? shadow.comparison.fallback_mode : "nicht genutzt"}

## Erwartete Fakten

${rows}
${formatGateReasons(shadow.gate.reasons)}
`.trim();
}

function buildShadowGate({ fullOracle, contextOracle, regression, oracleSensitive, receiptSafe }) {
  const reasons = [];

  if (!fullOracle.success) {
    reasons.push("full-context-oracle-failed");
  }
  if (regression) {
    reasons.push("sparkompass-context-regression");
  }
  if (!oracleSensitive) {
    reasons.push("oracle-insensitive-to-counterfactual-removal");
  }
  if (!receiptSafe) {
    reasons.push("contextpack-receipt-unsafe");
  }

  return {
    status: reasons.length ? "shadow-regression" : "verified-shadow",
    verified: reasons.length === 0,
    reasons,
    requirements: {
      full_context_success: true,
      sparkompass_context_success: true,
      regressions: 0,
      counterfactuals_detected: "all",
      critical_anchor_retention_percent: 100,
      source_evidence_coverage_percent: 100,
      risky_compressions: 0
    }
  };
}

function formatGateReasons(reasons = []) {
  if (!reasons.length) return "\n- Gate-Probleme: keine";
  return `\n- Gate-Probleme:\n${reasons.map((reason) => `  - ${reason}`).join("\n")}`;
}

function normalizeTerms(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function normalizeList(values) {
  if (values === undefined || values === "") return [];
  return Array.isArray(values) ? values : [values];
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
