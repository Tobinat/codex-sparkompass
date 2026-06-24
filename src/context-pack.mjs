import { createHash } from "node:crypto";
import { buildAcceptanceOracle, evaluateAcceptanceOracle } from "./acceptance-oracle.mjs";
import { compressText } from "./compressor.mjs";
import { resolveContextPolicy } from "./context-policy.mjs";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

export function buildContextPack(input, options = {}) {
  const label = options.label || "Eingabe";
  const normalized = normalizeText(input);
  const sourceHash = `sha256:${sha256(normalized)}`;
  const decision = chooseVerifiedContext(normalized, options);
  const compressed = decision.compressed;
  const fallbackUsed = decision.mode !== "compact-context";
  const fallbackReasons = decision.reasons;
  const contextText = decision.mode === "full-context" ? normalized : compressed.text;
  const contextStats = estimateTextStats(contextText);
  const receipt = buildReceipt({
    label,
    sourceHash,
    contextStats,
    contextText,
    decision
  });

  return {
    contextPackId: receipt.context_pack_id,
    label,
    sourceHash,
    fallbackUsed,
    fallbackReasons,
    fallbackMode: decision.mode,
    expansionAttempts: decision.attempts,
    receipt,
    compressed,
    context: {
      text: contextText,
      stats: contextStats,
      mode: decision.mode
    }
  };
}

export function formatContextPackReport(pack) {
  const receipt = pack.receipt;
  return `
# ContextPack Receipt v1

ID: ${receipt.context_pack_id}
Quelle: ${receipt.source.label}
Status: ${receipt.gate.status}
Risikoprofil: ${receipt.context_selection.policy.risk_profile}
Fallback: ${receipt.fallback.used ? receipt.fallback.mode : "nicht genutzt"}
Sparbalken: ${formatSavingsBar(toDeliveredSavings(receipt))}
${formatCompactCandidateSavings(receipt)}

## Verifikation

- Kritische Anker erhalten: ${receipt.critical_anchors.retained}/${receipt.critical_anchors.total} (${receipt.critical_anchors.retention_percent}%)
${formatCriticalAnchorClasses(receipt.critical_anchors.classes)}
- Informative Anker erhalten: ${receipt.informative_anchors.retained}/${receipt.informative_anchors.total} (${receipt.informative_anchors.retention_percent}%)
- Quellbeleg-Abdeckung: ${Math.round(receipt.source_evidence.coverage * 100)}%
- Akzeptanz-Orakel: ${formatAcceptanceOracleStatus(receipt.acceptance_oracle)}
- Riskante Verdichtung: ${receipt.quality.risky ? "ja" : "nein"}
- Ungeklaerte Unsicherheiten: ${receipt.uncertainties.length}
${formatFallbackReasons(receipt.fallback.reasons)}
${formatAttempts(receipt.context_selection.attempts)}

## Kontext für Codex

\`\`\`text
${pack.context.text}
\`\`\`

## Receipt JSON

\`\`\`json
${JSON.stringify(receipt, null, 2)}
\`\`\`
`.trim();
}

