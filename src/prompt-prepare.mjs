import { buildContextPack } from "./context-pack.mjs";
import { buildPromptAdvisory, extractPromptText, parsePayload } from "./prompt-advisory.mjs";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

export function buildPromptPreparation(input, options = {}) {
  const sourceText = options.hookPayload ? extractPromptText(parsePayload(input), input) : String(input || "");
  const advisory = buildPromptAdvisory(input, {
    hookPayload: Boolean(options.hookPayload),
    minTokens: options.minTokens,
    minLines: options.minLines
  });
  const pack = buildContextPack(sourceText, {
    label: options.label || "prompt-preparation",
    targetPercent: Number(options.targetPercent) || 35,
    riskProfile: String(options.riskProfile || "balanced"),
    mode: String(options.mode || "auto"),
    keep: normalizeList(options.keep),
    expect: normalizeList(options.expect),
    expectRegex: normalizeList(options.expectRegex)
  });
  const sendablePrompt = buildSendablePrompt(pack, {
    goal: options.goal || "",
    includeReceipt: Boolean(options.includeReceipt)
  });
  const originalStats = estimateTextStats(sourceText);
  const sendableStats = estimateTextStats(sendablePrompt);
  const sendableSavings = calculateSavings(originalStats.estimatedTokens, sendableStats.estimatedTokens);
  const deliveredSavings = toDeliveredSavings(pack.receipt);
  const gate = buildPreparationGate(pack, {
    originalStats,
    sendableSavings
  });

  return {
    schema: "SparkompassPromptPreparationV1",
    generated_at: new Date().toISOString(),
    status: gate.verified ? "prepared" : "needs-review",
    advisory,
    gate,
    input: {
      label: options.label || "prompt-preparation",
      estimated_tokens: originalStats.estimatedTokens,
      lines: originalStats.lines,
      source_hash: pack.receipt.source.hash
    },
    context_pack: summarizePack(pack),
    savings: {
      delivered_context: {
        ...deliveredSavings,
        visible_bar: formatSavingsBar(deliveredSavings)
      },
      sendable_prompt: {
        ...sendableSavings,
        visible_bar: formatSavingsBar(sendableSavings),
        caveat: "Includes handoff metadata, so it can save less than the compact context itself."
      }
    },
    sendable_prompt: {
      text: sendablePrompt,
      estimated_tokens: sendableStats.estimatedTokens,
      lines: sendableStats.lines
    },
    caveat: "This prepares a smaller prompt for conscious handoff. It does not rewrite Codex's internal request payload."
  };
}

export function formatPromptPreparation(preparation) {
  return `
# Sparkompass Prompt Preparation

Gate: ${preparation.gate.status}

- Advisory: ${preparation.advisory.status}, ${preparation.advisory.suggested.action}
- ContextPack: ${preparation.context_pack.context_pack_id}
- ContextPack-Gate: ${preparation.context_pack.gate_status}
- Fallback: ${preparation.context_pack.fallback_used ? preparation.context_pack.fallback_mode : "nicht genutzt"}
- Kritische Anker: ${preparation.context_pack.critical_anchors.retained}/${preparation.context_pack.critical_anchors.total} (${preparation.context_pack.critical_anchors.retention_percent}%)
- Quellbeleg-Abdeckung: ${preparation.context_pack.source_evidence_coverage_percent}%
- Akzeptanz-Orakel: ${preparation.context_pack.acceptance_oracle_success ? "bestanden" : "nicht bestanden"}
- Kontext-Sparbalken: ${preparation.savings.delivered_context.visible_bar}
- Sendbarer Prompt: ${formatNumber(preparation.sendable_prompt.estimated_tokens)} Tokens, ${preparation.savings.sendable_prompt.visible_bar}
- Hinweis: Diese Vorbereitung verändert den Codex-Prompt nicht automatisch.
${formatGateReasons(preparation.gate.reasons)}

## Sendbarer Codex-Prompt

\`\`\`text
${preparation.sendable_prompt.text}
\`\`\`
`.trim();
}

