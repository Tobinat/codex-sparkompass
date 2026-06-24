import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildContextControlReport } from "./context-control.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildContextEvidenceAudit(rootPath, options = {}) {
  const control = await buildContextControlReport(rootPath, options);
  return buildContextEvidenceAuditFromControl(control, options);
}

export async function buildContextEvidenceAuditFromControl(control, options = {}) {
  const maxEvidence = clampInteger(options.maxEvidence, 180, 1, 1000);
  const collectedEvidence = collectEvidence(control);
  const evidence = collectedEvidence.slice(0, maxEvidence);
  const totalEvidence = collectedEvidence.length;
  const checked = [];

  for (const item of evidence) {
    checked.push(await verifyEvidence(control.root, item));
  }

  const failures = checked.filter((item) => !item.verified);
  const warnings = [];
  if (totalEvidence > evidence.length) {
    warnings.push("evidence-audit-truncated");
  }
  if (control.readiness?.status !== "ready-for-handoff") {
    warnings.push(`control-${control.readiness?.status || "unknown"}`);
  }

  return {
    schema: "ContextEvidenceAuditV1",
    audit_id: `evidence-audit-${sha256([
      control.root,
      control.handoff?.full_prompt_hash || "",
      checked.map((item) => `${item.evidence_id}:${item.status}`).join("|")
    ].join("|")).slice(0, 12)}`,
    root: control.root,
    generated_at: new Date().toISOString(),
    source_control: {
      schema: control.schema,
      generated_at: control.generated_at,
      readiness: control.readiness.status,
      full_prompt_hash: control.handoff.full_prompt_hash,
      plan_gate: control.gates.plan.status,
      envelope_gate: control.gates.envelope.status
    },
    gate: {
      status: failures.length ? "evidence-audit-needs-review" : "verified-evidence-audit",
      verified: failures.length === 0,
      failures: failures.map((item) => item.evidence_id),
      warnings
    },
    totals: {
      evidence_total: totalEvidence,
      evidence_checked: checked.length,
      verified: checked.filter((item) => item.verified).length,
      failed: failures.length,
      immediate: checked.filter((item) => item.lane === "immediate").length,
      requirements: checked.filter((item) => item.lane === "requirements").length,
      on_demand: checked.filter((item) => item.lane === "on_demand").length,
      coverage_percent: totalEvidence ? Math.round((checked.length / totalEvidence) * 100) : 100
    },
    evidence: checked,
    next_actions: buildNextActions(failures, warnings)
  };
}

export function formatContextEvidenceAuditReport(audit) {
  return `
# ContextEvidenceAuditV1

Gate: ${audit.gate.status}
Pfad: ${audit.root}

- Evidence geprüft: ${formatNumber(audit.totals.evidence_checked)}/${formatNumber(audit.totals.evidence_total)}
- Verifiziert: ${formatNumber(audit.totals.verified)}
- Fehlgeschlagen: ${formatNumber(audit.totals.failed)}
- Sofort/Requirements/On-Demand: ${formatNumber(audit.totals.immediate)} / ${formatNumber(audit.totals.requirements)} / ${formatNumber(audit.totals.on_demand)}
- Control: ${audit.source_control.readiness}

## Fehler

${formatFailures(audit.evidence)}

## Hinweise

${audit.gate.warnings.length ? audit.gate.warnings.map((item) => `- ${item}`).join("\n") : "- keine"}

## Nächste Schritte

${audit.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

function collectEvidence(control) {
  const evidence = [];
  for (const item of control.evidence_protocol?.immediate || []) {
    evidence.push(normalizeEvidence(item, "immediate"));
  }
  for (const item of control.evidence_protocol?.requirements || []) {
    evidence.push(normalizeEvidence(item, "requirements"));
  }
  for (const item of control.evidence_protocol?.on_demand || []) {
    evidence.push(normalizeEvidence(item, "on_demand"));
  }

  const seen = new Set();
  return evidence.filter((item) => {
    const key = `${item.file}:${item.line}:${item.source_hash}:${item.lane}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return item.file && Number.isInteger(item.line);
  });
}

function normalizeEvidence(item, lane) {
  return {
    evidence_id: item.evidence_id || `${lane}-${sha256(`${item.file}:${item.line}`).slice(0, 8)}`,
    lane,
    unit_id: item.unit_id || null,
    requirement: item.requirement || null,
    file: item.file,
    line: Number(item.line),
    expected_source_hash: item.source_hash || item.expected_source_hash || "",
    load_hint: item.load_hint || ""
  };
}

async function verifyEvidence(root, item) {
  try {
    const absolutePath = resolveInsideRoot(root, item.file);
    const text = await fs.readFile(absolutePath, "utf8");
    const lines = text.split(/\r\n|\r|\n/);
    const line = lines[item.line - 1];
    if (line === undefined) {
      return {
        ...item,
        status: "line-missing",
        verified: false,
        actual_source_hash: null,
        file_hash: `sha256:${sha256(text)}`,
        reason: "line-not-found"
      };
    }
    const actual = `sha256:${sha256(line.trim())}`;
    return {
      ...item,
      status: actual === item.expected_source_hash ? "verified" : "hash-mismatch",
      verified: actual === item.expected_source_hash,
      actual_source_hash: actual,
      file_hash: `sha256:${sha256(text)}`,
      reason: actual === item.expected_source_hash ? null : "source-hash-mismatch"
    };
  } catch (error) {
    return {
      ...item,
      status: "file-missing",
      verified: false,
      actual_source_hash: null,
      file_hash: null,
      reason: error?.code === "ENOENT" ? "file-not-found" : error?.message || String(error)
    };
  }
}

function resolveInsideRoot(root, file) {
  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Evidence path escapes root: ${file}`);
  }
  return resolved;
}

function formatFailures(evidence) {
  const failures = evidence.filter((item) => !item.verified);
  if (!failures.length) return "- keine";
  return failures.slice(0, 12).map((item) => (
    `- ${item.evidence_id} ${item.file}:${item.line} ${item.status} (${item.reason})`
  )).join("\n");
}

function buildNextActions(failures, warnings) {
  const actions = [];
  if (failures.length) {
    actions.push("Lade die fehlgeschlagenen Evidence-IDs neu oder baue den ContextPlan gegen den aktuellen Arbeitsbaum neu.");
  } else {
    actions.push("Nutze den Control/Handoff-Kontext mit verifizierter Evidence-Spur; lade Details weiter nur on-demand.");
  }
  if (warnings.includes("evidence-audit-truncated")) {
    actions.push("Erhoehe --max-evidence, wenn der gesamte Evidence-Vertrag vor einem Release geprüft werden soll.");
  }
  if (warnings.some((item) => item.startsWith("control-"))) {
    actions.push("Behandle Control-Readiness-Warnungen separat; ein Evidence-Audit beweist Hashes, nicht fachliche Vollständigkeit.");
  }
  return actions;
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
