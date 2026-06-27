import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAcceptanceOracle, buildCounterfactualChecks, evaluateAcceptanceOracle } from "./acceptance-oracle.mjs";
import { buildReceiptVerification, loadReceiptOrPackJson } from "./receipt-verifier.mjs";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";
import { summarizeToolOutput } from "./tool-output.mjs";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_BYTES = 200000;

export async function runTaskOutcome(options = {}) {
  const command = String(options.command || "").trim();
  if (!command) {
    throw new Error("Bitte Befehl angeben: sparkompass task run --command \"npm test\"");
  }

  const cwd = path.resolve(options.cwd || options.rootPath || ".");
  const timeoutMs = clampInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 30 * 60 * 1000);
  const maxOutputBytes = clampInteger(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, 1024, 10 * 1024 * 1024);
  const started = Date.now();
  const result = await executeCommand(command, {
    cwd,
    timeoutMs,
    maxOutputBytes
  });

  return buildTaskOutcomeReceipt({
    ...options,
    command,
    cwd,
    timeoutMs,
    maxOutputBytes,
    durationMs: Date.now() - started,
    ...result
  });
}

export async function recordTaskOutcome(options = {}) {
  const command = String(options.command || "").trim();
  const outputText = options.outputFile
    ? await fs.readFile(resolveAgainstBase(options, String(options.outputFile)), "utf8")
    : options.outputText ?? options.text ?? "";

  if (!command) {
    throw new Error("Bitte Befehl angeben: sparkompass task record --command \"npm test\" --exit-code 0 --output-text \"...\"");
  }

  return buildTaskOutcomeReceipt({
    ...options,
    command,
    cwd: path.resolve(options.cwd || options.rootPath || "."),
    stdout: String(outputText || ""),
    stderr: "",
    exitCode: normalizeExitCode(options.exitCode),
    signal: null,
    timedOut: Boolean(options.timedOut),
    truncated: false,
    durationMs: normalizeDuration(options.durationMs)
  });
}

export async function buildTaskOutcomeReceipt(options = {}) {
  const stdout = String(options.stdout || "");
  const stderr = String(options.stderr || "");
  const combinedOutput = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr;
  const command = String(options.command || "").trim();
  const expectedExitCode = normalizeExitCode(options.expectedExitCode ?? 0);
  const exitCode = normalizeExitCode(options.exitCode);
  const outputExpectations = [
    ...asArray(options.expectOutput),
    ...asArray(options.expectOutputRegex).map((pattern) => `regex:${pattern}`)
  ];
  const outputOracle = buildAcceptanceOracle(outputExpectations);
  const outputOracleResult = evaluateAcceptanceOracle(combinedOutput, outputOracle);
  const outputOracleSensitivity = buildOutputOracleSensitivity(combinedOutput, outputOracle);
  const receiptVerification = await maybeVerifyReceipt(options);
  const summary = summarizeToolOutput(combinedOutput, {
    label: options.label || "task-output",
    command,
    exitCode
  });
  const taskSucceeded = !options.timedOut && expectedExitCode === exitCode;
  const outputOracleSucceeded = outputOracle.expectations.length ? outputOracleResult.success : true;
  const outputOracleSensitive = outputOracle.expectations.length ? outputOracleSensitivity.success : true;
  const receiptSucceeded = receiptVerification ? receiptVerification.verified : true;
  const reasons = buildGateReasons({
    taskSucceeded,
    outputOracleSucceeded,
    outputOracleSensitive,
    receiptSucceeded,
    timedOut: Boolean(options.timedOut),
    expectedExitCode,
    exitCode,
    outputOracleResult,
    outputOracleSensitivity,
    receiptVerification
  });

  return {
    schema: "TaskOutcomeReceiptV1",
    checked_at: new Date().toISOString(),
    task_id: `task-${sha256(`${command}:${Date.now()}:${combinedOutput}`).slice(0, 12)}`,
    command: {
      text: command,
      cwd: path.resolve(options.cwd || options.rootPath || "."),
      expected_exit_code: expectedExitCode,
      timeout_ms: clampInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 30 * 60 * 1000)
    },
    result: {
      exit_code: exitCode,
      signal: options.signal || null,
      timed_out: Boolean(options.timedOut),
      duration_ms: normalizeDuration(options.durationMs),
      truncated: Boolean(options.truncated),
      stdout: outputDigest(stdout),
      stderr: outputDigest(stderr),
      combined: outputDigest(combinedOutput)
    },
    output_oracle: {
      enabled: outputOracle.expectations.length > 0,
      oracle: outputOracle,
      result: outputOracleResult,
      sensitivity: outputOracleSensitivity
    },
    output_summary: summary,
    context_pack: receiptVerification
      ? {
        context_pack_id: receiptVerification.context_pack_id,
        receipt_verification: receiptVerification
      }
      : null,
    gate: {
      status: reasons.length ? "task-outcome-needs-review" : "verified-task-outcome",
      verified: reasons.length === 0,
      requirements: {
        command_exit_success: taskSucceeded,
        output_oracle_success: outputOracleSucceeded,
        output_oracle_sensitivity_success: outputOracleSensitive,
        receipt_verification_success: receiptSucceeded
      },
      reasons
    }
  };
}

