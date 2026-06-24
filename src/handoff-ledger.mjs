import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { calculateSavings, formatSavingsBar } from "./savings.mjs";
import { formatNumber } from "./token-estimator.mjs";

export const DEFAULT_HANDOFF_LEDGER_PATH = ".sparkompass/handoff-ledger.json";

export async function appendHandoffToLedger(rootPath, receiptInput, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.out || options.ledger || DEFAULT_HANDOFF_LEDGER_PATH);
  const ledger = await readHandoffLedgerFile(ledgerPath);
  const entry = handoffToLedgerEntry(normalizeHandoffInput(receiptInput), {
    runType: options.runType || "handoff",
    note: options.note || ""
  });
  const entries = [
    ...ledger.entries.filter((candidate) => candidate.entry_id !== entry.entry_id),
    entry
  ].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  const nextLedger = buildHandoffLedger(entries, {
    root,
    path: ledgerPath
  });

  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");

  return {
    schema: "ContextHandoffLedgerWriteResultV1",
    path: ledgerPath,
    entry,
    totals: nextLedger.totals
  };
}

export async function buildHandoffLedgerReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.ledger || options.out || DEFAULT_HANDOFF_LEDGER_PATH);
  const ledger = await readHandoffLedgerFile(ledgerPath);

  return buildHandoffLedger(ledger.entries, {
    root,
    path: ledgerPath
  });
}

export async function loadHandoffReceiptJson(receiptPath) {
  const raw = await fs.readFile(path.resolve(receiptPath), "utf8");
  return normalizeHandoffInput(JSON.parse(raw));
}

export function buildHandoffLedger(entries = [], options = {}) {
  const normalizedEntries = entries.map((entry) => ({ ...entry }));
  const totals = summarizeHandoffLedger(normalizedEntries);

  return {
    schema: "ContextHandoffLedgerV1",
    ledger_id: `handoff-ledger-${sha256(`${options.path || ""}:${normalizedEntries.map((entry) => entry.entry_id).join("|")}`).slice(0, 12)}`,
    path: options.path || null,
    root: options.root || null,
    updated_at: new Date().toISOString(),
    totals,
    entries: normalizedEntries
  };
}

export function summarizeHandoffLedger(entries = []) {
  const inventoryTokens = sum(entries, "inventory_tokens");
  const startPromptTokens = sum(entries, "start_prompt_tokens");
  const savings = calculateSavings(inventoryTokens, startPromptTokens);

  return {
    entries: entries.length,
    verified_handoffs: entries.filter((entry) => entry.gate_status === "verified-handoff").length,
    needs_review_handoffs: entries.filter((entry) => entry.gate_status !== "verified-handoff").length,
    inventory_tokens: inventoryTokens,
    start_prompt_tokens: startPromptTokens,
    start_context_saved_tokens: savings.savedTokens,
    start_context_savings_percent: savings.percent,
    selected_context_saved_tokens: sum(entries, "selected_context_saved_tokens"),
    on_demand_index_tokens: sum(entries, "on_demand_index_tokens"),
    deferred_relevant_tokens: sum(entries, "deferred_relevant_tokens"),
    on_demand_evidence_count: sum(entries, "on_demand_evidence_count"),
    reusable_prefix_tokens: sum(entries, "reusable_prefix_tokens"),
    variable_tail_tokens: sum(entries, "variable_tail_tokens"),
    prompt_cache_ready_count: entries.filter((entry) => entry.prompt_cache_status === "prefix-meets-estimated-threshold").length,
    prompt_cache_below_threshold_count: entries.filter((entry) => entry.prompt_cache_status === "prefix-below-estimated-threshold").length,
    p95_start_prompt_tokens: percentile(entries.map((entry) => entry.start_prompt_tokens), 95),
    p95_saved_tokens: percentile(entries.map((entry) => entry.start_context_saved_tokens), 95),
    blocked_handoffs: entries.filter((entry) => entry.blocking_warnings.length > 0).length
  };
}

export function formatHandoffLedgerReport(ledger) {
  const totals = ledger.totals;
  const rows = ledger.entries.slice(-12).map((entry) => (
    `- ${entry.goal}: ${entry.gate_status}, ${formatSavingsBar(toStartSavings(entry))}, Nachlade-Belege ${formatNumber(entry.on_demand_evidence_count)}`
  )).join("\n") || "- keine Einträge";

  return `
# ContextHandoffLedgerV1

Pfad: ${ledger.path || "nicht gespeichert"}

- Einträge: ${formatNumber(totals.entries)}
- Verifizierte Handoffs: ${formatNumber(totals.verified_handoffs)}
- Review-pflichtige Handoffs: ${formatNumber(totals.needs_review_handoffs)}
- Geschätzte Startkontext-Ersparnis: ${formatSavingsBar({
    originalTokens: totals.inventory_tokens,
    compactTokens: totals.start_prompt_tokens,
    savedTokens: totals.start_context_saved_tokens,
    percent: totals.start_context_savings_percent
  })}
- p95 Startprompt-Tokens: ${formatNumber(totals.p95_start_prompt_tokens)}
- p95 gesparte Starttokens: ${formatNumber(totals.p95_saved_tokens)}
- Nachladbare Evidence-Refs: ${formatNumber(totals.on_demand_evidence_count)}
- Prompt-Cache bereit/unter Schwelle: ${formatNumber(totals.prompt_cache_ready_count)}/${formatNumber(totals.prompt_cache_below_threshold_count)}
- Blockierte Handoffs: ${formatNumber(totals.blocked_handoffs)}

## Letzte Einträge

${rows}
`.trim();
}

