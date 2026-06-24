import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { formatNumber } from "./token-estimator.mjs";

export const DEFAULT_CODEX_USAGE_LEDGER_PATH = ".sparkompass/codex-usage-ledger.json";

export async function recordCodexUsageFromJsonl(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const filePath = resolveAgainstRoot(root, options.file || options.jsonl || "");
  if (!filePath) {
    throw new Error("Bitte JSONL-Datei angeben: sparkompass codex-usage record --file codex-run.jsonl");
  }
  const text = await fs.readFile(filePath, "utf8");
  const receipt = buildCodexUsageReceipt(text, {
    sourceFile: filePath,
    label: options.label || path.basename(filePath),
    note: options.note || ""
  });
  const ledgerWrite = options.ledger
    ? await appendCodexUsageToLedger(root, receipt, {
      out: options.ledger === true ? DEFAULT_CODEX_USAGE_LEDGER_PATH : String(options.ledger),
      runType: options.runType || "codex-exec-jsonl",
      note: options.note || ""
    })
    : null;

  return ledgerWrite ? { ...receipt, ledger: ledgerWrite } : receipt;
}

export function buildCodexUsageReceipt(jsonlText, options = {}) {
  const lines = String(jsonlText || "").split(/\r\n|\r|\n/);
  const events = [];
  const parseErrors = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      parseErrors.push({ line: index + 1, message: error.message });
      continue;
    }
    const event = extractUsageEvent(parsed, index + 1);
    if (event) events.push(event);
  }

  const totals = summarizeUsageEvents(events);
  const invariants = buildUsageInvariants(totals, events);
  const reasons = [];
  if (!events.length) reasons.push("no-turn-completed-usage-events");
  if (parseErrors.length) reasons.push("jsonl-parse-errors");
  if (events.length && totals.total_tokens <= 0) reasons.push("zero-token-usage");
  for (const reason of invariants.failed_gate_reasons) {
    reasons.push(reason);
  }

  return {
    schema: "CodexOfficialUsageReceiptV1",
    recorded_at: new Date().toISOString(),
    receipt_id: `codex-usage-${sha256(`${options.sourceFile || ""}:${jsonlText}`).slice(0, 12)}`,
    source: {
      kind: "codex-exec-jsonl",
      file: options.sourceFile ? path.resolve(String(options.sourceFile)) : null,
      label: options.label || options.sourceFile || "codex-jsonl",
      raw_sha256: `sha256:${sha256(jsonlText)}`,
      lines: lines.filter((line) => line.trim()).length,
      parse_errors: parseErrors
    },
    official_usage: {
      scope: "codex-turn-completed-events",
      caveat: "Aus dokumentierten Codex-JSONL-Usage-Events gelesen; keine Preis- oder Rechnungsberechnung. Gesamt-Tokens = input_tokens + output_tokens; cached_input_tokens und reasoning_output_tokens sind Unterkategorien und werden nicht doppelt addiert.",
      totals,
      invariants,
      events
    },
    gate: {
      status: reasons.length ? "codex-usage-needs-review" : "verified-codex-official-usage",
      verified: reasons.length === 0,
      reasons
    }
  };
}

export async function appendCodexUsageToLedger(rootPath, receiptInput, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.out || options.ledger || DEFAULT_CODEX_USAGE_LEDGER_PATH);
  const ledger = await readCodexUsageLedgerFile(ledgerPath);
  const entry = codexUsageToLedgerEntry(normalizeCodexUsageReceipt(receiptInput), {
    runType: options.runType || "codex-usage",
    note: options.note || ""
  });
  const entries = [
    ...ledger.entries.filter((candidate) => candidate.entry_id !== entry.entry_id),
    entry
  ].sort((left, right) => String(left.recorded_at).localeCompare(String(right.recorded_at)));
  const nextLedger = buildCodexUsageLedger(entries, {
    root,
    path: ledgerPath
  });

  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.writeFile(ledgerPath, `${JSON.stringify(nextLedger, null, 2)}\n`, "utf8");

  return {
    schema: "CodexOfficialUsageLedgerWriteResultV1",
    path: ledgerPath,
    entry,
    totals: nextLedger.totals
  };
}

export async function buildCodexUsageLedgerReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const ledgerPath = resolveLedgerPath(root, options.ledger || options.out || DEFAULT_CODEX_USAGE_LEDGER_PATH);
  const ledger = await readCodexUsageLedgerFile(ledgerPath);

  return buildCodexUsageLedger(ledger.entries, {
    root,
    path: ledgerPath
  });
}

export async function compareCodexUsageFiles(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const baselinePath = resolveAgainstRoot(root, options.baseline || "");
  const optimizedPath = resolveAgainstRoot(root, options.optimized || "");
  if (!baselinePath || !optimizedPath) {
    throw new Error("Bitte Baseline und optimierte JSONL-Datei angeben: sparkompass codex-usage compare --baseline raw.jsonl --optimized compact.jsonl");
  }

  const [baselineText, optimizedText] = await Promise.all([
    fs.readFile(baselinePath, "utf8"),
    fs.readFile(optimizedPath, "utf8")
  ]);

  return compareCodexUsageReceipts(
    buildCodexUsageReceipt(baselineText, {
      sourceFile: baselinePath,
      label: options.baselineLabel || path.basename(baselinePath)
    }),
    buildCodexUsageReceipt(optimizedText, {
      sourceFile: optimizedPath,
      label: options.optimizedLabel || path.basename(optimizedPath)
    }),
    options
  );
}

export function compareCodexUsageReceipts(baseline, optimized, options = {}) {
  const baselineReceipt = normalizeCodexUsageReceipt(baseline);
  const optimizedReceipt = normalizeCodexUsageReceipt(optimized);
  const baselineTotals = baselineReceipt.official_usage.totals;
  const optimizedTotals = optimizedReceipt.official_usage.totals;
  const totalSavedTokens = baselineTotals.total_tokens - optimizedTotals.total_tokens;
  const inputSavedTokens = baselineTotals.input_tokens - optimizedTotals.input_tokens;
  const uncachedBaselineInput = Math.max(0, baselineTotals.input_tokens - baselineTotals.cached_input_tokens);
  const uncachedOptimizedInput = Math.max(0, optimizedTotals.input_tokens - optimizedTotals.cached_input_tokens);
  const uncachedInputSavedTokens = uncachedBaselineInput - uncachedOptimizedInput;
  const reasons = [];

  if (!baselineReceipt.gate.verified) reasons.push(`baseline:${baselineReceipt.gate.status}`);
  if (!optimizedReceipt.gate.verified) reasons.push(`optimized:${optimizedReceipt.gate.status}`);
  if (totalSavedTokens < 0) reasons.push("optimized-used-more-total-tokens");

  return {
    schema: "CodexOfficialUsageComparisonV1",
    compared_at: new Date().toISOString(),
    comparison_id: `codex-usage-compare-${sha256(`${baselineReceipt.receipt_id}:${optimizedReceipt.receipt_id}`).slice(0, 12)}`,
    labels: {
      baseline: options.baselineLabel || baselineReceipt.source.label,
      optimized: options.optimizedLabel || optimizedReceipt.source.label
    },
    baseline: summarizeReceiptForComparison(baselineReceipt),
    optimized: summarizeReceiptForComparison(optimizedReceipt),
    savings: {
      total_saved_tokens: totalSavedTokens,
      total_savings_percent: baselineTotals.total_tokens ? Math.round((totalSavedTokens / baselineTotals.total_tokens) * 100) : 0,
      input_saved_tokens: inputSavedTokens,
      input_savings_percent: baselineTotals.input_tokens ? Math.round((inputSavedTokens / baselineTotals.input_tokens) * 100) : 0,
      uncached_input_saved_tokens: uncachedInputSavedTokens,
      uncached_input_savings_percent: uncachedBaselineInput ? Math.round((uncachedInputSavedTokens / uncachedBaselineInput) * 100) : 0,
      output_saved_tokens: baselineTotals.output_tokens - optimizedTotals.output_tokens,
      reasoning_output_saved_tokens: baselineTotals.reasoning_output_tokens - optimizedTotals.reasoning_output_tokens
    },
    gate: {
      status: reasons.length ? "codex-usage-comparison-needs-review" : "verified-codex-official-usage-comparison",
      verified: reasons.length === 0,
      reasons
    },
    caveat: "Vergleicht dokumentierte Codex-Usage-Events zweier Läufe. Aussagekräftig nur, wenn Aufgabe, Modell, Workspace und Laufbedingungen vergleichbar sind."
  };
}

