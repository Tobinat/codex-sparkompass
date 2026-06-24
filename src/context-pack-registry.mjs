import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildReceiptVerification } from "./receipt-verifier.mjs";
import { formatNumber } from "./token-estimator.mjs";

export const DEFAULT_CONTEXT_PACK_REGISTRY_PATH = ".sparkompass/context-pack-registry.json";

export async function registerContextPack(rootPath, packInput, options = {}) {
  const root = path.resolve(rootPath || ".");
  const registryPath = resolveRegistryPath(root, options.registry || options.out || DEFAULT_CONTEXT_PACK_REGISTRY_PATH);
  const existing = await readRegistryFile(registryPath);
  const { receipt, pack } = normalizePackInput(packInput);
  const sourceFile = await resolveOptionalEvidenceFile(root, options.sourceFile || options.file || "", {
    fallbackLabel: receipt.source?.label || ""
  });
  const contextFile = await resolveOptionalEvidenceFile(root, options.contextFile || options.context || "");
  const sourceText = options.storeSourceText
    ? await readOptionalText(root, {
      file: sourceFile,
      text: options.sourceText || options.text || ""
    })
    : "";
  const deliveredText = await readOptionalText(root, {
    file: contextFile,
    text: options.contextText || pack?.context?.text || ""
  });
  const entry = buildRegistryEntry(root, receipt, {
    sourceFile,
    contextFile,
    sourceText,
    deliveredText,
    note: options.note || ""
  });
  const entries = [
    ...existing.entries.filter((candidate) => candidate.context_pack_id !== entry.context_pack_id),
    entry
  ].sort((left, right) => String(left.registered_at).localeCompare(String(right.registered_at)));
  const registry = buildContextPackRegistry(entries, {
    root,
    path: registryPath
  });

  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

  return {
    schema: "ContextPackRegistryWriteResultV1",
    path: registryPath,
    entry,
    totals: registry.totals
  };
}

export async function buildContextPackRegistryReport(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const registryPath = resolveRegistryPath(root, options.registry || options.out || DEFAULT_CONTEXT_PACK_REGISTRY_PATH);
  const registry = await readRegistryFile(registryPath);

  return buildContextPackRegistry(registry.entries, {
    root,
    path: registryPath
  });
}

export async function verifyRegisteredContextPack(rootPath, options = {}) {
  const root = path.resolve(rootPath || ".");
  const registryPath = resolveRegistryPath(root, options.registry || DEFAULT_CONTEXT_PACK_REGISTRY_PATH);
  const contextPackId = String(options.contextPackId || options.context_pack_id || "").trim();
  const registry = await readRegistryFile(registryPath);

  if (!contextPackId) {
    return buildRegistryVerificationFailure({
      root,
      registryPath,
      contextPackId: "",
      status: "context-pack-id-required",
      reason: "context-pack-id-required"
    });
  }

  const entry = registry.entries.find((candidate) => candidate.context_pack_id === contextPackId);
  if (!entry) {
    return buildRegistryVerificationFailure({
      root,
      registryPath,
      contextPackId,
      status: "context-pack-id-not-found",
      reason: "context-pack-id-not-found"
    });
  }

  const receiptHash = `sha256:${sha256(JSON.stringify(entry.receipt))}`;
  const sourceText = await readVerificationText(root, {
    file: options.sourceFile || options.file || entry.source?.file || "",
    text: options.sourceText || options.text || entry.source?.text || ""
  });
  const deliveredText = await readVerificationText(root, {
    file: options.contextFile || options.context || entry.delivered_context?.file || "",
    text: options.contextText || entry.delivered_context?.text || ""
  });
  const receiptVerification = buildReceiptVerification(entry.receipt, {
    sourceText,
    deliveredText
  });
  const registryChecks = [
    buildCheck("registry-entry-schema", entry.schema === "ContextPackRegistryEntryV1", {
      reason: entry.schema === "ContextPackRegistryEntryV1" ? "" : "registry-entry-schema-mismatch"
    }),
    buildCheck("context-pack-id-match", entry.receipt?.context_pack_id === contextPackId, {
      expected: contextPackId,
      actual: entry.receipt?.context_pack_id || "",
      reason: entry.receipt?.context_pack_id === contextPackId ? "" : "context-pack-id-mismatch"
    }),
    buildCheck("registry-receipt-hash", receiptHash === entry.receipt_hash, {
      expected: entry.receipt_hash || "",
      actual: receiptHash,
      reason: receiptHash === entry.receipt_hash ? "" : "registry-receipt-hash-mismatch"
    })
  ];
  const failures = [
    ...registryChecks.filter((check) => check.required && check.status !== "passed").map((check) => ({
      check: check.name,
      reason: check.reason
    })),
    ...receiptVerification.failures
  ];
  const verified = failures.length === 0 && receiptVerification.verified;

  return {
    schema: "ContextPackRegistryVerificationV1",
    context_pack_id: contextPackId,
    root,
    registry_path: registryPath,
    entry_id: entry.entry_id,
    verified,
    status: verified ? "verified-context-pack-id" : "context-pack-id-needs-review",
    checked_at: new Date().toISOString(),
    registry_checks: registryChecks,
    receipt_verification: receiptVerification,
    source: {
      file: options.sourceFile || options.file || entry.source?.file || null,
      hash: entry.source?.hash || "",
      text_available: Boolean(sourceText)
    },
    delivered_context: {
      file: options.contextFile || options.context || entry.delivered_context?.file || null,
      hash: entry.delivered_context?.hash || "",
      text_available: Boolean(deliveredText)
    },
    failures,
    next_actions: buildVerificationNextActions(verified, failures)
  };
}

