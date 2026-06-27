import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { formatNumber } from "./token-estimator.mjs";

export const DEFAULT_PROMPT_PREPARATION_LEDGER_PATH = ".sparkompass/prompt-preparation-ledger.json";
export const QUALITY_GATED_PROMPT_SAVING_GATE_STATUSES = new Set([
  "verified-compact-prompt",
  "verified-expanded-prompt"
]);

export async function appendPromptPreparationToLedger(rootPath, preparationInput, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.out || options.ledger || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH);
  const ledger = await readPromptPreparationLedgerFile(ledgerPath);
  const entry = promptPreparationToLedgerEntry(normalizePromptPreparationInput(preparationInput), {
    runType: options.runType || "prompt-prepare",
    note: options.note || ""
  });
  const entries = [
    ...ledger.entries.filter((candidate) => candidate.entry_id !== entry.entry_id),
    entry
  ].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  const nextLedger = buildPromptPreparationLedger(entries, {
    root,
    path: ledgerPath
  });

  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");

  return {
    schema: "PromptPreparationLedgerWriteResultV1",
    path: ledgerPath,
    entry,
    totals: nextLedger.totals
  };
}

export async function buildPromptPreparationLedgerReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.ledger || options.out || DEFAULT_PROMPT_PREPARATION_LEDGER_PATH);
  const ledger = await readPromptPreparationLedgerFile(ledgerPath);

  return buildPromptPreparationLedger(ledger.entries, {
    root,
    path: ledgerPath
  });
}

export async function loadPromptPreparationJson(preparationPath) {
  const raw = await fs.readFile(path.resolve(preparationPath), "utf8");
  return normalizePromptPreparationInput(JSON.parse(raw));
}

export function buildPromptPreparationLedger(entries = [], options = {}) {
  const normalizedEntries = entries.map((entry) => ({ ...entry }));
  const totals = summarizePromptPreparationLedger(normalizedEntries);

  return {
    schema: "PromptPreparationLedgerV1",
    ledger_id: `prompt-prep-ledger-${sha256(`${options.path || ""}:${normalizedEntries.map((entry) => entry.entry_id).join("|")}`).slice(0, 12)}`,
    path: options.path || null,
    root: options.root || null,
    updated_at: new Date().toISOString(),
    totals,
    entries: normalizedEntries
  };
}