export function formatTaskOutcomeReport(receipt) {
  const outputOracle = receipt.output_oracle;
  const receiptVerification = receipt.context_pack?.receipt_verification;
  const outputOracleLine = formatOutputOracleLine(outputOracle);

  return `
# TaskOutcomeReceiptV1

Befehl: ${receipt.command.text}
Status: ${receipt.gate.status}

- Arbeitsverzeichnis: ${receipt.command.cwd}
- Exit-Code: ${receipt.result.exit_code} (erwartet ${receipt.command.expected_exit_code})
- Dauer: ${formatNumber(receipt.result.duration_ms)} ms
- Timeout: ${receipt.result.timed_out ? "ja" : "nein"}
- Output-Hash: ${receipt.result.combined.hash}
- Output-Tokens: ${formatNumber(receipt.result.combined.estimated_tokens)}
- Output-Orakel: ${outputOracleLine}
- ContextPack: ${receipt.context_pack?.context_pack_id || "nicht verknüpft"}
- Receipt-Verifikation: ${receiptVerification ? receiptVerification.status : "nicht gesetzt"}

## Gate-Probleme

${receipt.gate.reasons.length ? receipt.gate.reasons.map((reason) => `- ${reason}`).join("\n") : "- keine"}

## Output-Zusammenfassung

${receipt.output_summary.summary_text}
`.trim();
}

async function maybeVerifyReceipt(options) {
  const receiptInput = options.receiptFile
    ? await loadReceiptOrPackJson(resolveAgainstBase(options, String(options.receiptFile)))
    : options.receipt
      ? normalizeReceiptInput(options.receipt)
      : null;

  if (!receiptInput) return null;

  const sourceText = options.sourceFile
    ? await fs.readFile(resolveAgainstBase(options, String(options.sourceFile)), "utf8")
    : options.sourceText;
  const deliveredText = options.contextFile
    ? await fs.readFile(resolveAgainstBase(options, String(options.contextFile)), "utf8")
    : options.contextText || receiptInput.pack?.context?.text;

  return buildReceiptVerification(receiptInput.receipt, {
    sourceText,
    deliveredText
  });
}

function normalizeReceiptInput(value) {
  const pack = value?.receipt ? value : null;
  const receipt = value?.receipt || value;
  return { receipt, pack };
}

function resolveAgainstBase(options, filePath) {
  if (path.isAbsolute(filePath)) return filePath;
  const base = path.resolve(options.rootPath || options.cwd || ".");
  return path.resolve(base, filePath);
}

function buildGateReasons(input) {
  const reasons = [];
  if (input.timedOut) reasons.push("task-timeout");
  if (!input.taskSucceeded) {
    reasons.push(`exit-code-mismatch:${input.exitCode ?? "null"}!=${input.expectedExitCode}`);
  }
  if (!input.outputOracleSucceeded) {
    reasons.push(`output-oracle-missing:${input.outputOracleResult.missing.join(",")}`);
  }
  if (input.outputOracleSucceeded && !input.outputOracleSensitive) {
    reasons.push(`output-oracle-insensitive:${input.outputOracleSensitivity.missed.join(",")}`);
  }
  if (!input.receiptSucceeded) {
    reasons.push(`receipt-verification-failed:${input.receiptVerification.status}`);
  }
  return reasons;
}

function buildOutputOracleSensitivity(text, outputOracle) {
  const checks = buildCounterfactualChecks(text, outputOracle);
  const missedChecks = checks.filter((check) => !check.detected);

  return {
    schema: "TaskOutputOracleSensitivityV1",
    success: missedChecks.length === 0,
    total: checks.length,
    detected_count: checks.length - missedChecks.length,
    missed: missedChecks.map((check) => check.label),
    missed_details: missedChecks,
    checks
  };
}

function formatOutputOracleLine(outputOracle = {}) {
  if (!outputOracle.enabled) return "nicht gesetzt";
  const result = outputOracle.result || {};
  const sensitivity = outputOracle.sensitivity || {};
  const base = `${formatNumber(result.matched_count)}/${formatNumber(result.total)}`;
  if (!result.success) {
    return `${base}, fehlt: ${(result.missing || []).join(", ")}`;
  }
  if (sensitivity.success === false) {
    return `${base}, nicht sensitiv: ${(sensitivity.missed || []).join(", ")}`;
  }
  return `${base}, sensitiv`;
}

function executeCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd: options.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    const maxOutputBytes = options.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      const next = appendBounded(stdout, stdoutBytes, chunk, maxOutputBytes);
      stdout = next.text;
      stdoutBytes = next.bytes;
      truncated = truncated || next.truncated;
    });
    child.stderr.on("data", (chunk) => {
      const next = appendBounded(stderr, stderrBytes, chunk, maxOutputBytes);
      stderr = next.text;
      stderrBytes = next.bytes;
      truncated = truncated || next.truncated;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut && code === null ? 124 : code,
        signal,
        timedOut,
        truncated
      });
    });
  });
}

function appendBounded(currentText, currentBytes, chunk, maxBytes) {
  if (currentBytes >= maxBytes) {
    return { text: currentText, bytes: currentBytes, truncated: true };
  }
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = maxBytes - currentBytes;
  const slice = buffer.subarray(0, Math.max(0, remaining));
  const truncated = slice.length < buffer.length;
  return {
    text: currentText + slice.toString("utf8"),
    bytes: currentBytes + slice.length,
    truncated
  };
}

function outputDigest(text) {
  const stats = estimateTextStats(text);
  return {
    hash: `sha256:${sha256(text)}`,
    bytes: stats.bytes,
    estimated_tokens: stats.estimatedTokens
  };
}

function normalizeExitCode(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function normalizeDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

function asArray(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
