import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupContext } from "./context-cache.mjs";
import { DEFAULT_CONTEXT_PACK_REGISTRY_PATH, registerContextPack, verifyRegisteredContextPack } from "./context-pack-registry.mjs";
import { buildContextPack } from "./context-pack.mjs";
import { buildContextInventory } from "./inventory.mjs";
import { formatNumber } from "./token-estimator.mjs";

const DEFAULT_SEMANTIC_CACHE_PATH = ".sparkompass/semantic-cache.json";
const CACHE_SCHEMA = "VerifiedSemanticCacheV1";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");

export async function addSemanticCacheEntry(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const outputPath = path.resolve(root, options.out || DEFAULT_SEMANTIC_CACHE_PATH);
  const query = normalizeQuery(options.query);
  if (!query) throw new Error("Bitte Query angeben: sparkompass semantic-cache add . --query \"...\"");

  const { text, label } = await readContextInput(root, options);
  const lookup = await lookupContext(root, {
    query,
    budget: Number(options.budget) || 400,
    maxFiles: Number(options.maxFiles) || 300
  });
  if (lookup.selected_count === 0) {
    throw new Error(`Keine semantischen Abhängigkeiten für Query gefunden: ${query}`);
  }
  const dependencies = await buildDependencyEvidence(root, lookup.selected);
  const pack = buildContextPack(text, {
    label,
    targetPercent: Number(options.targetPercent) || 35,
    riskProfile: String(options.riskProfile || "balanced"),
    mode: options.mode || "auto",
    keep: Array.isArray(options.keep) ? options.keep : [],
    expect: asArray(options.expect),
    expectRegex: asArray(options.expectRegex)
  });
  const inventoryFingerprint = await buildInventoryFingerprint(root, options);
  const toolFingerprint = await buildToolFingerprint(options);
  const registryWrite = options.registry
    ? await registerContextPack(root, pack, {
      registry: options.registry === true ? DEFAULT_CONTEXT_PACK_REGISTRY_PATH : String(options.registry),
      sourceFile: options.file ? String(options.file) : "",
      sourceText: text,
      storeSourceText: Boolean(options.storeSourceText),
      note: "semantic-cache"
    })
    : null;
  const registryVerification = registryWrite
    ? await verifyRegisteredContextPack(root, {
      registry: registryWrite.path,
      contextPackId: pack.receipt.context_pack_id
    })
    : null;
  const cache = await loadSemanticCacheIfExists(outputPath);
  const entry = buildEntry({
    root,
    query,
    lookup,
    dependencies,
    pack,
    inventoryFingerprint,
    toolFingerprint,
    registryWrite,
    registryVerification,
    oracle: asArray(options.oracle),
    contextExpectations: buildContextExpectations(options),
    contextText: pack.context.text
  });
  const nextCache = {
    schema: CACHE_SCHEMA,
    root,
    cache_id: `semantic-cache-${sha256(`${cache.entries.length}:${entry.entry_id}:${Date.now()}`).slice(0, 12)}`,
    updated_at: new Date().toISOString(),
    entries: [
      ...cache.entries.filter((candidate) => candidate.entry_id !== entry.entry_id),
      entry
    ]
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(nextCache, null, 2)}\n`, "utf8");

  return {
    schema: "VerifiedSemanticCacheAddResultV1",
    path: outputPath,
    entry,
    cache: {
      cache_id: nextCache.cache_id,
      entries: nextCache.entries.length
    }
  };
}

export async function lookupSemanticCache(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const cachePath = path.resolve(root, options.cache || DEFAULT_SEMANTIC_CACHE_PATH);
  const query = normalizeQuery(options.query);
  if (!query) throw new Error("Bitte Query angeben: sparkompass semantic-cache lookup . --query \"...\"");

  const cache = await loadSemanticCache(cachePath);
  const lookup = await lookupContext(root, {
    query,
    budget: Number(options.budget) || 400,
    maxFiles: Number(options.maxFiles) || 300
  });
  const currentDependencies = await buildDependencyEvidence(root, lookup.selected);
  const inventoryFingerprint = await buildInventoryFingerprint(root, options);
  const toolFingerprint = await buildToolFingerprint(options);
  const oracle = asArray(options.oracle);
  const contextExpectations = buildContextExpectations(options);
  const verificationPolicy = buildVerificationPolicy({
    minSimilarity: options.minSimilarity,
    oracle,
    contextExpectations
  });
  const evaluated = [];

  for (const entry of cache.entries) {
    evaluated.push(await evaluateEntry({
      root,
      entry,
      query,
      oracle,
      contextExpectations,
      currentDependencies,
      inventoryFingerprint,
      toolFingerprint,
      verificationPolicy
    }));
  }

  const hits = evaluated
    .filter((item) => item.hit)
    .sort((a, b) => b.score - a.score || b.similarity - a.similarity);
  const best = hits[0] || null;

  return {
    schema: "VerifiedSemanticCacheLookupResultV1",
    root,
    cache_path: cachePath,
    query,
    hit: Boolean(best),
    best,
    evaluated: evaluated.map((item) => ({
      entry_id: item.entry.entry_id,
      query: item.entry.query,
      hit: item.hit,
      score: item.score,
      similarity: item.similarity,
      required_similarity: item.required_similarity,
      verification: item.verification
    })),
    current: {
      lookup_schema: lookup.schema,
      selected_count: lookup.selected_count,
      dependency_count: currentDependencies.length,
      inventory_hash: inventoryFingerprint.inventory_hash,
      tool_fingerprint_hash: toolFingerprint.fingerprint_hash
    },
    verification_policy: verificationPolicy
  };
}

export async function loadSemanticCache(cachePath) {
  const cache = JSON.parse(await fs.readFile(path.resolve(cachePath), "utf8"));
  if (cache.schema !== CACHE_SCHEMA) {
    throw new Error(`Unsupported semantic cache schema: ${cache.schema}`);
  }
  return cache;
}

export function formatSemanticCacheAddReport(result) {
  return `
# Verified Semantic Cache

Pfad: ${result.path}
Entry-ID: ${result.entry.entry_id}

- Query: ${result.entry.query}
- Abhängigkeiten: ${formatNumber(result.entry.dependencies.length)}
- Tool-Fingerprint: ${result.entry.tool_fingerprint?.fingerprint_hash || "fehlt"}
- Oracle-Hash: ${result.entry.acceptance_oracle.hash || "keines"}
- Context-Expectation-Hash: ${result.entry.acceptance_oracle.context_expectations.hash || "keines"}
- ContextPack: ${result.entry.context_pack.context_pack_id}
- ContextPack-Registry: ${result.entry.context_pack.registry?.status || "not-registered"}
- Gate: ${result.entry.context_pack.gate_status}
- Cache-Einträge: ${formatNumber(result.cache.entries)}
`.trim();
}

export function formatSemanticCacheLookupReport(result) {
  const status = result.hit ? "hit" : "miss";
  const best = result.best;
  const reasons = best
    ? best.verification.reasons.map((reason) => `- ${reason}`).join("\n")
    : result.evaluated.flatMap((item) => item.verification.reasons.map((reason) => `- ${item.entry_id}: ${reason}`)).slice(0, 12).join("\n");

  return `
# Verified Semantic Cache Lookup

Cache: ${result.cache_path}
Query: ${result.query}
Status: ${status}

- Geprüfte Einträge: ${formatNumber(result.evaluated.length)}
- Aktuelle Abhängigkeiten: ${formatNumber(result.current.dependency_count)}
- Inventar-Hash: ${result.current.inventory_hash}
- Tool-Fingerprint: ${result.current.tool_fingerprint_hash}
- Ähnlichkeitsschwelle: ${Math.round(result.verification_policy.required_similarity * 100)}% (${result.verification_policy.mode})
- Policy-Gründe: ${result.verification_policy.reasons.join(", ") || "keine"}

## Bester Treffer

${best ? formatBestHit(best) : "- kein verifizierter Treffer"}

## Prüfnotizen

${reasons || "- keine"}
`.trim();
}

async function evaluateEntry({ root, entry, query, oracle, contextExpectations, currentDependencies, inventoryFingerprint, toolFingerprint, verificationPolicy }) {
  const reasons = [];
  const similarity = querySimilarity(query, entry.query);
  const dependencyVerification = await verifyDependencies(root, entry.dependencies, currentDependencies);
  const oracleVerification = verifyOracle(entry, oracle);
  const contextExpectationVerification = verifyContextExpectations(entry, contextExpectations);
  const receiptVerification = verifyReceipt(entry.context_pack.receipt);
  const toolFingerprintVerification = verifyToolFingerprint(entry, toolFingerprint);
  const registryVerification = await verifyContextPackRegistry(root, entry);
  const exactInventory = entry.inventory_hash === inventoryFingerprint.inventory_hash;
  const requiredSimilarity = exactInventory && dependencyVerification.ok
    ? verificationPolicy.exact_inventory_similarity
    : verificationPolicy.required_similarity;

  if (similarity < requiredSimilarity) reasons.push(`query-similarity-below-threshold:${similarity}<${requiredSimilarity}`);
  if (!dependencyVerification.ok) reasons.push(...dependencyVerification.reasons);
  if (!oracleVerification.ok) reasons.push(...oracleVerification.reasons);
  if (!contextExpectationVerification.ok) reasons.push(...contextExpectationVerification.reasons);
  if (!receiptVerification.ok) reasons.push(...receiptVerification.reasons);
  if (!toolFingerprintVerification.ok) reasons.push(...toolFingerprintVerification.reasons);
  if (!registryVerification.ok) reasons.push(...registryVerification.reasons);
  if (exactInventory) reasons.push("exact-inventory-match");
  if (!exactInventory && dependencyVerification.ok) reasons.push("dependency-verified-partial-reuse");

  const hit = (
    similarity >= requiredSimilarity
    && dependencyVerification.ok
    && oracleVerification.ok
    && contextExpectationVerification.ok
    && receiptVerification.ok
    && toolFingerprintVerification.ok
    && registryVerification.ok
  );

  return {
    hit,
    score: Math.round((similarity * 100) + (exactInventory ? 15 : 0) + (dependencyVerification.ok ? 20 : 0) + (oracleVerification.ok ? 10 : 0) + (contextExpectationVerification.ok ? 10 : 0) + (toolFingerprintVerification.ok ? 10 : 0)),
    similarity,
    required_similarity: requiredSimilarity,
    entry,
    context: hit ? entry.context : null,
    verification: {
      policy: verificationPolicy,
      required_similarity: requiredSimilarity,
      exact_inventory_match: exactInventory,
      dependencies_ok: dependencyVerification.ok,
      oracle_ok: oracleVerification.ok,
      context_expectations_ok: contextExpectationVerification.ok,
      receipt_ok: receiptVerification.ok,
      tool_fingerprint_ok: toolFingerprintVerification.ok,
      context_pack_registry_ok: registryVerification.ok,
      context_pack_registry_status: registryVerification.status,
      context_pack_registry: registryVerification.summary,
      tool_fingerprint_hash: entry.tool_fingerprint?.fingerprint_hash || "",
      current_tool_fingerprint_hash: toolFingerprint.fingerprint_hash,
      reasons
    }
  };
}

function buildEntry({ root, query, lookup, dependencies, pack, inventoryFingerprint, toolFingerprint, registryWrite, registryVerification, oracle, contextExpectations, contextText }) {
  const oracleHash = oracle.length ? `sha256:${sha256(JSON.stringify(oracle))}` : "";
  const expectationHash = contextExpectations.hash;
  const dependencyHash = `sha256:${sha256(JSON.stringify(dependencies.map((item) => ({
    identity_key: item.identity_key,
    file_hash: item.file_hash,
    source_hash: item.source_hash
  }))))}`;
  const entryId = `sem-${sha256(`${query}:${dependencyHash}:${oracleHash}:${expectationHash}:${pack.receipt.context_pack_id}`).slice(0, 12)}`;

  return {
    schema: "VerifiedSemanticCacheEntryV1",
    entry_id: entryId,
    root,
    created_at: new Date().toISOString(),
    query,
    query_terms: tokenize(query),
    inventory_hash: inventoryFingerprint.inventory_hash,
    tool_fingerprint: toolFingerprint,
    dependency_hash: dependencyHash,
    dependencies,
    acceptance_oracle: {
      items: oracle,
      hash: oracleHash,
      context_expectations: contextExpectations
    },
    context_pack: {
      context_pack_id: pack.receipt.context_pack_id,
      source_hash: pack.sourceHash,
      gate_status: pack.receipt.gate.status,
      receipt: pack.receipt,
      registry: buildRegistryContract(pack, registryWrite, registryVerification)
    },
    context: {
      mode: pack.context.mode,
      text: contextText,
      stats: pack.context.stats,
      text_hash: `sha256:${sha256(contextText)}`
    }
  };
}

function buildRegistryContract(pack, registryWrite, registryVerification) {
  if (!registryWrite) {
    return {
      schema: "SemanticCacheContextPackRegistryContractV1",
      status: "not-registered",
      verified: true,
      context_pack_id: pack.receipt.context_pack_id,
      registry_path: "",
      registry_entry_id: "",
      receipt_verification_status: "not-run",
      verify_hint: "",
      mcp_tool: "sparkompass_verify_context_pack"
    };
  }

  return {
    schema: "SemanticCacheContextPackRegistryContractV1",
    status: registryVerification?.verified ? "registered-and-verified" : "registered-needs-review",
    verified: Boolean(registryVerification?.verified),
    context_pack_id: pack.receipt.context_pack_id,
    registry_path: registryWrite.path,
    registry_entry_id: registryWrite.entry.entry_id,
    receipt_verification_status: registryVerification?.receipt_verification?.status || "not-run",
    verify_hint: `sparkompass contextpack verify . --context-pack-id ${pack.receipt.context_pack_id} --registry ${registryWrite.path}`,
    mcp_tool: "sparkompass_verify_context_pack"
  };
}

async function buildToolFingerprint(options = {}) {
  const packageJson = await readPackageJson();
  const dependencyVersions = Object.entries(packageJson.dependencies || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => ({ name, version }));
  const externalToolVersions = asArray(options.toolVersion)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .sort();
  const payload = {
    schema: "SemanticCacheToolFingerprintV1",
    runtime: {
      name: "node",
      version: process.versions.node
    },
    sparkompass: {
      package_name: packageJson.name || "codex-sparkompass",
      package_version: packageJson.version || "0.0.0"
    },
    dependencies: dependencyVersions,
    external_tools: externalToolVersions
  };

  return {
    ...payload,
    fingerprint_hash: `sha256:${sha256(JSON.stringify(payload))}`
  };
}

async function readPackageJson() {
  try {
    return JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "package.json"), "utf8"));
  } catch {
    return {
      name: "codex-sparkompass",
      version: "0.0.0",
      dependencies: {}
    };
  }
}

async function buildInventoryFingerprint(root, options) {
  const inventory = await buildContextInventory(root, {
    maxFiles: Number(options.maxFiles) || 300
  });
  const units = inventory.units.map((unit) => ({
    identity_key: identityKey(unit),
    source_hash: unit.source_hash
  }));
  return {
    inventory_hash: `sha256:${sha256(JSON.stringify(units))}`,
    unit_count: units.length
  };
}

async function buildDependencyEvidence(root, units) {
  const evidence = [];
  const fileHashes = new Map();

  for (const unit of units) {
    const absolutePath = path.resolve(root, unit.file);
    if (!fileHashes.has(unit.file)) {
      fileHashes.set(unit.file, `sha256:${sha256(await fs.readFile(absolutePath, "utf8"))}`);
    }
    evidence.push({
      unit_id: unit.id,
      identity_key: identityKey(unit),
      type: unit.type,
      name: unit.name,
      file: unit.file,
      line: unit.line,
      source_hash: unit.source_hash,
      file_hash: fileHashes.get(unit.file)
    });
  }

  return evidence;
}

async function verifyDependencies(root, cachedDependencies, currentDependencies) {
  const reasons = [];
  const currentByIdentity = new Map(currentDependencies.map((item) => [item.identity_key, item]));

  for (const cached of cachedDependencies) {
    const current = currentByIdentity.get(cached.identity_key);
    if (!current) {
      reasons.push(`missing-dependency:${cached.identity_key}`);
      continue;
    }
    if (current.source_hash !== cached.source_hash) {
      reasons.push(`changed-unit:${cached.identity_key}`);
    }
    if (current.file_hash !== cached.file_hash) {
      reasons.push(`changed-file:${cached.file}`);
    }
  }

  for (const cached of cachedDependencies) {
    if (currentByIdentity.has(cached.identity_key)) continue;
    try {
      const text = await fs.readFile(path.resolve(root, cached.file), "utf8");
      if (`sha256:${sha256(text)}` === cached.file_hash) {
        reasons.push(`dependency-not-selected-but-file-stable:${cached.identity_key}`);
      }
    } catch {
      // The missing-dependency reason above is enough.
    }
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}

function verifyOracle(entry, oracle) {
  const expected = entry.acceptance_oracle?.hash || "";
  const actual = oracle.length ? `sha256:${sha256(JSON.stringify(oracle))}` : "";
  const reasons = [];

  if (expected && !actual) reasons.push("oracle-required-but-not-provided");
  if (expected && actual && expected !== actual) reasons.push("oracle-mismatch");
  if (!expected && actual) reasons.push("entry-has-no-oracle-for-request");

  return {
    ok: reasons.length === 0,
    reasons
  };
}

function verifyContextExpectations(entry, contextExpectations) {
  const expected = entry.acceptance_oracle?.context_expectations?.hash || "";
  const actual = contextExpectations.hash || "";
  const reasons = [];

  if (expected && !actual) reasons.push("context-expectations-required-but-not-provided");
  if (expected && actual && expected !== actual) reasons.push("context-expectations-mismatch");
  if (!expected && actual) reasons.push("entry-has-no-context-expectations-for-request");

  return {
    ok: reasons.length === 0,
    reasons
  };
}

function verifyReceipt(receipt) {
  const reasons = [];
  if (receipt?.critical_anchors?.retention_percent !== 100) reasons.push("critical-anchor-retention-not-100");
  if (receipt?.source_evidence?.coverage !== 1) reasons.push("source-evidence-coverage-not-100");
  if (receipt?.quality?.risky) reasons.push("risky-context-pack");
  if (receipt?.acceptance_oracle?.enabled && !receipt.acceptance_oracle?.delivered?.success) {
    reasons.push("acceptance-oracle-not-satisfied");
  }
  if (!["verified-publishable", "verified-expanded-context", "fallback-full-context"].includes(receipt?.gate?.status)) {
    reasons.push(`unsupported-gate:${receipt?.gate?.status || "missing"}`);
  }
  return {
    ok: reasons.length === 0,
    reasons
  };
}

function verifyToolFingerprint(entry, currentFingerprint) {
  const reasons = [];
  const cached = entry.tool_fingerprint;
  if (!cached?.fingerprint_hash) {
    reasons.push("tool-fingerprint-missing");
  } else if (cached.fingerprint_hash !== currentFingerprint.fingerprint_hash) {
    reasons.push("tool-fingerprint-mismatch");
  }
  return {
    ok: reasons.length === 0,
    reasons
  };
}

async function verifyContextPackRegistry(root, entry) {
  const contract = entry.context_pack?.registry;
  if (!contract || contract.status === "not-registered") {
    return {
      ok: true,
      status: "not-registered",
      reasons: [],
      summary: {
        schema: "SemanticCacheContextPackRegistryVerificationSummaryV1",
        required: false,
        context_pack_id: entry.context_pack?.context_pack_id || "",
        registry_path: "",
        receipt_verification_status: "not-run"
      }
    };
  }

  const verification = await verifyRegisteredContextPack(root, {
    registry: contract.registry_path,
    contextPackId: contract.context_pack_id || entry.context_pack?.context_pack_id || ""
  });
  const reasons = verification.verified
    ? []
    : verification.failures.map((failure) => `context-pack-registry-${failure.reason || failure.check}`);

  return {
    ok: verification.verified,
    status: verification.status,
    reasons,
    summary: {
      schema: "SemanticCacheContextPackRegistryVerificationSummaryV1",
      required: true,
      context_pack_id: verification.context_pack_id,
      registry_path: verification.registry_path,
      registry_entry_id: verification.entry_id,
      receipt_verification_status: verification.receipt_verification?.status || "not-run",
      source_text_available: Boolean(verification.source?.text_available),
      delivered_context_text_available: Boolean(verification.delivered_context?.text_available)
    }
  };
}

async function readContextInput(root, options) {
  if (options.file) {
    const filePath = path.resolve(root, String(options.file));
    assertInsideRoot(root, filePath);
    return {
      text: await fs.readFile(filePath, "utf8"),
      label: options.label || String(options.file)
    };
  }

  if (typeof options.text === "string" && options.text.trim()) {
    return {
      text: options.text,
      label: options.label || "semantic-cache-text"
    };
  }

  throw new Error("Bitte Text oder Datei angeben: semantic-cache add --file notes.txt oder --text \"...\"");
}

async function loadSemanticCacheIfExists(cachePath) {
  try {
    return await loadSemanticCache(cachePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        schema: CACHE_SCHEMA,
        root: path.dirname(path.dirname(cachePath)),
        cache_id: "semantic-cache-empty",
        updated_at: new Date().toISOString(),
        entries: []
      };
    }
    throw error;
  }
}

function formatBestHit(hit) {
  return [
    `- Entry: ${hit.entry.entry_id}`,
    `- Query-Ähnlichkeit: ${Math.round(hit.similarity * 100)}% (Schwelle ${Math.round(hit.required_similarity * 100)}%)`,
    `- Score: ${hit.score}`,
    `- ContextPack: ${hit.entry.context_pack.context_pack_id}`,
    `- Kontext-Tokens: ${formatNumber(hit.entry.context.stats.estimatedTokens)}`,
    `- Kontext-Hash: ${hit.entry.context.text_hash}`
  ].join("\n");
}

function buildVerificationPolicy(input = {}) {
  const explicit = Number(input.minSimilarity);
  const hasExplicit = Number.isFinite(explicit) && explicit > 0;
  const oracle = Array.isArray(input.oracle) ? input.oracle : [];
  const expectations = input.contextExpectations || {};
  const hasContextExpectations = Boolean(expectations.hash);
  const reasons = [];
  let required = 0.6;

  if (hasExplicit) {
    required = clampSimilarity(explicit);
    reasons.push("user-min-similarity");
  } else {
    reasons.push("default-similarity");
  }

  if (oracle.length) {
    required = Math.max(0.55, required - 0.05);
    reasons.push("oracle-provided");
  } else {
    required = Math.max(0.7, required + 0.1);
    reasons.push("oracle-missing");
  }

  if (hasContextExpectations) {
    required = Math.max(0.5, required - 0.05);
    reasons.push("context-expectations-provided");
  } else {
    required = Math.max(0.7, required + 0.05);
    reasons.push("context-expectations-missing");
  }

  return {
    schema: "SemanticCacheVerificationPolicyV1",
    mode: hasExplicit ? "explicit-min-similarity" : "adaptive",
    requested_min_similarity: hasExplicit ? clampSimilarity(explicit) : null,
    required_similarity: clampSimilarity(required),
    exact_inventory_similarity: 0.3,
    reasons
  };
}

function clampSimilarity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.6;
  return Number(Math.max(0, Math.min(1, number)).toFixed(3));
}

function querySimilarity(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((term) => b.has(term)).length;
  const union = new Set([...a, ...b]).size;
  return Number((intersection / union).toFixed(3));
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9_$.-]+/i)
    .filter((term) => term.length > 1);
}

function normalizeQuery(value) {
  return String(value || "").trim();
}

function asArray(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function buildContextExpectations(options = {}) {
  const exact = asArray(options.expect);
  const regex = asArray(options.expectRegex);
  const payload = { exact, regex };
  return {
    exact,
    regex,
    hash: exact.length || regex.length ? `sha256:${sha256(JSON.stringify(payload))}` : ""
  };
}

function identityKey(unit) {
  return `${unit.type}:${unit.file}:${unit.name}`;
}

function assertInsideRoot(root, absolutePath) {
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolutePath !== root && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes rootPath: ${absolutePath}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