function buildReceipt({ label, sourceHash, contextStats, contextText, decision }) {
  const compressed = decision.compressed;
  const contextPackId = `ctx-${sha256(`${sourceHash}:${compressed.text}:${Date.now()}`).slice(0, 12)}`;
  const quality = compressed.quality;
  const deliveredAcceptance = evaluatePackAcceptance(contextText, decision.oracle);
  const gateStatus = getGateStatus(decision.mode, {
    sourceAcceptance: decision.sourceAcceptance,
    deliveredAcceptance
  });
  const unresolvedReasons = decision.mode === "full-context" ? decision.reasons : [];
  const attempts = decision.attempts.map(stripAttempt);
  const compactSavings = calculateSavings(compressed.original.estimatedTokens, compressed.compact.estimatedTokens);
  const deliveredSavings = calculateSavings(compressed.original.estimatedTokens, contextStats.estimatedTokens);

  return {
    schema: "ContextPackReceiptV1",
    context_pack_id: contextPackId,
    created_at: new Date().toISOString(),
    source: {
      label,
      hash: sourceHash
    },
    original_tokens: compressed.original.estimatedTokens,
    compact_tokens: compressed.compact.estimatedTokens,
    delivered_tokens: contextStats.estimatedTokens,
    compact_context: {
      hash: `sha256:${sha256(compressed.text)}`,
      tokens: compressed.compact.estimatedTokens
    },
    delivered_context: {
      hash: `sha256:${sha256(contextText)}`,
      tokens: contextStats.estimatedTokens,
      mode: decision.mode
    },
    saved_tokens: deliveredSavings.savedTokens,
    ersparnis_prozent: deliveredSavings.percent,
    compact_ersparnis_prozent: compactSavings.percent,
    savings: {
      compact: {
        saved_tokens: compactSavings.savedTokens,
        percent: compactSavings.percent
      },
      delivered: {
        saved_tokens: deliveredSavings.savedTokens,
        percent: deliveredSavings.percent
      }
    },
    critical_anchors: {
      total: quality.criticalAnchors,
      retained: quality.retainedCriticalAnchors,
      retention_percent: quality.criticalAnchorRetentionPercent,
      missing: quality.missingCriticalAnchors,
      classes: quality.criticalAnchorClasses
    },
    informative_anchors: {
      total: quality.informativeAnchors,
      retained: quality.retainedInformativeAnchors,
      retention_percent: quality.informativeAnchorRetentionPercent
    },
    anchor_classes: {
      schema: "AnchorClassBreakdownV1",
      critical: quality.criticalAnchorClasses,
      all: quality.anchorClasses
    },
    source_evidence: {
      coverage: quality.sourceCoveragePercent / 100,
      entries: quality.sourceEvidence.map((entry) => ({
        evidence_id: entry.evidence_id,
        output_line: entry.output_line,
        source_line: entry.source_line,
        source_hash: entry.source_hash,
        compression_type: entry.compression_type
      }))
    },
    quality: {
      status: quality.status,
      risky: quality.status === "riskant",
      warnings: quality.warnings
    },
    acceptance_oracle: buildAcceptanceReceipt(decision.oracle, decision.sourceAcceptance, deliveredAcceptance),
    fallback: {
      used: decision.mode !== "compact-context",
      mode: decision.mode,
      policy: "expand-then-full-context-on-uncertainty",
      reasons: decision.reasons,
      resolved: decision.mode !== "full-context",
      attempts
    },
    context_selection: {
      requested_target_percent: decision.policy.user_target_percent,
      effective_target_percent: decision.policy.effective_target_percent,
      delivered_target_percent: decision.targetPercent,
      policy: decision.policy,
      mode: decision.mode,
      attempts
    },
    uncertainties: unresolvedReasons,
    gate: {
      status: gateStatus,
      requirements: {
        critical_anchor_retention_percent: 100,
        source_evidence_coverage_percent: 100,
        risky_compressions: 0,
        acceptance_oracle_success: decision.oracle.expectations.length ? true : null,
        fallback_on_uncertainty: true,
        expand_before_full_context: true
      }
    }
  };
}