export function formatCodexUsageComparisonReport(comparison) {
  const savings = comparison.savings;
  return `
# CodexOfficialUsageComparisonV1

Status: ${comparison.gate.status}

- Baseline: ${comparison.labels.baseline}, ${formatNumber(comparison.baseline.total_tokens)} Gesamt-Tokens
- Optimiert: ${comparison.labels.optimized}, ${formatNumber(comparison.optimized.total_tokens)} Gesamt-Tokens
- Offiziell gemessene Gesamt-Ersparnis: ${formatNumber(savings.total_saved_tokens)} Tokens (${formatNumber(savings.total_savings_percent)}%)
- Input-Ersparnis: ${formatNumber(savings.input_saved_tokens)} Tokens (${formatNumber(savings.input_savings_percent)}%)
- Nicht gecachter Input gespart: ${formatNumber(savings.uncached_input_saved_tokens)} Tokens (${formatNumber(savings.uncached_input_savings_percent)}%)
- Output-Ersparnis: ${formatNumber(savings.output_saved_tokens)} Tokens
- Reasoning-Output-Ersparnis: ${formatNumber(savings.reasoning_output_saved_tokens)} Tokens

## Gate-Probleme

${comparison.gate.reasons.length ? comparison.gate.reasons.map((reason) => `- ${reason}`).join("\n") : "- keine"}

Hinweis: ${comparison.caveat}
`.trim();
}

export function buildCodexUsageLedger(entries = [], options = {}) {
  const normalizedEntries = entries.map(normalizeLedgerEntry);
  const totals = summarizeLedgerEntries(normalizedEntries);

  return {
    schema: "CodexOfficialUsageLedgerV1",
    ledger_id: `codex-usage-ledger-${sha256(`${options.path || ""}:${normalizedEntries.map((entry) => entry.entry_id).join("|")}`).slice(0, 12)}`,
    path: options.path || null,
    root: options.root || null,
    updated_at: new Date().toISOString(),
    totals,
    entries: normalizedEntries
  };
}

export function formatCodexUsageReceipt(receipt) {
  const totals = receipt.official_usage.totals;
  return `
# CodexOfficialUsageReceiptV1

Status: ${receipt.gate.status}
Quelle: ${receipt.source.file || receipt.source.label}

- Usage-Events: ${formatNumber(totals.events)}
- Input-Tokens: ${formatNumber(totals.input_tokens)}
- Cached-Input-Tokens: ${formatNumber(totals.cached_input_tokens)}
- Output-Tokens: ${formatNumber(totals.output_tokens)}
- Reasoning-Output-Tokens: ${formatNumber(totals.reasoning_output_tokens)}
- Gesamt-Tokens: ${formatNumber(totals.total_tokens)}
- Cache-Anteil am Input: ${formatNumber(totals.cached_input_percent)}%
- Usage-Invarianten: ${receipt.official_usage.invariants.status}
- Rohdaten-Hash: ${receipt.source.raw_sha256}
- Parse-Fehler: ${formatNumber(receipt.source.parse_errors.length)}

## Gate-Probleme

${receipt.gate.reasons.length ? receipt.gate.reasons.map((reason) => `- ${reason}`).join("\n") : "- keine"}

Hinweis: Diese Werte stammen aus dokumentierten Codex-Usage-Events. Sie sind offizieller als lokale Schätzungen, aber weiterhin keine Preis- oder Rechnungsberechnung.
`.trim();
}

