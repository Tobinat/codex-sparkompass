import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildContextInventory } from "./inventory.mjs";
import { formatNumber } from "./token-estimator.mjs";

const DEFAULT_CACHE_PATH = ".sparkompass/context-cache.json";

export async function writeContextCache(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const outputPath = path.resolve(root, options.out || DEFAULT_CACHE_PATH);
  const inventory = await buildContextInventory(root, {
    maxFiles: options.maxFiles,
    excludeFiles: [outputPath]
  });
  const cache = buildCache(root, inventory);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");

  return {
    path: outputPath,
    cache
  };
}

export async function loadContextCache(cachePath) {
  return JSON.parse(await fs.readFile(path.resolve(cachePath), "utf8"));
}

export async function buildContextDelta(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const cachePath = path.resolve(root, options.cache || DEFAULT_CACHE_PATH);
  const previous = await loadContextCache(cachePath);
  const currentInventory = await buildContextInventory(root, {
    maxFiles: options.maxFiles,
    excludeFiles: [cachePath]
  });
  const current = buildCache(root, currentInventory);

  const previousByIdentity = new Map(previous.units.map((unit) => [unit.identity_key, unit]));
  const currentByIdentity = new Map(current.units.map((unit) => [unit.identity_key, unit]));

  const added = [];
  const removed = [];
  const changed = [];
  const stable = [];

  for (const unit of current.units) {
    const prior = previousByIdentity.get(unit.identity_key);
    if (!prior) {
      added.push(unit);
    } else if (prior.source_hash !== unit.source_hash) {
      changed.push({ before: prior, after: unit });
    } else {
      stable.push(unit);
    }
  }

  for (const unit of previous.units) {
    if (!currentByIdentity.has(unit.identity_key)) {
      removed.push(unit);
    }
  }

  return {
    schema: "ContextDeltaV1",
    root,
    cache_path: cachePath,
    previous_cache_id: previous.cache_id,
    current_cache_id: current.cache_id,
    generated_at: new Date().toISOString(),
    totals: {
      previous_units: previous.units.length,
      current_units: current.units.length,
      stable: stable.length,
      added: added.length,
      changed: changed.length,
      removed: removed.length,
      reuse_percent: current.units.length ? Math.round((stable.length / current.units.length) * 100) : 100
    },
    stable,
    added,
    changed,
    removed
  };
}

export async function lookupContext(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const query = String(options.query || "").trim();
  if (!query) {
    throw new Error("Bitte eine Query angeben: sparkompass lookup . --query \"...\"");
  }

  const budget = Number(options.budget) || 400;
  const inventory = await buildContextInventory(root, {
    maxFiles: options.maxFiles
  });
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = inventory.units
    .map((unit) => ({
      ...unit,
      score: scoreUnit(unit, terms)
    }))
    .filter((unit) => unit.score > 0)
    .sort((a, b) => b.score - a.score || a.estimated_tokens - b.estimated_tokens);

  const selected = [];
  let usedTokens = 0;
  for (const unit of scored) {
    if (selected.length > 0 && usedTokens + unit.estimated_tokens > budget) continue;
    selected.push(unit);
    usedTokens += unit.estimated_tokens;
    if (usedTokens >= budget) break;
  }

  return {
    schema: "ContextLookupV1",
    root,
    query,
    budget,
    used_tokens: usedTokens,
    selected_count: selected.length,
    selected,
    evidence: selected.map((unit, index) => ({
      evidence_id: `lookup-${String(index + 1).padStart(4, "0")}`,
      unit_id: unit.id,
      file: unit.file,
      line: unit.line,
      source_hash: unit.source_hash
    }))
  };
}

export function formatCacheReport(result) {
  return `
# Context Cache

Pfad: ${result.path}
Cache-ID: ${result.cache.cache_id}

- Dateien: ${formatNumber(result.cache.inventory.totals.files)}
- Einheiten: ${formatNumber(result.cache.units.length)}
- Inventar-Hash: ${result.cache.inventory_hash}
`.trim();
}

export function formatDeltaReport(delta) {
  return `
# Context Delta

Cache: ${delta.cache_path}

- Vorherige Einheiten: ${formatNumber(delta.totals.previous_units)}
- Aktuelle Einheiten: ${formatNumber(delta.totals.current_units)}
- Stabil: ${formatNumber(delta.totals.stable)}
- Neu: ${formatNumber(delta.totals.added)}
- Geändert: ${formatNumber(delta.totals.changed)}
- Entfernt: ${formatNumber(delta.totals.removed)}
- Wiederverwendung: ${delta.totals.reuse_percent}%

## Geänderte Einheiten

${formatChanged(delta)}
`.trim();
}

export function formatLookupReport(result) {
  const rows = result.selected.map((unit) => (
    `- ${unit.id} ${unit.type} ${unit.file}:${unit.line} ${unit.name} (${unit.estimated_tokens} Tokens)`
  )).join("\n");

  return `
# Context Lookup

Query: ${result.query}
Budget: ${formatNumber(result.budget)} Tokens
Genutzt: ${formatNumber(result.used_tokens)} Tokens

${rows || "- keine passenden Einheiten"}
`.trim();
}

function buildCache(root, inventory) {
  const units = inventory.units.map((unit) => ({
    ...unit,
    identity_key: identityKey(unit)
  }));
  const inventoryHash = `sha256:${sha256(JSON.stringify(units.map((unit) => ({
    identity_key: unit.identity_key,
    source_hash: unit.source_hash
  }))))}`;

  return {
    schema: "ContextCacheV1",
    cache_id: `cache-${inventoryHash.slice(7, 19)}`,
    root,
    created_at: new Date().toISOString(),
    inventory_hash: inventoryHash,
    inventory,
    units
  };
}

function identityKey(unit) {
  return `${unit.type}:${unit.file}:${unit.name}`;
}

function scoreUnit(unit, terms) {
  const haystack = `${unit.type} ${unit.name} ${unit.file}`.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (unit.name.toLowerCase() === term) score += 20;
    if (haystack.includes(term)) score += 8;
  }

  if (unit.type === "function" || unit.type === "log-error") score += 3;
  if (unit.type === "import" || unit.type === "config") score += 1;
  return score;
}

function formatChanged(delta) {
  const lines = [];
  for (const item of delta.changed.slice(0, 12)) {
    lines.push(`- ${item.after.identity_key}: ${item.before.source_hash.slice(0, 18)} -> ${item.after.source_hash.slice(0, 18)}`);
  }
  for (const item of delta.added.slice(0, 12)) {
    lines.push(`- neu ${item.identity_key}`);
  }
  for (const item of delta.removed.slice(0, 12)) {
    lines.push(`- entfernt ${item.identity_key}`);
  }
  return lines.join("\n") || "- keine Änderungen";
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