export function summarizePromptPreparationLedger(entries = []) {
  const inputTokens = sum(entries, "input_tokens");
  const deliveredTokens = sum(entries, "delivered_context_tokens");
  const sendableTokens = sum(entries, "sendable_prompt_tokens");
  const deliveredSavings = calculateSavings(inputTokens, deliveredTokens);
  const sendableSavings = calculateSavings(inputTokens, sendableTokens);
  const qualityGatedPromptSavingEntries = entries.filter(isQualityGatedPromptSavingEntry);
  const verifiedInputTokens = sum(qualityGatedPromptSavingEntries, "input_tokens");
  const verifiedDeliveredTokens = sum(qualityGatedPromptSavingEntries, "delivered_context_tokens");
  const verifiedSendableTokens = sum(qualityGatedPromptSavingEntries, "sendable_prompt_tokens");
  const verifiedDeliveredSavings = calculateSavings(verifiedInputTokens, verifiedDeliveredTokens);
  const verifiedSendableSavings = calculateSavings(verifiedInputTokens, verifiedSendableTokens);
  const fallbackCount = entries.filter((entry) => entry.fallback_used).length;
  const autoTargetEntries = entries.filter((entry) => entry.auto_target_enabled).length;
  const verifiedAutoTargetEntries = entries.filter((entry) => (
    entry.auto_target_status === "verified-auto-target"
      && entry.auto_target_oracle_gate === "verified-oracle"
      && entry.auto_target_savings_gate === "verified-additional-saving"
  )).length;
  const verifiedAutoTargetOracleEntries = entries.filter((entry) => (
    entry.auto_target_oracle_gate === "verified-oracle"
  )).length;

  return {
    entries: entries.length,
    verified_preparations: entries.filter((entry) => entry.gate_verified).length,
    quality_gated_prompt_saving_preparations: qualityGatedPromptSavingEntries.length,
    needs_review_preparations: entries.filter((entry) => !entry.gate_verified).length,
    input_tokens: inputTokens,
    delivered_context_tokens: deliveredTokens,
    sendable_prompt_tokens: sendableTokens,
    delivered_context_saved_tokens: deliveredSavings.savedTokens,
    delivered_context_savings_percent: deliveredSavings.percent,
    sendable_prompt_saved_tokens: sendableSavings.savedTokens,
    sendable_prompt_savings_percent: sendableSavings.percent,
    verified_input_tokens: verifiedInputTokens,
    verified_delivered_context_tokens: verifiedDeliveredTokens,
    verified_sendable_prompt_tokens: verifiedSendableTokens,
    verified_delivered_context_saved_tokens: verifiedDeliveredSavings.savedTokens,
    verified_delivered_context_savings_percent: verifiedDeliveredSavings.percent,
    verified_sendable_prompt_saved_tokens: verifiedSendableSavings.savedTokens,
    verified_sendable_prompt_savings_percent: verifiedSendableSavings.percent,
    p95_sendable_prompt_tokens: percentile(entries.map((entry) => entry.sendable_prompt_tokens), 95),
    p95_sendable_saved_tokens: percentile(entries.map((entry) => entry.sendable_prompt_saved_tokens), 95),
    minimum_critical_anchor_retention_percent: minimum(entries.map((entry) => entry.critical_anchor_retention_percent), 100),
    minimum_source_evidence_coverage_percent: minimum(entries.map((entry) => entry.source_evidence_coverage_percent), 100),
    fallback_count: fallbackCount,
    fallback_rate_percent: entries.length ? Math.round((fallbackCount / entries.length) * 100) : 0,
    expanded_prompts: entries.filter((entry) => entry.fallback_mode === "expanded-context").length,
    full_context_fallbacks: entries.filter((entry) => entry.fallback_mode === "full-context").length,
    blocked_preparations: entries.filter((entry) => entry.gate_reasons.length > 0).length,
    auto_target_entries: autoTargetEntries,
    verified_auto_target_entries: verifiedAutoTargetEntries,
    verified_auto_target_oracle_entries: verifiedAutoTargetOracleEntries,
    auto_target_additional_saved_tokens: sum(entries, "auto_target_additional_saved_tokens"),
    auto_target_savings_gate_failures: autoTargetEntries - verifiedAutoTargetEntries,
    auto_target_oracle_gate_failures: autoTargetEntries - verifiedAutoTargetOracleEntries
  };
}

