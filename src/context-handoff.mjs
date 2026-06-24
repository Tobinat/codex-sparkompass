import { createHash } from "node:crypto";
import { buildContextControlReport } from "./context-control.mjs";
import { buildSourceHashLoadHint } from "./evidence-hints.mjs";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildContextHandoffReceipt(rootPath, options = {}) {
  const control = await buildContextControlReport(rootPath, options);
  return buildContextHandoffReceiptFromControl(control);
}

export function buildContextHandoffReceiptFromControl(control) {
  const envelope = control.artifacts?.envelope || {};
  const plan = control.artifacts?.plan || {};
  const inventoryTokens = Number(control.budget?.inventory_tokens) || 0;
  const promptTokens = Number(control.budget?.prompt_tokens) || 0;
  const immediateTokens = Number(control.budget?.immediate_tokens) || 0;
  const deferredTokens = Number(control.budget?.deferred_relevant_tokens) || 0;
  const onDemandTokens = Number(control.budget?.on_demand_index_tokens) || 0;
  const startSavings = calculateSavings(inventoryTokens, promptTokens);
  const selectedSavings = calculateSavings(inventoryTokens, immediateTokens);
  const handoffId = `handoff-${sha256([
    control.root,
    control.task_profile?.goal,
    control.handoff?.full_prompt_hash,
    control.handoff?.on_demand_index_hash,
    control.readiness?.status
  ].join(":")).slice(0, 12)}`;

  return {
    schema: "ContextHandoffReceiptV1",
    handoff_id: handoffId,
    root: control.root,
    generated_at: new Date().toISOString(),
    task_profile: control.task_profile,
    gate: {
      status: control.readiness?.verified ? "verified-handoff" : "handoff-needs-review",
      verified: Boolean(control.readiness?.verified),
      readiness_status: control.readiness?.status || "unknown",
      blocking_warnings: control.readiness?.blocking_warnings || [],
      warnings: control.readiness?.warnings || []
    },
    savings: {
      schema: "ContextHandoffSavingsV1",
      basis: "estimated inventory tokens versus ContextEnvelope start prompt tokens",
      inventory_tokens: inventoryTokens,
      start_prompt_tokens: promptTokens,
      immediate_context_tokens: immediateTokens,
      deferred_relevant_tokens: deferredTokens,
      on_demand_index_tokens: onDemandTokens,
      start_context_saved_tokens: startSavings.savedTokens,
      start_context_savings_percent: startSavings.percent,
      selected_context_saved_tokens: selectedSavings.savedTokens,
      selected_context_savings_percent: selectedSavings.percent,
      visible_bar: formatSavingsBar(startSavings),
      caveat: "Token counts are local estimates for planning, not billing data."
    },
    quality_contract: {
      plan_gate: control.gates?.plan?.status || "unknown",
      envelope_gate: control.gates?.envelope?.status || "unknown",
      requirements_status: control.gates?.requirements?.status || "not-set",
      must_survive: {
        enabled: Boolean(control.gates?.requirements?.enabled),
        covered: Number(control.gates?.requirements?.covered) || 0,
        total: Number(control.gates?.requirements?.total) || 0,
        missing: control.gates?.requirements?.missing || []
      },
      risk_controls: {
        status: control.gates?.risk_controls?.status || "unknown",
        risk_profile: control.gates?.risk_controls?.risk_profile || control.task_profile?.risk_profile || "balanced",
        relevant_risk_units: Number(control.gates?.risk_controls?.relevant_risk_units) || 0,
        deferred_risk_units: Number(control.gates?.risk_controls?.deferred_risk_units) || 0,
        reasons: control.gates?.risk_controls?.reasons || []
      },
      immediate_evidence_count: control.evidence_protocol?.immediate?.length || 0,
      on_demand_evidence_count: control.evidence_protocol?.on_demand?.length || 0,
      evidence_protocol: "Load bounded source evidence by unit id or source hash before relying on exact omitted details."
    },
    prompt_cache_layout: {
      status: control.gates?.prompt_cache?.status || "unknown",
      prefix_reuse_status: control.gates?.prompt_cache?.prefix_reuse_status || "unknown",
      reusable_prefix_tokens: Number(control.budget?.reusable_prefix_tokens) || 0,
      variable_tail_tokens: Number(control.budget?.variable_tail_tokens) || 0,
      reusable_prefix_percent: Number(control.budget?.reusable_prefix_percent) || 0,
      prompt_cache_caveat: control.gates?.prompt_cache?.caveat || "Prompt-cache numbers are estimates."
    },
    handoff: {
      send_order: control.handoff?.send_order || [],
      on_demand_order: control.handoff?.on_demand_order || [],
      stable_prefix_hash: control.handoff?.stable_prefix_hash || "",
      variable_tail_hash: control.handoff?.variable_tail_hash || "",
      on_demand_index_hash: control.handoff?.on_demand_index_hash || "",
      full_prompt_hash: control.handoff?.full_prompt_hash || ""
    },
    start_prompt: {
      estimated_tokens: envelope.prompt?.estimated_tokens || promptTokens,
      hash: envelope.prompt?.hash || control.handoff?.full_prompt_hash || "",
      text: envelope.prompt?.text || ""
    },
    on_demand_index: {
      estimated_tokens: envelope.on_demand_index?.estimated_tokens || onDemandTokens,
      hash: envelope.on_demand_index?.hash || control.handoff?.on_demand_index_hash || "",
      evidence: control.evidence_protocol?.on_demand || [],
      text: envelope.on_demand_index?.text || ""
    },
    artifacts: {
      control_schema: control.schema,
      plan_schema: plan.schema || null,
      envelope_schema: envelope.schema || null,
      control
    },
    next_actions: buildNextActions(control)
  };
}