export function formatCodexUsageLedgerReport(ledger) {
  const totals = ledger.totals;
  const rows = ledger.entries.slice(-12).map((entry) => (
    `- ${entry.label}: ${entry.gate_status}, ${formatNumber(entry.total_tokens)} Tokens (${formatNumber(entry.input_tokens)} Input, ${formatNumber(entry.cached_input_tokens)} cached, ${formatNumber(entry.output_tokens)} Output)`
  )).join("\n") || "- keine Einträge";

  return `
# CodexOfficialUsageLedgerV1

Pfad: ${ledger.path || "nicht gespeichert"}

- Einträge: ${formatNumber(totals.entries)}
- Verifizierte Usage-Belege: ${formatNumber(totals.verified_entries)}
- Review-pflichtige Belege: ${formatNumber(totals.needs_review_entries)}
- Usage-Events: ${formatNumber(totals.events)}
- Input-Tokens: ${formatNumber(totals.input_tokens)}
- Cached-Input-Tokens: ${formatNumber(totals.cached_input_tokens)}
- Output-Tokens: ${formatNumber(totals.output_tokens)}
- Reasoning-Output-Tokens: ${formatNumber(totals.reasoning_output_tokens)}
- Gesamt-Tokens: ${formatNumber(totals.total_tokens)}
- Cache-Anteil am Input: ${formatNumber(totals.cached_input_percent)}%
- p95 Gesamt-Tokens pro Beleg: ${formatNumber(totals.p95_total_tokens)}
- Review-Gründe: ${formatReviewReasons(totals.review_reasons)}

## Letzte Einträge

${rows}
`.trim();
}

function extractUsageEvent(event, line) {
  const candidates = [
    event,
    event?.payload,
    event?.payload?.event,
    event?.event,
    event?.item,
    event?.data
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.type === "turn.completed" && candidate.usage) {
      return normalizeUsageEvent(candidate, { line, raw: event });
    }
  }

  return null;
}

function normalizeUsageEvent(event, options = {}) {
  const usage = event.usage || {};
  const inputTokens = normalizeNumber(usage.input_tokens);
  const cachedInputTokens = normalizeNumber(usage.cached_input_tokens);
  const outputTokens = normalizeNumber(usage.output_tokens);
  const reasoningOutputTokens = normalizeNumber(usage.reasoning_output_tokens);

  return {
    event_id: `codex-turn-${sha256(JSON.stringify({ line: options.line, usage, event })).slice(0, 12)}`,
    line: options.line,
    type: event.type,
    thread_id: event.thread_id || event.threadId || "",
    turn_id: event.turn_id || event.turnId || "",
    model: event.model || event.model_id || "",
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_tokens: inputTokens + outputTokens,
    raw_event_hash: `sha256:${sha256(JSON.stringify(options.raw || event))}`
  };
}

function summarizeUsageEvents(events = []) {
  const inputTokens = sum(events, "input_tokens");
  const cachedInputTokens = sum(events, "cached_input_tokens");
  const outputTokens = sum(events, "output_tokens");
  const reasoningOutputTokens = sum(events, "reasoning_output_tokens");
  const totalTokens = inputTokens + outputTokens;

  return {
    events: events.length,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_tokens: totalTokens,
    total_tokens_formula: "input_tokens + output_tokens",
    cached_input_percent: inputTokens ? Math.round((cachedInputTokens / inputTokens) * 100) : 0,
    p95_total_tokens: percentile(events.map((event) => event.total_tokens), 95)
  };
}

