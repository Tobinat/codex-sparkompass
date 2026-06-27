import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

const SUPPORTED_GATES = new Set([
  "verified-publishable",
  "verified-expanded-context",
  "fallback-full-context"
]);

export async function loadReceiptOrPackJson(filePath) {
  const parsed = JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
  return normalizeReceiptInput(parsed);
}

export async function buildReceiptVerificationFromFiles(options = {}) {
  const receiptInput = options.receiptFile
    ? await loadReceiptOrPackJson(options.receiptFile)
    : normalizeReceiptInput(options.receipt);
  const sourceText = options.file
    ? await fs.readFile(path.resolve(String(options.file)), "utf8")
    : options.text;
  const deliveredText = options.contextFile
    ? await fs.readFile(path.resolve(String(options.contextFile)), "utf8")
    : options.contextText || receiptInput.pack?.context?.text;

  return buildReceiptVerification(receiptInput.receipt, {
    sourceText,
    deliveredText
  });
}

export function buildReceiptVerification(receiptInput, options = {}) {
  const receipt = normalizeReceiptInput(receiptInput).receipt;
  const source = verifySource(receipt, options.sourceText);
  const evidence = verifySourceEvidence(receipt, options.sourceText);
  const delivered = verifyDeliveredContext(receipt, options.deliveredText);
  const invariants = verifyReceiptInvariants(receipt);
  const checks = {
    schema: buildCheck("schema", receipt.schema === "ContextPackReceiptV1", {
      expected: "ContextPackReceiptV1",
      actual: receipt.schema || "missing"
    }),
    source_hash: source,
    source_evidence: evidence,
    delivered_context_hash: delivered,
    invariants
  };
  const blockingFailures = flattenChecks(checks)
    .filter((check) => check.required && check.status !== "passed");

  return {
    schema: "ContextPackReceiptVerificationV1",
    context_pack_id: receipt.context_pack_id || null,
    verified: blockingFailures.length === 0,
    status: blockingFailures.length ? "receipt-needs-review" : "verified-receipt",
    checked_at: new Date().toISOString(),
    checks,
    failures: blockingFailures.map((check) => ({
      check: check.name,
      status: check.status,
      reason: check.reason
    })),
    summary: {
      gate_status: receipt.gate?.status || "unknown",
      critical_anchor_retention_percent: Number(receipt.critical_anchors?.retention_percent) || 0,
      source_evidence_coverage_percent: Math.round(Number(receipt.source_evidence?.coverage ?? 0) * 100),
      delivered_tokens: Number(receipt.delivered_tokens) || 0
    }
  };
}

export function formatReceiptVerificationReport(verification) {
  return `
# ContextPackReceiptVerificationV1

ContextPack: ${verification.context_pack_id || "unbekannt"}
Status: ${verification.status}

- Gate: ${verification.summary.gate_status}
- Kritische Anker: ${verification.summary.critical_anchor_retention_percent}%
- Quellbelege: ${verification.summary.source_evidence_coverage_percent}%
- Gelieferte Tokens: ${formatNumber(verification.summary.delivered_tokens)}
- Source-Hash: ${formatCheck(verification.checks.source_hash)}
- Source-Evidence: ${formatCheck(verification.checks.source_evidence)}
- Delivered-Context-Hash: ${formatCheck(verification.checks.delivered_context_hash)}

## Invarianten

${verification.checks.invariants.map((check) => `- ${check.name}: ${check.status}${check.reason ? ` (${check.reason})` : ""}`).join("\n")}

## Fehler

${verification.failures.length ? verification.failures.map((failure) => `- ${failure.check}: ${failure.reason}`).join("\n") : "- keine"}
`.trim();
}

function normalizeReceiptInput(value) {
  const pack = value?.receipt ? value : null;
  const receipt = value?.receipt || value;
  if (!receipt || receipt.schema !== "ContextPackReceiptV1") {
    throw new Error("Expected a ContextPackReceiptV1 receipt or a pack object with .receipt.");
  }
  return { receipt, pack };
}

function verifySource(receipt, sourceText) {
  if (sourceText === undefined || sourceText === null || sourceText === "") {
    return buildCheck("source_hash", false, {
      required: true,
      reason: "source-text-required"
    });
  }
  const normalized = normalizeText(sourceText);
  const actual = `sha256:${sha256(normalized)}`;
  const expected = receipt.source?.hash || "";
  return buildCheck("source_hash", actual === expected, {
    expected,
    actual,
    reason: actual === expected ? "" : "source-hash-mismatch"
  });
}