function handoffToLedgerEntry(receipt, options = {}) {
  const savings = receipt.savings || {};
  const quality = receipt.quality_contract || {};
  const promptCache = receipt.prompt_cache_layout || {};
  const seed = [
    receipt.handoff_id,
    receipt.generated_at,
    receipt.handoff?.full_prompt_hash,
    receipt.gate?.status
  ].join(":");

  return {
    schema: "ContextHandoffLedgerEntryV1",
    entry_id: `handoff-entry-${sha256(seed).slice(0, 12)}`,
    handoff_id: receipt.handoff_id,
    handoff_hash: `sha256:${sha256(JSON.stringify({
      task_profile: receipt.task_profile,
      handoff: receipt.handoff,
      savings: receipt.savings,
      quality_contract: receipt.quality_contract
    }))}`,
    created_at: receipt.generated_at,
    recorded_at: new Date().toISOString(),
    run_type: options.runType || "handoff",
    note: options.note || "",
    goal: receipt.task_profile?.goal || "",
    risk_profile: receipt.task_profile?.risk_profile || "",
    gate_status: receipt.gate?.status || "unknown",
    readiness_status: receipt.gate?.readiness_status || "unknown",
    blocking_warnings: receipt.gate?.blocking_warnings || [],
    warnings: receipt.gate?.warnings || [],
    plan_gate_status: quality.plan_gate || "unknown",
    envelope_gate_status: quality.envelope_gate || "unknown",
    requirements_status: quality.requirements_status || "not-set",
    must_survive_total: Number(quality.must_survive?.total) || 0,
    must_survive_covered: Number(quality.must_survive?.covered) || 0,
    must_survive_missing: quality.must_survive?.missing || [],
    inventory_tokens: Number(savings.inventory_tokens) || 0,
    start_prompt_tokens: Number(savings.start_prompt_tokens) || 0,
    immediate_context_tokens: Number(savings.immediate_context_tokens) || 0,
    deferred_relevant_tokens: Number(savings.deferred_relevant_tokens) || 0,
    on_demand_index_tokens: Number(savings.on_demand_index_tokens) || 0,
    start_context_saved_tokens: Number(savings.start_context_saved_tokens) || 0,
    start_context_savings_percent: Number(savings.start_context_savings_percent) || 0,
    selected_context_saved_tokens: Number(savings.selected_context_saved_tokens) || 0,
    selected_context_savings_percent: Number(savings.selected_context_savings_percent) || 0,
    prompt_cache_status: promptCache.status || "unknown",
    prefix_reuse_status: promptCache.prefix_reuse_status || "unknown",
    reusable_prefix_tokens: Number(promptCache.reusable_prefix_tokens) || 0,
    variable_tail_tokens: Number(promptCache.variable_tail_tokens) || 0,
    reusable_prefix_percent: Number(promptCache.reusable_prefix_percent) || 0,
    immediate_evidence_count: Number(quality.immediate_evidence_count) || 0,
    on_demand_evidence_count: Number(quality.on_demand_evidence_count) || 0,
    stable_prefix_hash: receipt.handoff?.stable_prefix_hash || "",
    variable_tail_hash: receipt.handoff?.variable_tail_hash || "",
    on_demand_index_hash: receipt.handoff?.on_demand_index_hash || "",
    full_prompt_hash: receipt.handoff?.full_prompt_hash || receipt.start_prompt?.hash || ""
  };
}

async function readHandoffLedgerFile(ledgerPath) {
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

function normalizeHandoffInput(value) {
  const receipt = value?.schema === "ContextHandoffReceiptV1"
    ? value
    : value?.receipt?.schema === "ContextHandoffReceiptV1"
      ? value.receipt
      : value?.handoff?.schema === "ContextHandoffReceiptV1"
        ? value.handoff
        : value;
  if (!receipt || receipt.schema !== "ContextHandoffReceiptV1") {
    throw new Error("Expected a ContextHandoffReceiptV1 object.");
  }
  return receipt;
}

function toStartSavings(entry) {
  return {
    originalTokens: entry.inventory_tokens,
    compactTokens: entry.start_prompt_tokens,
    savedTokens: entry.start_context_saved_tokens,
    percent: entry.start_context_savings_percent
  };
}

function resolveLedgerPath(root, ledgerPath) {
  if (path.isAbsolute(String(ledgerPath))) return String(ledgerPath);
  return path.resolve(root, String(ledgerPath));
}

function sum(entries, field) {
  return entries.reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
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
