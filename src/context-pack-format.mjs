const FORMAT_ID = "context-pack-receipt-v1";
const RECEIPT_SCHEMA = "ContextPackReceiptV1";
const SUPPORTED_GATES = [
  "verified-publishable",
  "verified-expanded-context",
  "fallback-full-context"
];
const SUPPORTED_MODES = [
  "compact-context",
  "expanded-context",
  "full-context"
];
const REQUIRED_TOP_LEVEL_FIELDS = [
  "schema",
  "context_pack_id",
  "created_at",
  "source",
  "original_tokens",
  "compact_tokens",
  "delivered_tokens",
  "compact_context",
  "delivered_context",
  "savings",
  "critical_anchors",
  "informative_anchors",
  "anchor_classes",
  "source_evidence",
  "quality",
  "acceptance_oracle",
  "fallback",
  "context_selection",
  "uncertainties",
  "gate"
];

export function buildContextPackFormat() {
  return {
    schema: "ContextPackFormatV1",
    format_id: FORMAT_ID,
    receipt_schema: RECEIPT_SCHEMA,
    version: "1.0.0-local-draft",
    status: "open-format-draft",
    purpose: "Portable receipt format for verified, source-backed context handed to coding agents.",
    compatible_gate_statuses: SUPPORTED_GATES,
    compatible_delivery_modes: SUPPORTED_MODES,
    required_top_level_fields: REQUIRED_TOP_LEVEL_FIELDS,
    invariants: [
      "schema must be ContextPackReceiptV1",
      "critical anchors and every critical anchor class must retain 100%",
      "source evidence coverage must be 100%",
      "quality.risky must be false",
      "delivered_context.hash, compact_context.hash, and source.hash must be sha256-prefixed",
      "delivered token totals must match delivered_context.tokens",
      "fallback.used must match delivered_context.mode",
      "enabled acceptance oracles must pass on source and delivered context",
      "enabled acceptance oracles must be sensitive to counterfactual removals on source and delivered context"
    ],
    json_schema: buildJsonSchema(),
    interoperability_notes: [
      "Token counts are estimates and should be treated as planning metadata, not billing evidence.",
      "Source text is intentionally not embedded; verifiers should use source.hash and source_evidence entries to reload original lines.",
      "A fallback-full-context gate is valid but not a successful compression; it proves uncertainty was resolved conservatively."
    ]
  };
}

export function validateContextPackFormat(value) {
  const receipt = normalizeReceiptInput(value);
  const checks = buildFormatChecks(receipt);
  const failures = checks.filter((check) => check.required && check.status !== "passed");

  return {
    schema: "ContextPackFormatValidationV1",
    format_id: FORMAT_ID,
    receipt_schema: receipt?.schema || "missing",
    context_pack_id: receipt?.context_pack_id || null,
    checked_at: new Date().toISOString(),
    verified: failures.length === 0,
    status: failures.length ? "context-pack-format-needs-review" : "verified-context-pack-format",
    checks,
    failures: failures.map((check) => ({
      check: check.name,
      reason: check.reason
    })),
    summary: {
      gate_status: receipt?.gate?.status || "missing",
      delivered_mode: receipt?.delivered_context?.mode || "missing",
      required_fields: REQUIRED_TOP_LEVEL_FIELDS.length,
      failed_checks: failures.length,
      critical_anchor_retention_percent: Number(receipt?.critical_anchors?.retention_percent) || 0,
      source_evidence_coverage_percent: Math.round(Number(receipt?.source_evidence?.coverage ?? 0) * 100)
    }
  };
}

export function formatContextPackFormatReport(format = buildContextPackFormat()) {
  return `
# ContextPackFormatV1

Format: ${format.format_id}
Receipt-Schema: ${format.receipt_schema}
Version: ${format.version}
Status: ${format.status}

## Pflichtfelder

${format.required_top_level_fields.map((field) => `- ${field}`).join("\n")}

## Invarianten

${format.invariants.map((item) => `- ${item}`).join("\n")}

## Gate-Status

${format.compatible_gate_statuses.map((status) => `- ${status}`).join("\n")}

## Hinweise

${format.interoperability_notes.map((note) => `- ${note}`).join("\n")}
`.trim();
}