function chooseVerifiedContext(normalized, options) {
  const policy = resolveContextPolicy(options);
  const oracle = buildPackAcceptanceOracle(options);
  const sourceAcceptance = evaluatePackAcceptance(normalized, oracle);
  const requestedTargetPercent = policy.effective_target_percent;
  const targets = buildTargetPercents(policy);
  const attempts = [];
  let lastCompressed = null;

  for (const targetPercent of targets) {
    const compressed = compressText(normalized, {
      ...options,
      targetPercent
    });
    lastCompressed = compressed;
    const candidateAcceptance = evaluatePackAcceptance(compressed.text, oracle);
    const reasons = getFallbackReasons(compressed, {
      sourceAcceptance,
      candidateAcceptance
    });
    attempts.push(buildAttempt(compressed, targetPercent, reasons, candidateAcceptance));

    if (!reasons.length) {
      return {
        mode: targetPercent === requestedTargetPercent ? "compact-context" : "expanded-context",
        oracle,
        sourceAcceptance,
        policy,
        requestedTargetPercent,
        targetPercent,
        reasons: targetPercent === requestedTargetPercent ? [] : uniqueReasons(attempts.flatMap((attempt) => attempt.reasons)),
        attempts,
        compressed
      };
    }
  }

  const compressed = lastCompressed || compressText(normalized, {
    ...options,
    targetPercent: requestedTargetPercent
  });

  return {
    mode: "full-context",
    oracle,
    sourceAcceptance,
    policy,
    requestedTargetPercent,
    targetPercent: 100,
    reasons: uniqueReasons([...attempts.flatMap((attempt) => attempt.reasons), "full-context-required"]),
    attempts,
    compressed
  };
}

function buildTargetPercents(policy) {
  const targets = [policy.effective_target_percent, ...policy.expansion_targets]
    .map((target) => clampPercent(Number(target) || 0))
    .filter((target) => target >= policy.effective_target_percent);

  return [...new Set(targets)].sort((left, right) => left - right);
}

function buildAttempt(compressed, targetPercent, reasons, acceptanceResult) {
  return {
    target_percent: targetPercent,
    status: reasons.length ? "uncertain" : "verified",
    reasons,
    compact_tokens: compressed.compact.estimatedTokens,
    savings_percent: compressed.savings.percent,
    quality_status: compressed.quality.status,
    critical_anchor_retention_percent: compressed.quality.criticalAnchorRetentionPercent,
    source_evidence_coverage_percent: compressed.quality.sourceCoveragePercent,
    acceptance_oracle_success: acceptanceResult ? acceptanceResult.success : null,
    acceptance_oracle_missing: acceptanceResult ? acceptanceResult.missing : []
  };
}

function stripAttempt(attempt) {
  return {
    target_percent: attempt.target_percent,
    status: attempt.status,
    reasons: attempt.reasons,
    compact_tokens: attempt.compact_tokens,
    savings_percent: attempt.savings_percent,
    quality_status: attempt.quality_status,
    critical_anchor_retention_percent: attempt.critical_anchor_retention_percent,
    source_evidence_coverage_percent: attempt.source_evidence_coverage_percent,
    acceptance_oracle_success: attempt.acceptance_oracle_success,
    acceptance_oracle_missing: attempt.acceptance_oracle_missing
  };
}

function getGateStatus(mode, verification = {}) {
  if (verification.sourceAcceptance && !verification.sourceAcceptance.success) return "acceptance-oracle-source-failed";
  if (verification.deliveredAcceptance && !verification.deliveredAcceptance.success) return "acceptance-oracle-failed";
  if (mode === "expanded-context") return "verified-expanded-context";
  if (mode === "full-context") return "fallback-full-context";
  return "verified-publishable";
}

function getFallbackReasons(compressed, verification = {}) {
  const reasons = [];
  const quality = compressed.quality;

  if (quality.criticalAnchorRetentionPercent < 100) {
    reasons.push("critical-anchor-loss");
  }
  if (quality.sourceCoveragePercent < 100) {
    reasons.push("source-evidence-gap");
  }
  if (quality.status === "riskant") {
    reasons.push("risky-compression");
  }
  if (quality.protectedRetentionPercent < 100) {
    reasons.push("protected-line-loss");
  }
  if (verification.sourceAcceptance && !verification.sourceAcceptance.success) {
    reasons.push("source-acceptance-oracle-failed");
  } else if (verification.candidateAcceptance && !verification.candidateAcceptance.success) {
    reasons.push("acceptance-oracle-miss");
  }

  return [...new Set(reasons)];
}