export function formatPromptPreparationLedgerReport(ledger) {
  const totals = ledger.totals;
  const rows = ledger.entries.slice(-12).map((entry) => (
    `- ${entry.label}: ${entry.gate_status}, ${formatSavingsBar(toSendableSavings(entry))}, ContextPack ${entry.context_pack_id}`
  )).join("\n") || "- keine Einträge";

  return `
# PromptPreparationLedgerV1

Pfad: ${ledger.path || "nicht gespeichert"}

- Einträge: ${formatNumber(totals.entries)}
- Verifizierte Vorbereitungen: ${formatNumber(totals.verified_preparations)}
- Qualitätsgegatede sparende Vorbereitungen: ${formatNumber(totals.quality_gated_prompt_saving_preparations)}
- Review-pflichtige Vorbereitungen: ${formatNumber(totals.needs_review_preparations)}
- Gelieferter ContextPack-Kontext: ${formatSavingsBar({
    originalTokens: totals.input_tokens,
    compactTokens: totals.delivered_context_tokens,
    savedTokens: totals.delivered_context_saved_tokens,
    percent: totals.delivered_context_savings_percent
  })}
- Sendbarer Prompt: ${formatSavingsBar({
    originalTokens: totals.input_tokens,
    compactTokens: totals.sendable_prompt_tokens,
    savedTokens: totals.sendable_prompt_saved_tokens,
    percent: totals.sendable_prompt_savings_percent
  })}
- Qualitätsgegateder sendbarer Prompt: ${formatSavingsBar({
    originalTokens: totals.verified_input_tokens,
    compactTokens: totals.verified_sendable_prompt_tokens,
    savedTokens: totals.verified_sendable_prompt_saved_tokens,
    percent: totals.verified_sendable_prompt_savings_percent
  })}
- p95 sendbare Prompt-Tokens: ${formatNumber(totals.p95_sendable_prompt_tokens)}
- p95 gesparte sendbare Tokens: ${formatNumber(totals.p95_sendable_saved_tokens)}
- Schlechteste kritische Anker-Erhaltung: ${totals.minimum_critical_anchor_retention_percent}%
- Schlechteste Quellbeleg-Abdeckung: ${totals.minimum_source_evidence_coverage_percent}%
- Fallback-Rate: ${totals.fallback_rate_percent}% (${formatNumber(totals.fallback_count)} von ${formatNumber(totals.entries)})
- Blockierte Vorbereitungen: ${formatNumber(totals.blocked_preparations)}
- Auto-Target: ${formatNumber(totals.verified_auto_target_entries)}/${formatNumber(totals.auto_target_entries)} verifiziert, Oracle ${formatNumber(totals.verified_auto_target_oracle_entries)}/${formatNumber(totals.auto_target_entries)}, zusätzlich ca. ${formatNumber(totals.auto_target_additional_saved_tokens)} Tokens

## Letzte Einträge

${rows}
`.trim();
}

function promptPreparationToLedgerEntry(preparation, options = {}) {
  const contextPack = preparation.context_pack || {};
  const input = preparation.input || {};
  const sendable = preparation.sendable_prompt || {};
  const deliveredSavings = preparation.savings?.delivered_context || {};
  const sendableSavings = preparation.savings?.sendable_prompt || {};
  const autoTarget = contextPack.auto_target || {};
  const seed = [
    contextPack.context_pack_id,
    input.source_hash,
    sendable.estimated_tokens,
    preparation.gate?.status,
    sendable.text ? sha256(sendable.text) : ""
  ].join(":");

  return {
    schema: "PromptPreparationLedgerEntryV1",
    entry_id: `prompt-prep-${sha256(seed).slice(0, 12)}`,
    preparation_hash: `sha256:${sha256(JSON.stringify({
      gate: preparation.gate,
      input: preparation.input,
      context_pack: preparation.context_pack,
      savings: preparation.savings,
      sendable_prompt: {
        estimated_tokens: sendable.estimated_tokens,
        lines: sendable.lines,
        hash: sendable.text ? `sha256:${sha256(sendable.text)}` : ""
      }
    }))}`,
    context_pack_id: contextPack.context_pack_id || "",
    created_at: preparation.generated_at || new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    run_type: options.runType || "prompt-prepare",
    note: options.note || "",
    label: input.label || "prompt-preparation",
    source_hash: input.source_hash || "",
    gate_status: preparation.gate?.status || "unknown",
    gate_verified: Boolean(preparation.gate?.verified),
    gate_reasons: preparation.gate?.reasons || [],
    context_pack_gate_status: contextPack.gate_status || "unknown",
    fallback_used: Boolean(contextPack.fallback_used),
    fallback_mode: contextPack.fallback_mode || "compact-context",
    input_tokens: Number(input.estimated_tokens) || 0,
    delivered_context_tokens: Number(contextPack.delivered_tokens) || 0,
    sendable_prompt_tokens: Number(sendable.estimated_tokens) || 0,
    delivered_context_saved_tokens: Number(deliveredSavings.savedTokens) || 0,
    delivered_context_savings_percent: Number(deliveredSavings.percent) || 0,
    sendable_prompt_saved_tokens: Number(sendableSavings.savedTokens) || 0,
    sendable_prompt_savings_percent: Number(sendableSavings.percent) || 0,
    critical_anchor_retention_percent: Number(contextPack.critical_anchors?.retention_percent) || 0,
    source_evidence_coverage_percent: Number(contextPack.source_evidence_coverage_percent) || 0,
    acceptance_oracle_success: Boolean(contextPack.acceptance_oracle_success),
    acceptance_oracle_sensitivity_success: contextPack.acceptance_oracle_sensitivity_success === null
      ? null
      : Boolean(contextPack.acceptance_oracle_sensitivity_success),
    auto_target_enabled: Boolean(autoTarget.enabled),
    auto_target_status: autoTarget.status || "not-used",
    auto_target_oracle_gate: autoTarget.oracle_gate || "not-used",
    auto_target_explicit_oracle_present: Boolean(autoTarget.explicit_oracle_present),
    auto_target_savings_gate: autoTarget.savings_gate || "not-used",
    auto_target_baseline_target_percent: Number(autoTarget.baseline_target_percent) || 0,
    auto_target_selected_target_percent: Number(autoTarget.selected_target_percent) || 0,
    auto_target_additional_saved_tokens: Number(autoTarget.additional_saved_tokens_vs_baseline) || 0,
    sendable_prompt_hash: sendable.text ? `sha256:${sha256(sendable.text)}` : ""
  };
}