export function buildContextPackRegistry(entries = [], options = {}) {
  const normalizedEntries = entries.map((entry) => ({ ...entry }));
  const verifiedReceipts = normalizedEntries.filter((entry) => (
    ["verified-publishable", "verified-expanded-context", "fallback-full-context"].includes(entry.gate_status)
  )).length;
  const sourceFiles = normalizedEntries.filter((entry) => entry.source?.file).length;
  const sourceTexts = normalizedEntries.filter((entry) => entry.source?.text_stored).length;
  const deliveredContexts = normalizedEntries.filter((entry) => (
    entry.delivered_context?.file || entry.delivered_context?.text_stored
  )).length;

  return {
    schema: "ContextPackRegistryV1",
    registry_id: `contextpack-registry-${sha256(`${options.path || ""}:${normalizedEntries.map((entry) => entry.entry_id).join("|")}`).slice(0, 12)}`,
    path: options.path || null,
    root: options.root || null,
    updated_at: new Date().toISOString(),
    totals: {
      entries: normalizedEntries.length,
      verified_receipts: verifiedReceipts,
      source_files: sourceFiles,
      stored_source_texts: sourceTexts,
      delivered_contexts: deliveredContexts
    },
    entries: normalizedEntries
  };
}

export function formatContextPackRegistryReport(registry) {
  const rows = registry.entries.slice(-12).map((entry) => (
    `- ${entry.context_pack_id}: ${entry.gate_status}, Quelle=${entry.source?.file || entry.source?.label || "n/a"}, Kontext=${entry.delivered_context?.text_stored || entry.delivered_context?.file ? "hinterlegt" : "nicht hinterlegt"}`
  )).join("\n") || "- keine Einträge";

  return `
# ContextPackRegistryV1

Pfad: ${registry.path || "nicht gespeichert"}

- Einträge: ${formatNumber(registry.totals.entries)}
- Verifizierbare Receipts: ${formatNumber(registry.totals.verified_receipts)}
- Quellpfade: ${formatNumber(registry.totals.source_files)}
- Gespeicherte Quelltexte: ${formatNumber(registry.totals.stored_source_texts)}
- Hinterlegte Lieferkontexte: ${formatNumber(registry.totals.delivered_contexts)}

## Letzte Einträge

${rows}
`.trim();
}

export function formatContextPackRegistryVerificationReport(verification) {
  return `
# ContextPackRegistryVerificationV1

ContextPack: ${verification.context_pack_id || "unbekannt"}
Status: ${verification.status}
Registry: ${verification.registry_path}

- Receipt: ${verification.receipt_verification?.status || "nicht geprüft"}
- Quelle: ${verification.source?.file || "kein Pfad"} (${verification.source?.text_available ? "Text verfügbar" : "Text fehlt"})
- Gelieferter Kontext: ${verification.delivered_context?.file || "Registry/Text"} (${verification.delivered_context?.text_available ? "Text verfügbar" : "Text fehlt"})

## Registry Checks

${verification.registry_checks?.length ? verification.registry_checks.map((check) => `- ${check.name}: ${check.status}${check.reason ? ` (${check.reason})` : ""}`).join("\n") : "- keine"}

## Fehler

${verification.failures.length ? verification.failures.map((failure) => `- ${failure.check}: ${failure.reason}`).join("\n") : "- keine"}

## Nächste Schritte

${verification.next_actions.map((action) => `- ${action}`).join("\n")}
`.trim();
}

async function readRegistryFile(registryPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(registryPath, "utf8"));
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch (error) {
    if (error.code === "ENOENT") return { entries: [] };
    throw error;
  }
}

