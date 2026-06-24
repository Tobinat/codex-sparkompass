import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

const ERROR_PATTERN = /\b(error|failed|failure|fatal|exception|traceback|assertionerror|panic|segmentation fault)\b/i;
const REPEAT_SIGNAL_PATTERN = /\b(error|failed|failure|fatal|exception|traceback|assertionerror|panic|warn|warning)\b/i;
const STACK_PATTERN = /^\s*(at\s+[\w.$<>]+|File\s+"[^"]+"|#\d+\s+)/;
const FILE_REF_PATTERN = /(?:^|\s|["'(])((?:\.{1,2}\/)?[\w@./-]+\.(?:mjs|js|ts|tsx|jsx|py|go|rs|java|rb|php|cs|cpp|c|h|hpp|md|json|yml|yaml|toml|log|txt))(?::(\d+))?(?::(\d+))?/g;
const ERROR_CODE_PATTERN = /\b(?:E|ERR|WARN|AUTH|HTTP|SQL|TS|PY|npm|ERR_NPM|ERR_PNPM)[A-Z0-9_-]{2,}\b|(?:\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,}\b)/g;

export function summarizeToolOutput(text, options = {}) {
  const rawText = String(text || "");
  const label = String(options.label || "tool-output");
  const command = String(options.command || "").trim();
  const exitCode = normalizeExitCode(options.exitCode);
  const lines = rawText.split(/\r\n|\r|\n/);
  const rawStats = estimateTextStats(rawText);
  const normalizedLines = lines.map(stripAnsi);
  const errorLines = collectErrorLines(normalizedLines);
  const stackFrames = collectStackFrames(normalizedLines);
  const affectedFiles = collectAffectedFiles(normalizedLines);
  const failedTests = collectFailedTests(normalizedLines);
  const errorCodes = collectErrorCodes(normalizedLines);
  const repeatedLines = collectRepeatedLines(normalizedLines);
  const failed = exitCode !== null ? exitCode !== 0 : (errorLines.length > 0 || failedTests.length > 0);
  const status = {
    exit_code: exitCode,
    failed,
    indicators: buildStatusIndicators({ exitCode, errorLines, failedTests, stackFrames })
  };
  const rawHash = `sha256:${sha256(rawText)}`;
  const summaryText = buildSummaryText({
    label,
    command,
    status,
    errorCodes,
    failedTests,
    affectedFiles,
    repeatedLines,
    stackFrames,
    errorLines,
    rawHash
  });
  const summaryStats = estimateTextStats(summaryText);

  return {
    schema: "ToolOutputSummaryV1",
    generated_at: new Date().toISOString(),
    label,
    command: command || null,
    raw: {
      hash: rawHash,
      bytes: rawStats.bytes,
      lines: rawText ? lines.length : 0,
      estimated_tokens: rawStats.estimatedTokens
    },
    delivered: {
      summary_tokens: summaryStats.estimatedTokens,
      saved_tokens: Math.max(0, rawStats.estimatedTokens - summaryStats.estimatedTokens),
      savings_percent: rawStats.estimatedTokens
        ? Math.max(0, Math.round(((rawStats.estimatedTokens - summaryStats.estimatedTokens) / rawStats.estimatedTokens) * 100))
        : 0
    },
    status,
    error_codes: errorCodes,
    failed_tests: failedTests,
    affected_files: affectedFiles,
    stack_frames: stackFrames,
    repeated_lines: repeatedLines,
    excerpt: {
      first_error: errorLines[0] || null,
      error_lines: errorLines.slice(0, 12)
    },
    raw_ref: {
      uri: `sparkompass://tool-output/${rawHash.slice("sha256:".length, "sha256:".length + 12)}`,
      stored: false
    },
    summary_text: summaryText
  };
}

export async function writeToolOutputEvidence(rootPath, text, summary, options = {}) {
  const root = path.resolve(rootPath || ".");
  const outputDir = resolveInsideRoot(root, options.out || ".sparkompass/tool-output");
  const id = summary.raw.hash.slice("sha256:".length, "sha256:".length + 12);
  const rawPath = path.join(outputDir, `${id}.raw.txt`);
  const summaryPath = path.join(outputDir, `${id}.summary.json`);
  const nextSummary = {
    ...summary,
    raw_ref: {
      ...summary.raw_ref,
      stored: true,
      raw_path: rawPath,
      summary_path: summaryPath
    }
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(rawPath, String(text || ""), "utf8");
  await fs.writeFile(summaryPath, `${JSON.stringify(nextSummary, null, 2)}\n`, "utf8");

  return nextSummary;
}

export async function loadToolOutputEvidence(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const source = await resolveToolOutputSource(root, options);
  const rawText = await fs.readFile(source.rawPath, "utf8");
  const rawHash = `sha256:${sha256(rawText)}`;
  const summary = source.summaryPath
    ? JSON.parse(await fs.readFile(source.summaryPath, "utf8"))
    : null;
  const expectedHash = options.expectedHash || summary?.raw?.hash || "";
  const lines = rawText.split(/\r\n|\r|\n/);
  const window = selectLineWindow(lines, {
    line: options.line,
    pattern: options.pattern,
    contextLines: options.contextLines,
    maxLines: options.maxLines
  });
  const text = window.lines
    .map((value, index) => `${String(window.line_start + index).padStart(4, " ")} | ${value}`)
    .join("\n");

  return {
    schema: "ToolOutputEvidenceV1",
    evidence_id: `tool-ev-${sha256(`${source.rawPath}:${window.line_start}:${window.line_end}:${rawHash}`).slice(0, 12)}`,
    raw_path: source.rawPath,
    summary_path: source.summaryPath,
    raw_hash: rawHash,
    expected_hash: expectedHash || null,
    hash_match: expectedHash ? expectedHash === rawHash : null,
    line_start: window.line_start,
    line_end: window.line_end,
    matched_line: window.matched_line,
    pattern: options.pattern || null,
    lines: window.lines,
    text
  };
}

export function formatToolOutputSummary(summary) {
  const files = summary.affected_files.slice(0, 8)
    .map((item) => `- ${item.file}${item.line ? `:${item.line}` : ""}${item.count > 1 ? ` (${formatNumber(item.count)} Treffer)` : ""}`)
    .join("\n");
  const repeats = summary.repeated_lines.slice(0, 6)
    .map((item) => `- ${formatNumber(item.count)}x ${item.text}`)
    .join("\n");
  const errors = summary.excerpt.error_lines.slice(0, 8)
    .map((line) => `- ${line}`)
    .join("\n");

  return `
# ToolOutputSummaryV1

Quelle: ${summary.label}
Status: ${summary.status.failed ? "fehlgeschlagen" : "ok"}

- Befehl: ${summary.command || "nicht angegeben"}
- Exit-Code: ${summary.status.exit_code === null ? "unbekannt" : summary.status.exit_code}
- Rohdaten: ${formatNumber(summary.raw.lines)} Zeilen, ${formatNumber(summary.raw.estimated_tokens)} Tokens, ${summary.raw.hash}
- Zusammenfassung: ${formatNumber(summary.delivered.summary_tokens)} Tokens, ${summary.delivered.savings_percent}% gespart
- Rohdaten-Ref: ${summary.raw_ref.uri}${summary.raw_ref.stored ? ` (${summary.raw_ref.raw_path})` : ""}
- Fehlercodes: ${summary.error_codes.length ? summary.error_codes.join(", ") : "keine"}
- Fehlgeschlagene Tests: ${summary.failed_tests.length ? summary.failed_tests.join(", ") : "keine"}

## Erste Fehler

${errors || "- keine Fehlerzeilen erkannt"}

## Betroffene Dateien

${files || "- keine Dateiverweise erkannt"}

## Wiederholungen

${repeats || "- keine relevanten Wiederholungen erkannt"}
`.trim();
}

export function formatToolOutputEvidence(evidence) {
  return `
# ToolOutputEvidenceV1

Quelle: ${evidence.raw_path}

- Zeilen: ${formatNumber(evidence.line_start)}-${formatNumber(evidence.line_end)}
- Raw-Hash: ${evidence.raw_hash}
- Hash-Abgleich: ${evidence.hash_match === null ? "nicht angefordert" : evidence.hash_match ? "ok" : "fehlgeschlagen"}
- Pattern: ${evidence.pattern || "keines"}

## Rohlog-Ausschnitt

${evidence.text || "- keine Zeilen geladen"}
`.trim();
}

async function resolveToolOutputSource(root, options) {
  const summaryPath = options.summary
    ? resolveStoredPath(root, String(options.summary))
    : options.summaryPath
      ? resolveStoredPath(root, String(options.summaryPath))
      : null;
  const summary = summaryPath
    ? JSON.parse(await fs.readFile(summaryPath, "utf8"))
    : null;
  const rawFromSummary = summary?.raw_ref?.raw_path || "";
  const id = String(options.id || "").trim();
  const rawPath = options.raw
    ? resolveStoredPath(root, String(options.raw))
    : options.rawPath
      ? resolveStoredPath(root, String(options.rawPath))
      : rawFromSummary
        ? resolveStoredPath(root, rawFromSummary)
        : id
          ? resolveInsideRoot(root, path.join(options.out || ".sparkompass/tool-output", `${id}.raw.txt`))
          : null;

  if (!rawPath) {
    throw new Error("Provide --summary, --raw, or --id for tool-output load.");
  }

  return {
    rawPath,
    summaryPath
  };
}

function resolveStoredPath(root, value) {
  if (path.isAbsolute(value)) {
    const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (value !== root && !value.startsWith(normalizedRoot)) {
      throw new Error(`Path escapes rootPath: ${value}`);
    }
    return value;
  }
  return resolveInsideRoot(root, value);
}

function selectLineWindow(lines, options = {}) {
  const maxLines = clampInteger(options.maxLines, 80, 1, 500);
  const contextLines = clampInteger(options.contextLines, 6, 0, 120);
  const requestedLine = Number(options.line);
  const pattern = String(options.pattern || "");
  let matchedLine = null;
  let targetLine = Number.isInteger(requestedLine) && requestedLine > 0 ? requestedLine : 1;

  if (pattern) {
    const lowerPattern = pattern.toLowerCase();
    const index = lines.findIndex((line) => line.toLowerCase().includes(lowerPattern));
    if (index >= 0) {
      targetLine = index + 1;
      matchedLine = targetLine;
    }
  }

  targetLine = Math.min(Math.max(1, targetLine), Math.max(1, lines.length));
  let start = Math.max(1, targetLine - contextLines);
  let end = Math.min(lines.length, targetLine + contextLines);

  if (end - start + 1 > maxLines) {
    const overflow = end - start + 1 - maxLines;
    const trimBefore = Math.floor(overflow / 2);
    const trimAfter = overflow - trimBefore;
    start += trimBefore;
    end -= trimAfter;
  }

  return {
    line_start: start,
    line_end: end,
    matched_line: matchedLine,
    lines: lines.slice(start - 1, end)
  };
}

function collectErrorLines(lines) {
  return unique(lines
    .filter((line) => ERROR_PATTERN.test(line))
    .map(shorten), 24);
}

function collectStackFrames(lines) {
  return unique(lines
    .filter((line) => STACK_PATTERN.test(line))
    .map(shorten), 24);
}

function collectAffectedFiles(lines) {
  const byKey = new Map();

  for (const line of lines) {
    for (const match of line.matchAll(FILE_REF_PATTERN)) {
      const file = match[1];
      const lineNumber = match[2] ? Number(match[2]) : null;
      const column = match[3] ? Number(match[3]) : null;
      const key = `${file}:${lineNumber || ""}:${column || ""}`;
      const current = byKey.get(key) || {
        file,
        line: lineNumber,
        column,
        count: 0
      };
      current.count += 1;
      byKey.set(key, current);
    }
  }

  return [...byKey.values()]
    .sort((left, right) => right.count - left.count || left.file.localeCompare(right.file))
    .slice(0, 24);
}

function collectFailedTests(lines) {
  const tests = [];
  const patterns = [
    /\bFAILED\s+([^\s]+::[^\s]+)/,
    /\bFAIL(?:ED)?\s+([^\s]+\.(?:test|spec)\.[^\s]+)/i,
    /\b([^\s]+::[^\s]+)\s+FAILED\b/i,
    /\b([A-Za-z_$][\w$.-]+\s+>\s+[^\n]+)\s+failed\b/i
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) tests.push(shorten(match[1], 140));
    }
  }

  return unique(tests, 20);
}