async function readPromptPreparationLedgerFile(ledgerPath) {
  try {
    const raw = await fs.readFile(ledgerPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch (error) {
    if (error.code === "ENOENT") return { entries: [] };
    throw error;
  }
}

function normalizePromptPreparationInput(value) {
  const preparation = value?.preparation || value;
  if (!preparation || preparation.schema !== "SparkompassPromptPreparationV1") {
    throw new Error("Expected a SparkompassPromptPreparationV1 object.");
  }
  return preparation;
}

function resolveLedgerPath(root, ledgerPath) {
  if (path.isAbsolute(String(ledgerPath))) return String(ledgerPath);
  return path.resolve(root, String(ledgerPath));
}

function toSendableSavings(entry) {
  return {
    originalTokens: entry.input_tokens,
    compactTokens: entry.sendable_prompt_tokens,
    savedTokens: entry.sendable_prompt_saved_tokens,
    percent: entry.sendable_prompt_savings_percent
  };
}

export function isQualityGatedPromptSavingEntry(entry) {
  if (!entry?.gate_verified) return false;
  if (entry.fallback_mode === "full-context") return false;
  if (entry.gate_status === "verified-full-context-fallback") return false;
  if (!hasPositiveSendablePromptSavings(entry)) return false;
  if (QUALITY_GATED_PROMPT_SAVING_GATE_STATUSES.has(entry.gate_status)) return true;
  return !entry.gate_status || entry.gate_status === "unknown";
}

function hasPositiveSendablePromptSavings(entry) {
  const inputTokens = Number(entry?.input_tokens);
  const sendableTokens = Number(entry?.sendable_prompt_tokens);
  const savedTokens = Number(entry?.sendable_prompt_saved_tokens);

  if (!Number.isFinite(inputTokens) || inputTokens <= 0) return false;
  if (Number.isFinite(sendableTokens) && sendableTokens >= 0 && sendableTokens < inputTokens) return true;
  return Number.isFinite(savedTokens) && savedTokens > 0;
}

function sum(entries, field) {
  return entries.reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
}

function minimum(values, fallback = 0) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.min(...finite) : fallback;
}

function percentile(values, rank) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) return 0;

  const index = Math.ceil((rank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