function buildUsageInvariants(totals = {}, events = []) {
  const totalChecks = [
    invariantCheck({
      id: "cached_input_tokens_lte_input_tokens",
      scope: "totals",
      expression: "cached_input_tokens <= input_tokens",
      left: totals.cached_input_tokens,
      right: totals.input_tokens,
      reason: "cached-input-exceeds-input"
    }),
    invariantCheck({
      id: "reasoning_output_tokens_lte_output_tokens",
      scope: "totals",
      expression: "reasoning_output_tokens <= output_tokens",
      left: totals.reasoning_output_tokens,
      right: totals.output_tokens,
      reason: "reasoning-output-exceeds-output"
    }),
    invariantCheck({
      id: "total_tokens_eq_input_plus_output",
      scope: "totals",
      expression: "total_tokens == input_tokens + output_tokens",
      left: totals.total_tokens,
      right: normalizeNumber(totals.input_tokens) + normalizeNumber(totals.output_tokens),
      operator: "eq",
      reason: "total-tokens-formula-mismatch"
    })
  ];
  const eventChecks = events.flatMap((event) => [
    invariantCheck({
      id: "event_cached_input_tokens_lte_input_tokens",
      scope: "event",
      event_id: event.event_id,
      line: event.line,
      expression: "cached_input_tokens <= input_tokens",
      left: event.cached_input_tokens,
      right: event.input_tokens,
      reason: "usage-event-cached-input-exceeds-input"
    }),
    invariantCheck({
      id: "event_reasoning_output_tokens_lte_output_tokens",
      scope: "event",
      event_id: event.event_id,
      line: event.line,
      expression: "reasoning_output_tokens <= output_tokens",
      left: event.reasoning_output_tokens,
      right: event.output_tokens,
      reason: "usage-event-reasoning-output-exceeds-output"
    }),
    invariantCheck({
      id: "event_total_tokens_eq_input_plus_output",
      scope: "event",
      event_id: event.event_id,
      line: event.line,
      expression: "total_tokens == input_tokens + output_tokens",
      left: event.total_tokens,
      right: normalizeNumber(event.input_tokens) + normalizeNumber(event.output_tokens),
      operator: "eq",
      reason: "usage-event-total-tokens-formula-mismatch"
    })
  ]);
  const checks = [...totalChecks, ...eventChecks];
  const failedChecks = checks.filter((check) => !check.passed);
  const failedGateReasons = unique([
    ...totalChecks.filter((check) => !check.passed).map((check) => check.reason),
    ...eventChecks.filter((check) => !check.passed).map((check) => check.reason)
  ]);

  return {
    schema: "CodexUsageInvariantsV1",
    status: failedChecks.length ? "usage-invariants-need-review" : "verified-usage-invariants",
    verified: failedChecks.length === 0,
    scope: "totals-and-events",
    required_formula: "total_tokens = input_tokens + output_tokens",
    checks,
    failed_checks: failedChecks.map((check) => check.id),
    failed_gate_reasons: failedGateReasons
  };
}

function invariantCheck(input = {}) {
  const left = normalizeNumber(input.left);
  const right = normalizeNumber(input.right);
  const operator = input.operator || "lte";
  const passed = operator === "eq" ? left === right : left <= right;

  return {
    id: input.id,
    scope: input.scope,
    event_id: input.event_id || "",
    line: normalizeNumber(input.line),
    expression: input.expression,
    operator,
    left,
    right,
    passed,
    reason: input.reason
  };
}

function summarizeLedgerEntries(entries = []) {
  const verifiedEntries = entries.filter((entry) => entry.gate_status === "verified-codex-official-usage").length;
  const reviewEntries = entries.filter((entry) => entry.gate_status !== "verified-codex-official-usage");
  const inputTokens = sum(entries, "input_tokens");
  const cachedInputTokens = sum(entries, "cached_input_tokens");
  const outputTokens = sum(entries, "output_tokens");
  const reasoningOutputTokens = sum(entries, "reasoning_output_tokens");
  const totalTokens = inputTokens + outputTokens;

  return {
    entries: entries.length,
    verified_entries: verifiedEntries,
    needs_review_entries: entries.length - verifiedEntries,
    events: sum(entries, "events"),
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_tokens: totalTokens,
    total_tokens_formula: "input_tokens + output_tokens",
    cached_input_percent: inputTokens ? Math.round((cachedInputTokens / inputTokens) * 100) : 0,
    p95_total_tokens: percentile(entries.map((entry) => entry.total_tokens), 95),
    review_reasons: summarizeReviewReasons(reviewEntries)
  };
}

