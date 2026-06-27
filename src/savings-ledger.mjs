import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { formatNumber } from "./token-estimator.mjs";

export const DEFAULT_SAVINGS_LEDGER_PATH = ".sparkompass/savings-ledger.json";
const QUALITY_VERIFIED_GATE_STATUSES = new Set([
  "verified-publishable",
  "verified-expanded-context",
  "fallback-full-context"
]);
const QUALITY_GATED_SAVINGS_GATE_STATUSES = new Set([
  "verified-publishable",
  "verified-expanded-context"
]);

export async function appendReceiptToLedger(rootPath, receiptInput, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.out || options.ledger || DEFAULT_SAVINGS_LEDGER_PATH);
  const ledger = await readSavingsLedgerFile(ledgerPath);
  const entry = receiptToLedgerEntry(normalizeReceiptInput(receiptInput), {
    runType: options.runType || "pack",
    note: options.note || ""
  });
  const entries = [
    ...ledger.entries.filter((candidate) => candidate.entry_id !== entry.entry_id),
    entry
  ].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  const nextLedger = buildSavingsLedger(entries, {
    root,
    path: ledgerPath
  });

  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");

  return {
    schema: "SavingsLedgerWriteResultV1",
    path: ledgerPath,
    entry,
    totals: nextLedger.totals
  };
}

export async function buildSavingsLedgerReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.ledger || options.out || DEFAULT_SAVINGS_LEDGER_PATH);
  const ledger = await readSavingsLedgerFile(ledgerPath);

  return buildSavingsLedger(ledger.entries, {
    root,
    path: ledgerPath
  });
}

export async function loadReceiptJson(receiptPath) {
  const raw = await fs.readFile(path.resolve(receiptPath), "utf8");
  return normalizeReceiptInput(JSON.parse(raw));
}

export function buildSavingsLedger(entries = [], options = {}) {
  const normalizedEntries = entries.map((entry) => ({ ...entry }));
  const totals = summarizeSavingsLedger(normalizedEntries);

  return {
    schema: "SavingsLedgerV1",
    ledger_id: `ledger-${sha256(`${options.path || ""}:${normalizedEntries.map((entry) => entry.entry_id).join("|")}`).slice(0, 12)}`,
    path: options.path || null,
    root: options.root || null,
    updated_at: new Date().toISOString(),
    totals,
    entries: normalizedEntries
  };
}

export function summarizeSavingsLedger(entries = []) {
  const originalTokens = sum(entries, "original_tokens");
  const deliveredTokens = sum(entries, "delivered_tokens");
  const compactTokens = sum(entries, "compact_tokens");
  const deliveredSavings = calculateSavings(originalTokens, deliveredTokens);
  const compactSavings = calculateSavings(originalTokens, compactTokens);
  const verifiedEntriesList = entries.filter(isQualityVerifiedSavingsEntry);
  const qualityGatedSavingEntriesList = entries.filter(isQualityGatedSavingsEntry);
  const verifiedOriginalTokens = sum(verifiedEntriesList, "original_tokens");
  const verifiedDeliveredTokens = sum(verifiedEntriesList, "delivered_tokens");
  const verifiedDeliveredSavings = calculateSavings(verifiedOriginalTokens, verifiedDeliveredTokens);
  const verifiedEntries = verifiedEntriesList.length;
  const qualityGatedOriginalTokens = sum(qualityGatedSavingEntriesList, "original_tokens");
  const qualityGatedDeliveredTokens = sum(qualityGatedSavingEntriesList, "delivered_tokens");
  const qualityGatedDeliveredSavings = calculateSavings(qualityGatedOriginalTokens, qualityGatedDeliveredTokens);
  const expandedContexts = entries.filter((entry) => entry.fallback_mode === "expanded-context").length;
  const fullContextFallbacks = entries.filter((entry) => entry.fallback_mode === "full-context").length;
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
    verified_entries: verifiedEntries,
    quality_gated_saving_entries: qualityGatedSavingEntriesList.length,
    needs_review_entries: entries.length - verifiedEntries,
    original_tokens: originalTokens,
    compact_tokens: compactTokens,
    delivered_tokens: deliveredTokens,
    compact_saved_tokens: compactSavings.savedTokens,
    compact_savings_percent: compactSavings.percent,
    delivered_saved_tokens: deliveredSavings.savedTokens,
    delivered_savings_percent: deliveredSavings.percent,
    verified_original_tokens: verifiedOriginalTokens,
    verified_delivered_tokens: verifiedDeliveredTokens,
    verified_delivered_saved_tokens: verifiedDeliveredSavings.savedTokens,
    verified_delivered_savings_percent: verifiedDeliveredSavings.percent,
    quality_gated_original_tokens: qualityGatedOriginalTokens,
    quality_gated_delivered_tokens: qualityGatedDeliveredTokens,
    quality_gated_delivered_saved_tokens: qualityGatedDeliveredSavings.savedTokens,
    quality_gated_delivered_savings_percent: qualityGatedDeliveredSavings.percent,
    p95_delivered_tokens: percentile(entries.map((entry) => entry.delivered_tokens), 95),
    p95_saved_tokens: percentile(entries.map((entry) => entry.delivered_saved_tokens), 95),
    minimum_critical_anchor_retention_percent: minimum(entries.map((entry) => entry.critical_anchor_retention_percent), 100),
    minimum_source_evidence_coverage_percent: minimum(entries.map((entry) => entry.source_evidence_coverage_percent), 100),
    fallback_count: fallbackCount,
    fallback_rate_percent: entries.length ? Math.round((fallbackCount / entries.length) * 100) : 0,
    expanded_contexts: expandedContexts,
    full_context_fallbacks: fullContextFallbacks,
    risky_compressions: entries.filter((entry) => entry.quality_status === "riskant").length,
    auto_target_entries: autoTargetEntries,
    verified_auto_target_entries: verifiedAutoTargetEntries,
    verified_auto_target_oracle_entries: verifiedAutoTargetOracleEntries,
    auto_target_additional_saved_tokens: sum(entries, "auto_target_additional_saved_tokens"),
    auto_target_savings_gate_failures: autoTargetEntries - verifiedAutoTargetEntries,
    auto_target_oracle_gate_failures: autoTargetEntries - verifiedAutoTargetOracleEntries
  };
}