export function formatContextHandoffReceipt(receipt, options = {}) {
  return `
# ContextHandoffReceiptV1

Ziel: ${receipt.task_profile?.goal || "nicht gesetzt"}
Gate: ${receipt.gate.status}

- Sichtbare Startkontext-Ersparnis: ${receipt.savings.visible_bar}
- Inventar-Basis: ${formatNumber(receipt.savings.inventory_tokens)} Tokens
- Startprompt: ${formatNumber(receipt.savings.start_prompt_tokens)} Tokens
- Sofort-Kontext: ${formatNumber(receipt.savings.immediate_context_tokens)} Tokens
- Nachladbar zurückgehalten: ${formatNumber(receipt.savings.deferred_relevant_tokens)} relevante Tokens
- On-Demand-Index: ${formatNumber(receipt.savings.on_demand_index_tokens)} Tokens, nicht für jeden Startprompt gedacht
- Muss-Fakten: ${formatMustSurvive(receipt.quality_contract.must_survive)}
- Risiko-Policy: ${formatRiskControls(receipt.quality_contract.risk_controls)}
- Prompt-Cache-Layout: ${receipt.prompt_cache_layout.status}, Prefix ${formatNumber(receipt.prompt_cache_layout.reusable_prefix_tokens)} Tokens
- Voller Prompt-Hash: ${receipt.handoff.full_prompt_hash}

## Qualitätsvertrag

- Plan: ${receipt.quality_contract.plan_gate}
- Envelope: ${receipt.quality_contract.envelope_gate}
- Readiness: ${receipt.gate.readiness_status}
- Sofort-Belege: ${formatNumber(receipt.quality_contract.immediate_evidence_count)}
- Nachlade-Belege: ${formatNumber(receipt.quality_contract.on_demand_evidence_count)}
- Hinweis: ${receipt.savings.caveat}

## Sende-Reihenfolge

${formatList(receipt.handoff.send_order)}

## MCP-Nachladen

${formatEvidenceRows(receipt.on_demand_index.evidence)}

## Nächste Schritte

${receipt.next_actions.map((action) => `- ${action}`).join("\n")}
${formatWarnings(receipt.gate)}
${formatPromptSection(receipt, options)}
`.trim();
}

function buildNextActions(control) {
  const actions = [];
  if (control.readiness?.verified) {
    actions.push("Sende start_prompt.text als engen Codex-Startkontext, nicht das gesamte Repository.");
  } else {
    actions.push("Behebe die Handoff-Warnungen, bevor dieser Startkontext als final gilt.");
  }
  if (control.evidence_protocol?.on_demand?.length) {
    actions.push("Lade exakte Originalstellen über sparkompass_load_evidence oder sparkompass_load_source_hash nur bei Bedarf nach.");
  }
  if (control.gates?.requirements?.enabled && control.gates.requirements.status !== "covered-immediately") {
    actions.push("Prüfe Muss-Fakten über die angegebenen Belege, bevor du dich auf Details verlässt.");
  }
  if (control.gates?.prompt_cache?.status === "prefix-below-estimated-threshold") {
    actions.push("Nutze das Layout trotzdem für Ordnung; ein echter Prompt-Cache-Gewinn ist hier nur eine Schätzung.");
  }
  actions.push("Nutze OpenAI-/Codex-Dashboards für echte Abrechnung; Sparkompass liefert lokale Planungsschätzungen.");
  return [...new Set(actions)];
}

function formatMustSurvive(mustSurvive) {
  if (!mustSurvive?.enabled) return "nicht gesetzt";
  return `${formatNumber(mustSurvive.covered)}/${formatNumber(mustSurvive.total)}, fehlt ${formatNumber(mustSurvive.missing.length)}`;
}

function formatRiskControls(riskControls) {
  if (!riskControls) return "nicht gesetzt";
  return `${riskControls.risk_profile}, ${riskControls.status}, ${formatNumber(riskControls.deferred_risk_units)} deferred`;
}

function formatList(items = []) {
  if (!items.length) return "- keine";
  return items.map((item) => `- ${item}`).join("\n");
}

function formatEvidenceRows(evidence = []) {
  if (!evidence.length) return "- keine";
  return evidence.slice(0, 16).map((item) => [
    `- ${item.evidence_id} ${item.file}:${item.line} (${item.source_hash})`,
    `  load=${item.load_hint || "sparkompass_load_evidence"}`,
    `  raw=${item.source_hash_load_hint || buildSourceHashLoadHint(item)}`
  ].join("\n")).join("\n");
}

function formatWarnings(gate) {
  const warnings = [...(gate.blocking_warnings || []), ...(gate.warnings || [])];
  if (!warnings.length) return "\n- Warnungen: keine";
  return `\n- Warnungen:\n${[...new Set(warnings)].map((warning) => `  - ${warning}`).join("\n")}`;
}

function formatPromptSection(receipt, options) {
  if (!options.includePrompt) return "";
  return `

## Startprompt

${receipt.start_prompt.text || "(leer)"}
`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