function collectErrorCodes(lines) {
  const codes = [];
  for (const line of lines) {
    for (const match of line.matchAll(ERROR_CODE_PATTERN)) {
      const value = match[0];
      if (/^(ERROR|FAILED|FAILURE|WARN|WARNING|TRACEBACK)$/i.test(value)) continue;
      codes.push(value);
    }
  }
  return unique(codes, 20);
}

function collectRepeatedLines(lines) {
  const counts = new Map();
  const examples = new Map();

  for (const line of lines) {
    const cleaned = normalizeRepeatLine(line);
    if (cleaned.length < 12) continue;
    FILE_REF_PATTERN.lastIndex = 0;
    if (REPEAT_SIGNAL_PATTERN.test(cleaned) || FILE_REF_PATTERN.test(cleaned) || STACK_PATTERN.test(cleaned)) {
      counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
      examples.set(cleaned, shorten(line, 160));
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([key, count]) => ({
      count,
      text: examples.get(key) || key
    }));
}

function buildStatusIndicators({ exitCode, errorLines, failedTests, stackFrames }) {
  const indicators = [];
  if (exitCode !== null) indicators.push(exitCode === 0 ? "exit-code-0" : `exit-code-${exitCode}`);
  if (errorLines.length) indicators.push("error-lines");
  if (failedTests.length) indicators.push("failed-tests");
  if (stackFrames.length) indicators.push("stack-frames");
  if (!indicators.length) indicators.push("no-failure-indicators");
  return indicators;
}

function buildSummaryText({ label, command, status, errorCodes, failedTests, affectedFiles, repeatedLines, stackFrames, errorLines, rawHash }) {
  const lines = [
    `Quelle: ${label}`,
    `Befehl: ${command || "nicht angegeben"}`,
    `Status: ${status.failed ? "fehlgeschlagen" : "ok"}${status.exit_code === null ? "" : `, Exit-Code ${status.exit_code}`}`,
    `Rohdaten: ${rawHash}`
  ];

  if (errorCodes.length) lines.push(`Fehlercodes: ${errorCodes.slice(0, 12).join(", ")}`);
  if (failedTests.length) lines.push(`Fehlgeschlagene Tests: ${failedTests.slice(0, 8).join(", ")}`);
  if (errorLines.length) lines.push(`Erster Fehler: ${errorLines[0]}`);
  if (affectedFiles.length) {
    lines.push(`Betroffene Dateien: ${affectedFiles.slice(0, 10).map((item) => `${item.file}${item.line ? `:${item.line}` : ""}`).join(", ")}`);
  }
  if (stackFrames.length) lines.push(`Stackframes: ${stackFrames.slice(0, 6).join(" | ")}`);
  if (repeatedLines.length) {
    lines.push(`Wiederholungen: ${repeatedLines.slice(0, 6).map((item) => `${item.count}x ${item.text}`).join(" | ")}`);
  }

  return lines.join("\n");
}

function normalizeExitCode(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function stripAnsi(value) {
  return String(value || "").replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "").trimEnd();
}

function normalizeRepeatLine(value) {
  return stripAnsi(value)
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?\b/g, "<timestamp>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<hex>")
    .replace(/\b\d+\b/g, "<n>")
    .trim();
}

function unique(values, limit = values.length) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function shorten(value, max = 220) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function resolveInsideRoot(root, relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolutePath !== root && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes rootPath: ${relativePath}`);
  }
  return absolutePath;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