export function formatSavingsLedgerReport(ledger) {
  const totals = ledger.totals;
  const rows = ledger.entries.slice(-12).map((entry) => (
    `- ${entry.label}: ${entry.gate_status}, ${formatSavingsBar(toDeliveredSavings(entry))}, kritische Anker ${entry.critical_anchor_retention_percent}%, Belege ${entry.source_evidence_coverage_percent}%`
  )).join("\n") || "- keine Einträge";

  return `
# SavingsLedgerV1

Pfad: ${ledger.path || "nicht gespeichert"}

- Einträge: ${formatNumber(totals.entries)}
- Verifizierte Packs: ${formatNumber(totals.verified_entries)}
- Qualitätsgegatede sparende Packs: ${formatNumber(totals.quality_gated_saving_entries)}
- Review-pflichtige Packs: ${formatNumber(totals.needs_review_entries)}
- Echte Ersparnis: ${formatSavingsBar({
    originalTokens: totals.original_tokens,
    compactTokens: totals.delivered_tokens,
    savedTokens: totals.delivered_saved_tokens,
    percent: totals.delivered_savings_percent
  })}
- Verifizierte gelieferte Ersparnis: ${formatSavingsBar({
    originalTokens: totals.verified_original_tokens,
    compactTokens: totals.verified_delivered_tokens,
    savedTokens: totals.verified_delivered_saved_tokens,
    percent: totals.verified_delivered_savings_percent
  })}
- Qualitätsgegatede positive Ersparnis: ${formatSavingsBar({
    originalTokens: totals.quality_gated_original_tokens,
    compactTokens: totals.quality_gated_delivered_tokens,
    savedTokens: totals.quality_gated_delivered_saved_tokens,
    percent: totals.quality_gated_delivered_savings_percent
  })}
- Kompakt-Kandidaten: ${formatSavingsBar({
    originalTokens: totals.original_tokens,
    compactTokens: totals.compact_tokens,
    savedTokens: totals.compact_saved_tokens,
    percent: totals.compact_savings_percent
  })}
- p95 gelieferte Tokens: ${formatNumber(totals.p95_delivered_tokens)}
- p95 gesparte Tokens: ${formatNumber(totals.p95_saved_tokens)}
- Schlechteste kritische Anker-Erhaltung: ${totals.minimum_critical_anchor_retention_percent}%
- Schlechteste Quellbeleg-Abdeckung: ${totals.minimum_source_evidence_coverage_percent}%
- Fallback-Rate: ${totals.fallback_rate_percent}% (${formatNumber(totals.fallback_count)} von ${formatNumber(totals.entries)})
- Erweiterte ContextPacks: ${formatNumber(totals.expanded_contexts)}
- Vollkontext-Fallbacks: ${formatNumber(totals.full_context_fallbacks)}
- Riskante Verdichtungen: ${formatNumber(totals.risky_compressions)}
- Auto-Target: ${formatNumber(totals.verified_auto_target_entries)}/${formatNumber(totals.auto_target_entries)} verifiziert, Oracle ${formatNumber(totals.verified_auto_target_oracle_entries)}/${formatNumber(totals.auto_target_entries)}, zusätzlich ca. ${formatNumber(totals.auto_target_additional_saved_tokens)} Tokens

## Letzte Einträge

${rows}
`.trim();
}

