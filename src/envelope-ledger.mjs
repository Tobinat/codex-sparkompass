import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { formatNumber } from "./token-estimator.mjs";

export const DEFAULT_ENVELOPE_LEDGER_PATH = ".sparkompass/envelope-ledger.json";

export async function appendEnvelopeToLedger(rootPath, envelopeInput, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.out || options.ledger || DEFAULT_ENVELOPE_LEDGER_PATH);
  const ledger = await readEnvelopeLedgerFile(ledgerPath);
  const previousEntry = ledger.entries.at(-1) || null;
  const entry = envelopeToLedgerEntry(normalizeEnvelopeInput(envelopeInput), previousEntry, {
    runType: options.runType || "envelope",
    note: options.note || ""
  });
  const entries = [...ledger.entries, entry].sort((left, right) => (
    String(left.recorded_at).localeCompare(String(right.recorded_at))
  ));
  const nextLedger = buildEnvelopeLedger(entries, {
    root,
    path: ledgerPath
  });

  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");

  return {
    schema: "EnvelopeLedgerWriteResultV1",
    path: ledgerPath,
    entry,
    totals: nextLedger.totals
  };
}

export async function buildEnvelopeLedgerReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.ledger || options.out || DEFAULT_ENVELOPE_LEDGER_PATH);
  const ledger = await readEnvelopeLedgerFile(ledgerPath);

  return buildEnvelopeLedger(ledger.entries, {
    root,
    path: ledgerPath
  });
}

export async function loadEnvelopeJson(envelopePath) {
  const raw = await fs.readFile(path.resolve(envelopePath), "utf8");
  return normalizeEnvelopeInput(JSON.parse(raw));
}

export function buildEnvelopeLedger(entries = [], options = {}) {
  const normalizedEntries = entries.map((entry) => ({ ...entry }));
  const totals = summarizeEnvelopeLedger(normalizedEntries);

  return {
    schema: "ContextEnvelopeLedgerV1",
    ledger_id: `env-ledger-${sha256(`${options.path || ""}:${normalizedEntries.map((entry) => entry.entry_id).join("|")}`).slice(0, 12)}`,
    path: options.path || null,
    root: options.root || null,
    updated_at: new Date().toISOString(),
    totals,
    entries: normalizedEntries
  };
}

export function summarizeEnvelopeLedger(entries = []) {
  const totalReusablePrefixTokens = sum(entries, "reusable_prefix_tokens");
  const estimatedReusedPrefixTokens = sum(entries, "estimated_reused_prefix_tokens");
  const invalidatedPrefixTokens = sum(entries, "invalidated_prefix_tokens");

  return {
    entries: entries.length,
    verified_envelopes: entries.filter((entry) => entry.gate_status === "verified-envelope").length,
    prompt_tokens: sum(entries, "prompt_tokens"),
    reusable_prefix_tokens: totalReusablePrefixTokens,
    estimated_reused_prefix_tokens: estimatedReusedPrefixTokens,
    invalidated_prefix_tokens: invalidatedPrefixTokens,
    prefix_reuse_percent: percentage(estimatedReusedPrefixTokens, totalReusablePrefixTokens),
    full_prefix_reuse_count: entries.filter((entry) => entry.prefix_reuse_status === "full-prefix-reusable").length,
    static_prefix_only_reuse_count: entries.filter((entry) => entry.prefix_reuse_status === "static-prefix-only-reusable").length,
    prefix_changed_count: entries.filter((entry) => entry.prefix_reuse_status === "prefix-changed").length,
    not_compared_count: entries.filter((entry) => entry.prefix_reuse_status === "not-compared").length,
    p95_prompt_tokens: percentile(entries.map((entry) => entry.prompt_tokens), 95),
    p95_reusable_prefix_tokens: percentile(entries.map((entry) => entry.reusable_prefix_tokens), 95)
  };
}

export function formatEnvelopeLedgerReport(ledger) {
  const totals = ledger.totals;
  const rows = ledger.entries.slice(-12).map((entry) => (
    `- ${entry.goal}: ${entry.gate_status}, Prefix ${entry.prefix_reuse_status}, ${formatPrefixReuse(entry)}`
  )).join("\n") || "- keine Einträge";

  return `
# ContextEnvelopeLedgerV1

Pfad: ${ledger.path || "nicht gespeichert"}

- Einträge: ${formatNumber(totals.entries)}
- Verifizierte Envelopes: ${formatNumber(totals.verified_envelopes)}
- Prefix-Wiederverwendung: ${formatReuseBar(totals)}
- Voller Prefix wiederverwendet: ${formatNumber(totals.full_prefix_reuse_count)}
- Nur statischer Prefix wiederverwendet: ${formatNumber(totals.static_prefix_only_reuse_count)}
- Prefix geändert: ${formatNumber(totals.prefix_changed_count)}
- Nicht verglichen: ${formatNumber(totals.not_compared_count)}
- p95 Prompt-Tokens: ${formatNumber(totals.p95_prompt_tokens)}
- p95 wiederverwendbarer Prefix: ${formatNumber(totals.p95_reusable_prefix_tokens)}

## Letzte Einträge

${rows}
`.trim();
}