function buildRegistryEntry(root, receipt, options = {}) {
  const sourceText = normalizeMaybeText(options.sourceText || "");
  const deliveredText = normalizeMaybeText(options.deliveredText || "");
  const sourceFile = options.sourceFile ? toStableFileRef(root, options.sourceFile) : "";
  const contextFile = options.contextFile ? toStableFileRef(root, options.contextFile) : "";
  const entrySeed = [
    receipt.context_pack_id,
    receipt.created_at,
    receipt.source?.hash,
    receipt.delivered_context?.hash
  ].join(":");

  return {
    schema: "ContextPackRegistryEntryV1",
    entry_id: `ctxreg-${sha256(entrySeed).slice(0, 12)}`,
    context_pack_id: receipt.context_pack_id,
    registered_at: new Date().toISOString(),
    created_at: receipt.created_at,
    note: options.note || "",
    label: receipt.source?.label || "ContextPack",
    source: {
      label: receipt.source?.label || "",
      hash: receipt.source?.hash || "",
      file: sourceFile || null,
      text_stored: Boolean(sourceText),
      ...(sourceText ? { text: sourceText } : {})
    },
    delivered_context: {
      hash: receipt.delivered_context?.hash || "",
      mode: receipt.delivered_context?.mode || "",
      tokens: Number(receipt.delivered_context?.tokens) || 0,
      file: contextFile || null,
      text_stored: Boolean(deliveredText),
      ...(deliveredText ? { text: deliveredText } : {})
    },
    gate_status: receipt.gate?.status || "unknown",
    receipt_hash: `sha256:${sha256(JSON.stringify(receipt))}`,
    receipt,
    load_hint: `sparkompass contextpack verify . --context-pack-id ${receipt.context_pack_id}`
  };
}

function buildRegistryVerificationFailure({ root, registryPath, contextPackId, status, reason }) {
  return {
    schema: "ContextPackRegistryVerificationV1",
    context_pack_id: contextPackId || null,
    root,
    registry_path: registryPath,
    entry_id: null,
    verified: false,
    status,
    checked_at: new Date().toISOString(),
    registry_checks: [
      buildCheck("registry-lookup", false, { reason })
    ],
    receipt_verification: null,
    source: {
      file: null,
      hash: "",
      text_available: false
    },
    delivered_context: {
      file: null,
      hash: "",
      text_available: false
    },
    failures: [
      { check: "registry-lookup", reason }
    ],
    next_actions: buildVerificationNextActions(false, [{ check: "registry-lookup", reason }])
  };
}

async function resolveOptionalEvidenceFile(root, file, options = {}) {
  if (file) return path.resolve(root, String(file));
  const fallback = String(options.fallbackLabel || "").trim();
  if (!fallback || fallback === "--text" || fallback === "stdin" || fallback.includes(",")) return "";
  const candidate = path.resolve(root, fallback);
  try {
    const stats = await fs.stat(candidate);
    return stats.isFile() ? candidate : "";
  } catch {
    return "";
  }
}

async function readOptionalText(root, options = {}) {
  if (options.file) return fs.readFile(path.resolve(root, String(options.file)), "utf8");
  return options.text || "";
}

async function readVerificationText(root, options = {}) {
  if (options.file) return fs.readFile(path.resolve(root, String(options.file)), "utf8");
  return options.text || "";
}

function normalizePackInput(value) {
  const receipt = value?.receipt || value;
  if (!receipt || receipt.schema !== "ContextPackReceiptV1") {
    throw new Error("Expected a ContextPackReceiptV1 receipt or a pack object with .receipt.");
  }
  return {
    receipt,
    pack: value?.receipt ? value : null
  };
}

function buildCheck(name, passed, details = {}) {
  return {
    schema: "ContextPackRegistryVerificationCheckV1",
    name,
    status: passed ? "passed" : "failed",
    required: details.required ?? true,
    reason: details.reason || "",
    ...Object.fromEntries(Object.entries(details).filter(([key]) => !["required", "reason"].includes(key)))
  };
}

function buildVerificationNextActions(verified, failures = []) {
  if (verified) {
    return [
      "ContextPack kann per context_pack_id wiederverwendet werden.",
      "Nutze bei Bedarf sparkompass_load_source_hash für begrenzte Rohquellen-Auszüge."
    ];
  }
  const reasons = new Set(failures.map((failure) => failure.reason));
  if (reasons.has("source-text-required")) {
    return [
      "Registriere das Pack mit --source-file oder prüfe erneut mit --source-file.",
      "Wenn keine Datei existiert, nutze --store-source-text bewusst für lokale Registry-Prüfung."
    ];
  }
  if (reasons.has("context-pack-id-not-found")) {
    return [
      "Registriere das Pack zuerst mit sparkompass contextpack register --pack pack.json.",
      "Prüfe, ob --registry auf dieselbe ContextPackRegistryV1-Datei zeigt."
    ];
  }
  return [
    "Öffne die Fehlerdetails und vergleiche Receipt, Quelle und gelieferten Kontext.",
    "Bei Hash-Abweichungen muss der ContextPack neu erzeugt oder die passende Quelle geladen werden."
  ];
}

function toStableFileRef(root, file) {
  const absolutePath = path.resolve(root, String(file));
  const relative = path.relative(root, absolutePath);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative || ".";
  return absolutePath;
}

function normalizeMaybeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function resolveRegistryPath(root, registryPath) {
  if (path.isAbsolute(String(registryPath))) return String(registryPath);
  return path.resolve(root, String(registryPath));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