function buildPackAcceptanceOracle(options) {
  const expectations = [
    ...normalizeList(options.expect || options.expectedTerms || []),
    ...normalizeList(options.expectRegex || options.expectedRegex || []).map((pattern) => ({ type: "regex", pattern }))
  ];
  return buildAcceptanceOracle(expectations);
}

function evaluatePackAcceptance(text, oracle) {
  if (!oracle.expectations.length) {
    return {
      schema: "AcceptanceOracleResultV1",
      success: true,
      total: 0,
      matched_count: 0,
      matched: [],
      missing: [],
      missing_details: [],
      checks: []
    };
  }
  return evaluateAcceptanceOracle(text, oracle);
}

function buildAcceptanceReceipt(oracle, sourceAcceptance, deliveredAcceptance) {
  return {
    schema: "ContextPackAcceptanceOracleV1",
    enabled: oracle.expectations.length > 0,
    type: oracle.type,
    expectations: oracle.expectations,
    source: summarizeAcceptanceResult(sourceAcceptance),
    delivered: summarizeAcceptanceResult(deliveredAcceptance)
  };
}

function summarizeAcceptanceResult(result) {
  return {
    success: result.success,
    total: result.total,
    matched_count: result.matched_count,
    missing: result.missing,
    missing_details: result.missing_details
  };
}

function formatAcceptanceOracleStatus(acceptanceOracle) {
  if (!acceptanceOracle?.enabled) return "nicht gesetzt";
  const delivered = acceptanceOracle.delivered;
  if (delivered.success) {
    return `bestanden (${delivered.matched_count}/${delivered.total})`;
  }
  return `fehlgeschlagen (${delivered.matched_count}/${delivered.total}), fehlt: ${delivered.missing.join(", ")}`;
}

function formatFallbackReasons(reasons) {
  if (!reasons.length) return "- Fallback-Gründe: keine";
  return `- Fallback-Gründe:\n${reasons.map((reason) => `  - ${reason}`).join("\n")}`;
}

function formatCriticalAnchorClasses(classes = []) {
  if (!classes.length) return "- Kritische Ankerklassen: keine";
  return [
    "- Kritische Ankerklassen:",
    ...classes.map((entry) => (
      `  - ${entry.class}: ${entry.retained}/${entry.total} (${entry.retention_percent}%)`
    ))
  ].join("\n");
}

function formatAttempts(attempts = []) {
  if (!attempts.length) return "- Kontext-Versuche: keine";
  const rows = attempts.map((attempt) => (
    `  - ${attempt.target_percent}%: ${attempt.status}, ${formatNumber(attempt.compact_tokens)} Tokens, ${attempt.reasons.length ? attempt.reasons.join(", ") : "keine Probleme"}`
  ));
  return `- Kontext-Versuche:\n${rows.join("\n")}`;
}

function toDeliveredSavings(receipt) {
  return {
    originalTokens: receipt.original_tokens,
    compactTokens: receipt.delivered_tokens,
    savedTokens: receipt.savings.delivered.saved_tokens,
    percent: receipt.savings.delivered.percent
  };
}

function formatCompactCandidateSavings(receipt) {
  if (!receipt.fallback.used) return "";
  const savings = {
    originalTokens: receipt.original_tokens,
    compactTokens: receipt.compact_tokens,
    savedTokens: receipt.savings.compact.saved_tokens,
    percent: receipt.savings.compact.percent
  };
  return `Kompakt-Kandidat: ${formatSavingsBar(savings)}`;
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function normalizeList(values) {
  if (values === undefined || values === "") return [];
  return Array.isArray(values) ? values : [values];
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function uniqueReasons(reasons) {
  return [...new Set(reasons.filter(Boolean))];
}

function clampPercent(value) {
  return Math.min(90, Math.max(10, Math.round(value)));
}

export function formatPackSummary(pack) {
  return `${pack.receipt.gate.status}: ${formatNumber(pack.receipt.delivered_tokens)} delivered tokens`;
}