function envelopeToLedgerEntry(envelope, previousEntry, options = {}) {
  const reuse = buildEntryPrefixReuse(envelope, previousEntry);
  const seed = [
    envelope.generated_at,
    envelope.assembly?.full_prompt_hash,
    previousEntry?.entry_id || "",
    options.runType || "envelope"
  ].join(":");

  return {
    schema: "EnvelopeLedgerEntryV1",
    entry_id: `env-${sha256(seed).slice(0, 12)}`,
    envelope_hash: `sha256:${sha256(JSON.stringify({
      assembly: envelope.assembly,
      task_profile: envelope.task_profile,
      cache_metrics: envelope.cache_metrics
    }))}`,
    created_at: envelope.generated_at,
    recorded_at: new Date().toISOString(),
    run_type: options.runType || "envelope",
    note: options.note || "",
    goal: envelope.task_profile?.goal || "",
    gate_status: envelope.gate?.status || "unknown",
    plan_gate_status: envelope.plan?.gate?.status || "unknown",
    prompt_tokens: Number(envelope.cache_metrics?.prompt_estimated_tokens) || 0,
    reusable_prefix_tokens: Number(envelope.cache_metrics?.reusable_prefix_tokens) || 0,
    strict_static_prefix_tokens: Number(envelope.cache_metrics?.strict_static_prefix_tokens) || 0,
    variable_tail_tokens: Number(envelope.cache_metrics?.variable_tail_tokens) || 0,
    on_demand_index_tokens: Number(envelope.cache_metrics?.on_demand_index_tokens) || 0,
    stable_prefix_hash: envelope.assembly?.stable_prefix_hash || "",
    static_prefix_hash: envelope.assembly?.strict_static_prefix_hash || "",
    variable_tail_hash: envelope.assembly?.variable_tail_hash || "",
    full_prompt_hash: envelope.assembly?.full_prompt_hash || envelope.prompt?.hash || "",
    previous_entry_id: previousEntry?.entry_id || null,
    previous_stable_prefix_hash: previousEntry?.stable_prefix_hash || null,
    prefix_reuse_status: reuse.status,
    exact_stable_prefix_match: reuse.exact_stable_prefix_match,
    exact_static_prefix_match: reuse.exact_static_prefix_match,
    estimated_reused_prefix_tokens: reuse.estimated_reused_prefix_tokens,
    invalidated_prefix_tokens: reuse.invalidated_prefix_tokens,
    prefix_reuse_percent: reuse.prefix_reuse_percent
  };
}

function buildEntryPrefixReuse(envelope, previousEntry) {
  const currentReusableTokens = Number(envelope.cache_metrics?.reusable_prefix_tokens) || 0;
  const currentStaticTokens = Number(envelope.cache_metrics?.strict_static_prefix_tokens) || 0;
  if (!previousEntry) {
    return {
      status: "not-compared",
      exact_stable_prefix_match: null,
      exact_static_prefix_match: null,
      estimated_reused_prefix_tokens: 0,
      invalidated_prefix_tokens: currentReusableTokens,
      prefix_reuse_percent: 0
    };
  }

  const currentStableHash = envelope.assembly?.stable_prefix_hash || "";
  const currentStaticHash = envelope.assembly?.strict_static_prefix_hash || "";
  const exactStable = currentStableHash === previousEntry.stable_prefix_hash;
  const exactStatic = currentStaticHash === previousEntry.static_prefix_hash;
  const reused = exactStable ? currentReusableTokens : exactStatic ? currentStaticTokens : 0;

  return {
    status: exactStable
      ? "full-prefix-reusable"
      : exactStatic
        ? "static-prefix-only-reusable"
        : "prefix-changed",
    exact_stable_prefix_match: exactStable,
    exact_static_prefix_match: exactStatic,
    estimated_reused_prefix_tokens: reused,
    invalidated_prefix_tokens: Math.max(0, currentReusableTokens - reused),
    prefix_reuse_percent: percentage(reused, currentReusableTokens)
  };
}

async function readEnvelopeLedgerFile(ledgerPath) {
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

function normalizeEnvelopeInput(value) {
  const envelope = value?.envelope || value;
  if (!envelope || envelope.schema !== "ContextEnvelopeV1") {
    throw new Error("Expected a ContextEnvelopeV1 object.");
  }
  return envelope;
}

function resolveLedgerPath(root, ledgerPath) {
  if (path.isAbsolute(String(ledgerPath))) return String(ledgerPath);
  return path.resolve(root, String(ledgerPath));
}

function formatPrefixReuse(entry) {
  return `${formatNumber(entry.estimated_reused_prefix_tokens)} von ${formatNumber(entry.reusable_prefix_tokens)} Prefix-Tokens wiederverwendbar`;
}

function formatReuseBar(totals) {
  const percent = totals.prefix_reuse_percent;
  const width = 24;
  const filled = Math.round((Math.min(100, percent) / 100) * width);
  const empty = Math.max(0, width - filled);
  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${percent}% (${formatNumber(totals.estimated_reused_prefix_tokens)} von ${formatNumber(totals.reusable_prefix_tokens)} Prefix-Tokens)`;
}

function sum(entries, field) {
  return entries.reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
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
