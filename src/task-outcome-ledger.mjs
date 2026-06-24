import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { formatNumber } from "./token-estimator.mjs";

export const DEFAULT_TASK_OUTCOME_LEDGER_PATH = ".sparkompass/task-outcome-ledger.json";

export async function appendTaskOutcomeToLedger(rootPath, outcomeInput, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.out || options.ledger || DEFAULT_TASK_OUTCOME_LEDGER_PATH);
  const ledger = await readTaskOutcomeLedgerFile(ledgerPath);
  const entry = taskOutcomeToLedgerEntry(normalizeTaskOutcomeInput(outcomeInput), {
    runType: options.runType || "task-outcome",
    note: options.note || ""
  });
  const entries = [
    ...ledger.entries.filter((candidate) => candidate.entry_id !== entry.entry_id),
    entry
  ].sort((left, right) => String(left.checked_at).localeCompare(String(right.checked_at)));
  const nextLedger = buildTaskOutcomeLedger(entries, {
    root,
    path: ledgerPath
  });

  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");

  return {
    schema: "TaskOutcomeLedgerWriteResultV1",
    path: ledgerPath,
    entry,
    totals: nextLedger.totals
  };
}

export async function buildTaskOutcomeLedgerReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.ledger || options.out || DEFAULT_TASK_OUTCOME_LEDGER_PATH);
  const ledger = await readTaskOutcomeLedgerFile(ledgerPath);

  return buildTaskOutcomeLedger(ledger.entries, {
    root,
    path: ledgerPath
  });
}

export async function loadTaskOutcomeJson(outcomePath) {
  const raw = await fs.readFile(path.resolve(outcomePath), "utf8");
  return normalizeTaskOutcomeInput(JSON.parse(raw));
}

export function buildTaskOutcomeLedger(entries = [], options = {}) {
  const normalizedEntries = entries.map((entry) => ({ ...entry }));
  const totals = summarizeTaskOutcomeLedger(normalizedEntries);

  return {
    schema: "TaskOutcomeLedgerV1",
    ledger_id: `task-outcome-ledger-${sha256(`${options.path || ""}:${normalizedEntries.map((entry) => entry.entry_id).join("|")}`).slice(0, 12)}`,
    path: options.path || null,
    root: options.root || null,
    updated_at: new Date().toISOString(),
    totals,
    entries: normalizedEntries
  };
}

export function summarizeTaskOutcomeLedger(entries = []) {
  const verifiedTasks = entries.filter((entry) => entry.gate_status === "verified-task-outcome").length;
  const reviewTasks = entries.length - verifiedTasks;
  const reviewEntries = entries.filter((entry) => entry.gate_status !== "verified-task-outcome");
  const totalOutputTokens = sum(entries, "output_tokens");
  const verifiedOutputTokens = sum(entries.filter((entry) => entry.gate_status === "verified-task-outcome"), "output_tokens");
  const linkedContextTokens = sum(entries, "context_pack_delivered_tokens");
  const verifiedLinkedContextTokens = sum(entries.filter((entry) => entry.gate_status === "verified-task-outcome"), "context_pack_delivered_tokens");

  return {
    entries: entries.length,
    verified_tasks: verifiedTasks,
    needs_review_tasks: reviewTasks,
    verification_rate_percent: entries.length ? Math.round((verifiedTasks / entries.length) * 100) : 0,
    review_rate_percent: entries.length ? Math.round((reviewTasks / entries.length) * 100) : 0,
    failed_exit_tasks: entries.filter((entry) => !entry.command_exit_success).length,
    output_oracle_failures: entries.filter((entry) => entry.output_oracle_enabled && !entry.output_oracle_success).length,
    receipt_verification_failures: entries.filter((entry) => entry.context_pack_id && !entry.receipt_verification_success).length,
    timed_out_tasks: entries.filter((entry) => entry.timed_out).length,
    linked_context_packs: entries.filter((entry) => entry.context_pack_id).length,
    total_output_tokens: totalOutputTokens,
    verified_output_tokens: verifiedOutputTokens,
    p95_output_tokens: percentile(entries.map((entry) => entry.output_tokens), 95),
    output_tokens_per_verified_task: verifiedTasks ? Math.round(verifiedOutputTokens / verifiedTasks) : 0,
    context_pack_delivered_tokens: linkedContextTokens,
    verified_context_pack_delivered_tokens: verifiedLinkedContextTokens,
    context_tokens_per_verified_task: verifiedTasks ? Math.round(verifiedLinkedContextTokens / verifiedTasks) : 0,
    p95_context_pack_delivered_tokens: percentile(entries.map((entry) => entry.context_pack_delivered_tokens), 95),
    average_duration_ms: entries.length ? Math.round(sum(entries, "duration_ms") / entries.length) : 0,
    p95_duration_ms: percentile(entries.map((entry) => entry.duration_ms), 95),
    review_reasons: summarizeReviewReasons(reviewEntries)
  };
}