function receiptToLedgerEntry(receipt, options = {}) {
  const deliveredSavings = receipt.savings?.delivered ?? {
    saved_tokens: Math.max(0, Number(receipt.original_tokens) - Number(receipt.delivered_tokens)),
    percent: Number(receipt.ersparnis_prozent) || 0
  };
  const compactSavings = receipt.savings?.compact ?? {
    saved_tokens: Math.max(0, Number(receipt.original_tokens) - Number(receipt.compact_tokens)),
    percent: Number(receipt.compact_ersparnis_prozent) || 0
  };
  const sourceCoveragePercent = Math.round(Number(receipt.source_evidence?.coverage ?? 0) * 100);
  const autoTarget = receipt.context_selection?.auto_target || {};
  const entrySeed = [
    receipt.context_pack_id,
    receipt.created_at,
    receipt.source?.hash,
    receipt.delivered_tokens,
    receipt.gate?.status
  ].join(":");

  return {
    schema: "SavingsLedgerEntryV1",
    entry_id: `save-${sha256(entrySeed).slice(0, 12)}`,
    context_pack_id: receipt.context_pack_id,
    created_at: receipt.created_at,
    recorded_at: new Date().toISOString(),
    run_type: options.runType || "pack",
    note: options.note || "",
    label: receipt.source?.label || "ContextPack",
    source_hash: receipt.source?.hash || "",
    risk_profile: receipt.context_selection?.policy?.risk_profile || "",
    gate_status: receipt.gate?.status || "unknown",
    quality_status: receipt.quality?.status || "unknown",
    fallback_used: Boolean(receipt.fallback?.used),
    fallback_mode: receipt.fallback?.mode || "compact-context",
    original_tokens: Number(receipt.original_tokens) || 0,
    compact_tokens: Number(receipt.compact_tokens) || 0,
    delivered_tokens: Number(receipt.delivered_tokens) || 0,
    compact_saved_tokens: Number(compactSavings.saved_tokens) || 0,
    compact_savings_percent: Number(compactSavings.percent) || 0,
    delivered_saved_tokens: Number(deliveredSavings.saved_tokens) || 0,
    delivered_savings_percent: Number(deliveredSavings.percent) || 0,
    critical_anchor_retention_percent: Number(receipt.critical_anchors?.retention_percent) || 0,
    source_evidence_coverage_percent: sourceCoveragePercent,
    acceptance_oracle_success: receipt.acceptance_oracle?.enabled
      ? Boolean(receipt.acceptance_oracle?.delivered?.success)
      : null,
    acceptance_oracle_sensitivity_success: receipt.acceptance_oracle?.enabled
      ? Boolean(receipt.acceptance_oracle?.sensitivity?.delivered?.success)
      : null,
    auto_target_enabled: Boolean(autoTarget.enabled),
    auto_target_status: autoTarget.status || "not-used",
    auto_target_oracle_gate: autoTarget.oracle_gate || "not-used",
    auto_target_explicit_oracle_present: Boolean(autoTarget.explicit_oracle_present),
    auto_target_savings_gate: autoTarget.savings_gate || "not-used",
    auto_target_baseline_target_percent: Number(autoTarget.baseline_target_percent) || 0,
    auto_target_selected_target_percent: Number(autoTarget.selected_target_percent) || 0,
    auto_target_additional_saved_tokens: Number(autoTarget.additional_saved_tokens_vs_baseline) || 0,
    receipt_hash: `sha256:${sha256(JSON.stringify(receipt))}`
  };
}

async function readSavingsLedgerFile(ledgerPath) {
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

function normalizeReceiptInput(value) {
  const receipt = value?.receipt || value;
  if (!receipt || receipt.schema !== "ContextPackReceiptV1") {
    throw new Error("Expected a ContextPackReceiptV1 receipt or a pack object with .receipt.");
  }
  return receipt;
}

function resolveLedgerPath(root, ledgerPath) {
  if (path.isAbsolute(String(ledgerPath))) return String(ledgerPath);
  return path.resolve(root, String(ledgerPath));
}

function toDeliveredSavings(entry) {
  return {
    originalTokens: entry.original_tokens,
    compactTokens: entry.delivered_tokens,
    savedTokens: entry.delivered_saved_tokens,
    percent: entry.delivered_savings_percent
  };
}

function isQualityGatedSavingsEntry(entry) {
  return isQualityVerifiedSavingsEntry(entry)
    && QUALITY_GATED_SAVINGS_GATE_STATUSES.has(entry.gate_status)
    && hasPositiveDeliveredSavings(entry);
}

function isQualityVerifiedSavingsEntry(entry) {
  return QUALITY_VERIFIED_GATE_STATUSES.has(entry?.gate_status)
    && entry?.quality_status !== "riskant"
    && Number(entry?.critical_anchor_retention_percent) >= 100
    && Number(entry?.source_evidence_coverage_percent) >= 100;
}

function hasPositiveDeliveredSavings(entry) {
  const originalTokens = Number(entry?.original_tokens);
  const deliveredTokens = Number(entry?.delivered_tokens);
  const savedTokens = Number(entry?.delivered_saved_tokens);

  if (!Number.isFinite(originalTokens) || originalTokens <= 0) return false;
  if (Number.isFinite(deliveredTokens) && deliveredTokens >= 0 && deliveredTokens < originalTokens) return true;
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