function buildSendablePrompt(pack, options = {}) {
  const receipt = pack.receipt;
  const goal = String(options.goal || "").trim();
  const lines = [
    "Nutze den folgenden verifizierten Sparkompass-Kontext statt des Rohtexts.",
    goal ? `Ziel: ${goal}` : "",
    `ContextPack: ${receipt.context_pack_id}`,
    `Gate: ${receipt.gate.status}`,
    `Source-Hash: ${receipt.source.hash}`,
    `Delivered-Hash: ${receipt.delivered_context.hash}`,
    `Kritische Anker: ${receipt.critical_anchors.retained}/${receipt.critical_anchors.total} (${receipt.critical_anchors.retention_percent}%)`,
    `Quellbeleg-Abdeckung: ${Math.round(receipt.source_evidence.coverage * 100)}%`,
    `Fallback: ${receipt.fallback.used ? receipt.fallback.mode : "nicht genutzt"}`,
    "",
    "Kompakter Kontext:",
    pack.context.text || "[leer]"
  ].filter((line) => line !== "");

  if (options.includeReceipt) {
    lines.push("", "Receipt JSON:", JSON.stringify(receipt, null, 2));
  }

  return lines.join("\n");
}

function buildPreparationGate(pack, options = {}) {
  const receipt = pack.receipt;
  const hardFailures = [];
  if (!options.originalStats?.estimatedTokens) hardFailures.push("empty-input");
  if (receipt.acceptance_oracle.enabled && !receipt.acceptance_oracle.delivered.success) {
    hardFailures.push("acceptance-oracle-failed");
  }
  if (receipt.critical_anchors.retention_percent < 100) hardFailures.push("critical-anchor-loss");
  if (Math.round(receipt.source_evidence.coverage * 100) < 100) hardFailures.push("source-evidence-gap");
  if (receipt.quality.risky) hardFailures.push("risky-compression");

  const verified = hardFailures.length === 0 && [
    "verified-publishable",
    "verified-expanded-context",
    "fallback-full-context"
  ].includes(receipt.gate.status);
  const status = verified
    ? receipt.fallback.used
      ? receipt.fallback.mode === "full-context" ? "verified-full-context-fallback" : "verified-expanded-prompt"
      : "verified-compact-prompt"
    : "prompt-preparation-needs-review";

  return {
    schema: "SparkompassPromptPreparationGateV1",
    status,
    verified,
    reasons: verified ? [] : hardFailures,
    sendable_prompt_savings_percent: options.sendableSavings?.percent || 0
  };
}

function summarizePack(pack) {
  const receipt = pack.receipt;
  return {
    context_pack_id: receipt.context_pack_id,
    gate_status: receipt.gate.status,
    fallback_used: receipt.fallback.used,
    fallback_mode: receipt.fallback.mode,
    delivered_tokens: receipt.delivered_tokens,
    saved_tokens: receipt.saved_tokens,
    savings_percent: receipt.ersparnis_prozent,
    source_hash: receipt.source.hash,
    delivered_context_hash: receipt.delivered_context.hash,
    critical_anchors: receipt.critical_anchors,
    source_evidence_coverage_percent: Math.round(receipt.source_evidence.coverage * 100),
    acceptance_oracle_success: receipt.acceptance_oracle.delivered.success
  };
}

function toDeliveredSavings(receipt) {
  return {
    originalTokens: receipt.original_tokens,
    compactTokens: receipt.delivered_tokens,
    savedTokens: receipt.savings.delivered.saved_tokens,
    percent: receipt.savings.delivered.percent
  };
}

function formatGateReasons(reasons = []) {
  if (!reasons.length) return "";
  return `\n## Blocker\n\n${reasons.map((reason) => `- ${reason}`).join("\n")}`;
}

function normalizeList(values) {
  if (values === undefined || values === "") return [];
  return Array.isArray(values) ? values : [values];
}