export function formatTaskOutcomeLedgerReport(ledger) {
  const totals = ledger.totals;
  const rows = ledger.entries.slice(-12).map((entry) => (
    `- ${entry.command_text}: ${entry.gate_status}, Exit ${entry.exit_code}/${entry.expected_exit_code}, Output ${formatNumber(entry.output_tokens)} Tokens`
  )).join("\n") || "- keine Einträge";

  return `
# TaskOutcomeLedgerV1

Pfad: ${ledger.path || "nicht gespeichert"}

- Einträge: ${formatNumber(totals.entries)}
- Verifizierte Tasks: ${formatNumber(totals.verified_tasks)}
- Review-pflichtige Tasks: ${formatNumber(totals.needs_review_tasks)}
- Verifikationsrate: ${formatNumber(totals.verification_rate_percent)}%
- Exit-Code-Fehler: ${formatNumber(totals.failed_exit_tasks)}
- Output-Orakel-Fehler: ${formatNumber(totals.output_oracle_failures)}
- Receipt-Verifikations-Fehler: ${formatNumber(totals.receipt_verification_failures)}
- Timeouts: ${formatNumber(totals.timed_out_tasks)}
- Verknüpfte ContextPacks: ${formatNumber(totals.linked_context_packs)}
- Output-Tokens pro verifiziertem Task: ${formatNumber(totals.output_tokens_per_verified_task)}
- ContextPack-Tokens pro verifiziertem Task: ${formatNumber(totals.context_tokens_per_verified_task)}
- p95 Output-Tokens: ${formatNumber(totals.p95_output_tokens)}
- p95 ContextPack-Tokens: ${formatNumber(totals.p95_context_pack_delivered_tokens)}
- p95 Dauer: ${formatNumber(totals.p95_duration_ms)} ms
- Review-Gründe: ${formatReviewReasons(totals.review_reasons)}

## Letzte Einträge

${rows}
`.trim();
}

function taskOutcomeToLedgerEntry(outcome, options = {}) {
  const receiptVerification = outcome.context_pack?.receipt_verification || null;
  const outputOracle = outcome.output_oracle || {};
  const outputOracleResult = outputOracle.result || {};
  const gate = outcome.gate || {};
  const seed = [
    outcome.task_id,
    outcome.checked_at,
    outcome.result?.combined?.hash,
    gate.status
  ].join(":");

  return {
    schema: "TaskOutcomeLedgerEntryV1",
    entry_id: `task-ledger-${sha256(seed).slice(0, 12)}`,
    task_id: outcome.task_id,
    task_hash: `sha256:${sha256(JSON.stringify({
      command: outcome.command,
      result: outcome.result,
      output_oracle: outcome.output_oracle,
      context_pack: outcome.context_pack,
      gate: outcome.gate
    }))}`,
    checked_at: outcome.checked_at,
    recorded_at: new Date().toISOString(),
    run_type: options.runType || "task-outcome",
    note: options.note || "",
    command_text: outcome.command?.text || "",
    cwd: outcome.command?.cwd || "",
    expected_exit_code: normalizeNumber(outcome.command?.expected_exit_code),
    exit_code: normalizeNumber(outcome.result?.exit_code),
    command_exit_success: Boolean(gate.requirements?.command_exit_success),
    timed_out: Boolean(outcome.result?.timed_out),
    duration_ms: normalizeNumber(outcome.result?.duration_ms),
    truncated: Boolean(outcome.result?.truncated),
    output_hash: outcome.result?.combined?.hash || "",
    output_bytes: normalizeNumber(outcome.result?.combined?.bytes),
    output_tokens: normalizeNumber(outcome.result?.combined?.estimated_tokens),
    output_oracle_enabled: Boolean(outputOracle.enabled),
    output_oracle_success: outputOracle.enabled ? Boolean(outputOracleResult.success) : true,
    output_oracle_matched: normalizeNumber(outputOracleResult.matched_count),
    output_oracle_total: normalizeNumber(outputOracleResult.total),
    gate_status: gate.status || "unknown",
    gate_verified: Boolean(gate.verified),
    gate_reasons: gate.reasons || [],
    context_pack_id: outcome.context_pack?.context_pack_id || "",
    receipt_verification_status: receiptVerification?.status || "",
    receipt_verification_success: outcome.context_pack ? Boolean(receiptVerification?.verified) : true,
    context_pack_gate_status: receiptVerification?.summary?.gate_status || "",
    context_pack_delivered_tokens: normalizeNumber(receiptVerification?.summary?.delivered_tokens),
    task_outcome_hash: `sha256:${sha256(JSON.stringify(outcome))}`
  };
}

async function readTaskOutcomeLedgerFile(ledgerPath) {
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

function normalizeTaskOutcomeInput(value) {
  const outcome = value?.outcome?.schema === "TaskOutcomeReceiptV1"
    ? value.outcome
    : value?.receipt?.schema === "TaskOutcomeReceiptV1"
      ? value.receipt
      : value;
  if (!outcome || outcome.schema !== "TaskOutcomeReceiptV1") {
    throw new Error("Expected a TaskOutcomeReceiptV1 object.");
  }
  return outcome;
}

function resolveLedgerPath(root, ledgerPath) {
  if (path.isAbsolute(String(ledgerPath))) return String(ledgerPath);
  return path.resolve(root, String(ledgerPath));
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
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

function summarizeReviewReasons(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const reasons = Array.isArray(entry.gate_reasons) && entry.gate_reasons.length
      ? entry.gate_reasons
      : [entry.gate_status || "unknown"];
    for (const reason of reasons) {
      const key = String(reason || "unknown");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 8);
}

function formatReviewReasons(reasons = []) {
  if (!reasons.length) return "keine";
  return reasons.map((item) => `${item.reason} (${formatNumber(item.count)})`).join(", ");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