export function formatContextPackFormatValidationReport(validation) {
  return `
# ContextPackFormatValidationV1

ContextPack: ${validation.context_pack_id || "unbekannt"}
Status: ${validation.status}

- Format: ${validation.format_id}
- Receipt-Schema: ${validation.receipt_schema}
- Gate: ${validation.summary.gate_status}
- Modus: ${validation.summary.delivered_mode}
- Kritische Anker: ${validation.summary.critical_anchor_retention_percent}%
- Quellbelege: ${validation.summary.source_evidence_coverage_percent}%
- Fehlgeschlagene Checks: ${validation.summary.failed_checks}

## Checks

${validation.checks.map((check) => `- ${check.name}: ${check.status}${check.reason ? ` (${check.reason})` : ""}`).join("\n")}

## Fehler

${validation.failures.length ? validation.failures.map((failure) => `- ${failure.check}: ${failure.reason}`).join("\n") : "- keine"}
`.trim();
}

function buildJsonSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: RECEIPT_SCHEMA,
    type: "object",
    required: REQUIRED_TOP_LEVEL_FIELDS,
    additionalProperties: true,
    properties: {
      schema: { const: RECEIPT_SCHEMA },
      context_pack_id: { type: "string", minLength: 1 },
      created_at: { type: "string" },
      source: {
        type: "object",
        required: ["label", "hash"],
        properties: {
          label: { type: "string" },
          hash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" }
        }
      },
      original_tokens: { type: "integer", minimum: 0 },
      compact_tokens: { type: "integer", minimum: 0 },
      delivered_tokens: { type: "integer", minimum: 0 },
      compact_context: {
        type: "object",
        required: ["hash", "tokens"],
        properties: {
          hash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
          tokens: { type: "integer", minimum: 0 }
        }
      },
      delivered_context: {
        type: "object",
        required: ["hash", "tokens", "mode"],
        properties: {
          hash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
          tokens: { type: "integer", minimum: 0 },
          mode: { enum: SUPPORTED_MODES }
        }
      },
      source_evidence: {
        type: "object",
        required: ["coverage", "entries"],
        properties: {
          coverage: { type: "number", minimum: 0, maximum: 1 },
          entries: { type: "array" }
        }
      },
      acceptance_oracle: {
        type: "object",
        required: ["enabled", "source", "delivered", "sensitivity"],
        properties: {
          enabled: { type: "boolean" },
          source: { type: "object" },
          delivered: { type: "object" },
          sensitivity: {
            type: "object",
            required: ["source", "delivered"],
            properties: {
              source: { type: "object" },
              delivered: { type: "object" }
            }
          }
        }
      },
      gate: {
        type: "object",
        required: ["status", "requirements"],
        properties: {
          status: { enum: SUPPORTED_GATES },
          requirements: { type: "object" }
        }
      }
    }
  };
}