function normalizeLedgerEntry(entry = {}) {
  const inputTokens = normalizeNumber(entry.input_tokens);
  const outputTokens = normalizeNumber(entry.output_tokens);

  return {
    ...entry,
    events: normalizeNumber(entry.events),
    input_tokens: inputTokens,
    cached_input_tokens: normalizeNumber(entry.cached_input_tokens),
    output_tokens: outputTokens,
    reasoning_output_tokens: normalizeNumber(entry.reasoning_output_tokens),
    total_tokens: inputTokens + outputTokens,
    total_tokens_formula: "input_tokens + output_tokens",
    cached_input_percent: inputTokens ? Math.round((normalizeNumber(entry.cached_input_tokens) / inputTokens) * 100) : 0,
    p95_total_tokens: inputTokens + outputTokens
  };
}

function codexUsageToLedgerEntry(receipt, options = {}) {
  const totals = receipt.official_usage?.totals || {};
  const seed = [
    receipt.receipt_id,
    receipt.source?.raw_sha256,
    receipt.gate?.status
  ].join(":");

  return {
    schema: "CodexOfficialUsageLedgerEntryV1",
    entry_id: `codex-usage-ledger-${sha256(seed).slice(0, 12)}`,
    receipt_id: receipt.receipt_id,
    recorded_at: receipt.recorded_at,
    run_type: options.runType || "codex-usage",
    note: options.note || "",
    label: receipt.source?.label || "",
    source_file: receipt.source?.file || "",
    raw_sha256: receipt.source?.raw_sha256 || "",
    gate_status: receipt.gate?.status || "unknown",
    gate_verified: Boolean(receipt.gate?.verified),
    gate_reasons: receipt.gate?.reasons || [],
    invariant_status: receipt.official_usage?.invariants?.status || "unknown",
    invariant_verified: Boolean(receipt.official_usage?.invariants?.verified),
    invariant_failed_checks: receipt.official_usage?.invariants?.failed_checks || [],
    events: normalizeNumber(totals.events),
    input_tokens: normalizeNumber(totals.input_tokens),
    cached_input_tokens: normalizeNumber(totals.cached_input_tokens),
    output_tokens: normalizeNumber(totals.output_tokens),
    reasoning_output_tokens: normalizeNumber(totals.reasoning_output_tokens),
    total_tokens: normalizeNumber(totals.total_tokens),
    cached_input_percent: normalizeNumber(totals.cached_input_percent),
    p95_total_tokens: normalizeNumber(totals.p95_total_tokens),
    codex_usage_hash: `sha256:${sha256(JSON.stringify(receipt))}`
  };
}

function summarizeReceiptForComparison(receipt) {
  const totals = receipt.official_usage.totals;
  return {
    receipt_id: receipt.receipt_id,
    label: receipt.source.label,
    source_file: receipt.source.file,
    raw_sha256: receipt.source.raw_sha256,
    gate_status: receipt.gate.status,
    invariant_status: receipt.official_usage.invariants?.status || "unknown",
    invariant_verified: Boolean(receipt.official_usage.invariants?.verified),
    events: totals.events,
    input_tokens: totals.input_tokens,
    cached_input_tokens: totals.cached_input_tokens,
    output_tokens: totals.output_tokens,
    reasoning_output_tokens: totals.reasoning_output_tokens,
    total_tokens: totals.total_tokens
  };
}

async function readCodexUsageLedgerFile(ledgerPath) {
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

function normalizeCodexUsageReceipt(value) {
  const receipt = value?.receipt?.schema === "CodexOfficialUsageReceiptV1"
    ? value.receipt
    : value?.schema === "CodexOfficialUsageReceiptV1"
      ? value
      : null;
  if (!receipt) {
    throw new Error("Expected a CodexOfficialUsageReceiptV1 object.");
  }
  return receipt;
}

function resolveAgainstRoot(root, filePath) {
  if (!filePath) return "";
  if (path.isAbsolute(String(filePath))) return String(filePath);
  return path.resolve(root, String(filePath));
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

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