function verifySourceEvidence(receipt, sourceText) {
  if (sourceText === undefined || sourceText === null || sourceText === "") {
    return buildCheck("source_evidence", false, {
      required: true,
      reason: "source-text-required"
    });
  }
  const lines = normalizeText(sourceText).split("\n");
  const entries = Array.isArray(receipt.source_evidence?.entries)
    ? receipt.source_evidence.entries
    : [];
  const failed = [];

  for (const entry of entries) {
    const line = lines[(Number(entry.source_line) || 0) - 1];
    const actual = line === undefined ? "missing-line" : `sha256:${sha256(line)}`;
    if (actual !== entry.source_hash) {
      failed.push({
        evidence_id: entry.evidence_id,
        source_line: entry.source_line,
        expected: entry.source_hash,
        actual
      });
    }
  }

  return buildCheck("source_evidence", failed.length === 0, {
    checked: entries.length,
    failed,
    reason: failed.length ? "source-evidence-hash-mismatch" : ""
  });
}

function verifyDeliveredContext(receipt, deliveredText) {
  if (!receipt.delivered_context?.hash) {
    return buildCheck("delivered_context_hash", false, {
      required: false,
      reason: "receipt-has-no-delivered-context-hash"
    });
  }
  if (deliveredText === undefined || deliveredText === null || deliveredText === "") {
    return buildCheck("delivered_context_hash", false, {
      required: false,
      reason: "delivered-context-not-supplied"
    });
  }
  const normalized = normalizeText(deliveredText);
  const actual = `sha256:${sha256(normalized)}`;
  const expected = receipt.delivered_context.hash;
  const tokenCheck = estimateTextStats(normalized).estimatedTokens === Number(receipt.delivered_tokens);

  return buildCheck("delivered_context_hash", actual === expected && tokenCheck, {
    expected,
    actual,
    token_check: tokenCheck,
    reason: actual === expected && tokenCheck ? "" : "delivered-context-mismatch"
  });
}

function verifyReceiptInvariants(receipt) {
  const criticalClasses = Array.isArray(receipt.critical_anchors?.classes)
    ? receipt.critical_anchors.classes
    : [];

  return [
    buildCheck("gate-supported", SUPPORTED_GATES.has(receipt.gate?.status), {
      reason: SUPPORTED_GATES.has(receipt.gate?.status) ? "" : `unsupported-gate:${receipt.gate?.status || "missing"}`
    }),
    buildCheck("critical-anchor-retention-100", Number(receipt.critical_anchors?.retention_percent) === 100, {
      reason: Number(receipt.critical_anchors?.retention_percent) === 100 ? "" : "critical-anchor-retention-not-100"
    }),
    buildCheck("critical-anchor-classes-100", criticalClasses.every((entry) => Number(entry.retention_percent) === 100), {
      reason: criticalClasses.every((entry) => Number(entry.retention_percent) === 100) ? "" : "critical-anchor-class-retention-not-100"
    }),
    buildCheck("source-evidence-coverage-100", Number(receipt.source_evidence?.coverage) === 1, {
      reason: Number(receipt.source_evidence?.coverage) === 1 ? "" : "source-evidence-coverage-not-100"
    }),
    buildCheck("quality-not-risky", receipt.quality?.risky === false, {
      reason: receipt.quality?.risky === false ? "" : "risky-context-pack"
    }),
    buildCheck("acceptance-oracle-source", !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.source?.success === true, {
      reason: !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.source?.success === true ? "" : "acceptance-oracle-source-failed"
    }),
    buildCheck("acceptance-oracle-delivered", !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.delivered?.success === true, {
      reason: !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.delivered?.success === true ? "" : "acceptance-oracle-delivered-failed"
    }),
    buildCheck("acceptance-oracle-source-sensitivity", !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.sensitivity?.source?.success === true, {
      reason: !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.sensitivity?.source?.success === true ? "" : "acceptance-oracle-source-insensitive"
    }),
    buildCheck("acceptance-oracle-delivered-sensitivity", !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.sensitivity?.delivered?.success === true, {
      reason: !receipt.acceptance_oracle?.enabled || receipt.acceptance_oracle?.sensitivity?.delivered?.success === true ? "" : "acceptance-oracle-delivered-insensitive"
    })
  ];
}

function buildCheck(name, passed, details = {}) {
  return {
    schema: "ContextPackReceiptVerificationCheckV1",
    name,
    status: passed ? "passed" : "failed",
    required: details.required ?? true,
    reason: details.reason || "",
    ...Object.fromEntries(Object.entries(details).filter(([key]) => !["required", "reason"].includes(key)))
  };
}

function flattenChecks(checks) {
  return Object.values(checks).flatMap((value) => Array.isArray(value) ? value : [value]);
}

function formatCheck(check) {
  return `${check.status}${check.reason ? ` (${check.reason})` : ""}`;
}

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