function buildFormatChecks(receipt) {
  if (!receipt || typeof receipt !== "object") {
    return [
      buildCheck("receipt-object", false, {
        reason: "receipt-object-required"
      })
    ];
  }

  const mode = receipt.delivered_context?.mode || "";
  const expectedGate = mode === "full-context"
    ? "fallback-full-context"
    : mode === "expanded-context"
      ? "verified-expanded-context"
      : "verified-publishable";
  const criticalClasses = Array.isArray(receipt.critical_anchors?.classes)
    ? receipt.critical_anchors.classes
    : [];
  const attempts = Array.isArray(receipt.context_selection?.attempts)
    ? receipt.context_selection.attempts
    : [];

  return [
    buildCheck("schema", receipt.schema === RECEIPT_SCHEMA, {
      reason: receipt.schema === RECEIPT_SCHEMA ? "" : `schema-mismatch:${receipt.schema || "missing"}`
    }),
    buildCheck("required-top-level-fields", REQUIRED_TOP_LEVEL_FIELDS.every((field) => field in receipt), {
      missing: REQUIRED_TOP_LEVEL_FIELDS.filter((field) => !(field in receipt)),
      reason: REQUIRED_TOP_LEVEL_FIELDS.every((field) => field in receipt) ? "" : "required-field-missing"
    }),
    buildCheck("supported-gate", SUPPORTED_GATES.includes(receipt.gate?.status), {
      reason: SUPPORTED_GATES.includes(receipt.gate?.status) ? "" : `unsupported-gate:${receipt.gate?.status || "missing"}`
    }),
    buildCheck("supported-delivery-mode", SUPPORTED_MODES.includes(mode), {
      reason: SUPPORTED_MODES.includes(mode) ? "" : `unsupported-mode:${mode || "missing"}`
    }),
    buildCheck("gate-matches-delivery-mode", receipt.gate?.status === expectedGate, {
      reason: receipt.gate?.status === expectedGate ? "" : `gate-mode-mismatch:${receipt.gate?.status || "missing"}!=${expectedGate}`
    }),
    buildCheck("source-hash-sha256", isSha256(receipt.source?.hash), {
      reason: isSha256(receipt.source?.hash) ? "" : "source-hash-invalid"
    }),
    buildCheck("compact-context-hash-sha256", isSha256(receipt.compact_context?.hash), {
      reason: isSha256(receipt.compact_context?.hash) ? "" : "compact-context-hash-invalid"
    }),
    buildCheck("delivered-context-hash-sha256", isSha256(receipt.delivered_context?.hash), {
      reason: isSha256(receipt.delivered_context?.hash) ? "" : "delivered-context-hash-invalid"
    }),
    buildCheck("token-fields-nonnegative", [
      receipt.original_tokens,
      receipt.compact_tokens,
      receipt.delivered_tokens,
      receipt.compact_context?.tokens,
      receipt.delivered_context?.tokens
    ].every((value) => Number.isInteger(value) && value >= 0), {
      reason: "token-field-invalid"
    }),
    buildCheck("context-token-fields-match", receipt.compact_tokens === receipt.compact_context?.tokens && receipt.delivered_tokens === receipt.delivered_context?.tokens, {
      reason: receipt.compact_tokens === receipt.compact_context?.tokens && receipt.delivered_tokens === receipt.delivered_context?.tokens ? "" : "context-token-mismatch"
    }),
    buildCheck("saved-tokens-consistent", Number(receipt.saved_tokens) === Math.max(0, Number(receipt.original_tokens) - Number(receipt.delivered_tokens)), {
      reason: "saved-tokens-mismatch"
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
    buildCheck("source-evidence-entry-shape", validateEvidenceEntries(receipt.source_evidence?.entries), {
      reason: validateEvidenceEntries(receipt.source_evidence?.entries) ? "" : "source-evidence-entry-invalid"
    }),
    buildCheck("quality-not-risky", receipt.quality?.risky === false, {
      reason: receipt.quality?.risky === false ? "" : "risky-context-pack"
    }),
    buildCheck("fallback-mode-consistent", Boolean(receipt.fallback?.used) === (mode !== "compact-context"), {
      reason: Boolean(receipt.fallback?.used) === (mode !== "compact-context") ? "" : "fallback-mode-mismatch"
    }),
    buildCheck("fallback-policy-present", typeof receipt.fallback?.policy === "string" && receipt.fallback.policy.length > 0, {
      reason: typeof receipt.fallback?.policy === "string" && receipt.fallback.policy.length > 0 ? "" : "fallback-policy-missing"
    }),
    buildCheck("attempts-do-not-embed-context", attempts.every((attempt) => !("compressed" in attempt) && !("text" in attempt)), {
      reason: attempts.every((attempt) => !("compressed" in attempt) && !("text" in attempt)) ? "" : "attempt-embeds-context"
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
    }),
    buildCheck("gate-requirements-present", validateGateRequirements(receipt.gate?.requirements), {
      reason: validateGateRequirements(receipt.gate?.requirements) ? "" : "gate-requirement-missing"
    })
  ];
}

function validateEvidenceEntries(entries) {
  return Array.isArray(entries) && entries.every((entry) => (
    typeof entry.evidence_id === "string"
    && Number.isInteger(entry.source_line)
    && entry.source_line >= 1
    && isSha256(entry.source_hash)
    && typeof entry.compression_type === "string"
  ));
}

function validateGateRequirements(requirements = {}) {
  return Number(requirements.critical_anchor_retention_percent) === 100
    && Number(requirements.source_evidence_coverage_percent) === 100
    && Number(requirements.risky_compressions) === 0
    && (requirements.acceptance_oracle_success === true || requirements.acceptance_oracle_success === null)
    && (requirements.acceptance_oracle_sensitivity === true || requirements.acceptance_oracle_sensitivity === null)
    && requirements.fallback_on_uncertainty === true
    && requirements.expand_before_full_context === true;
}

function buildCheck(name, passed, details = {}) {
  return {
    schema: "ContextPackFormatCheckV1",
    name,
    status: passed ? "passed" : "failed",
    required: details.required ?? true,
    reason: passed ? "" : details.reason || "check-failed",
    ...Object.fromEntries(Object.entries(details).filter(([key]) => !["required", "reason"].includes(key)))
  };
}

function normalizeReceiptInput(value) {
  return value?.receipt?.schema === RECEIPT_SCHEMA ? value.receipt : value;
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value || ""));
}
