import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildContextInventory } from "./inventory.mjs";
import { formatNumber } from "./token-estimator.mjs";

const CODE_TYPES = new Set(["function", "class", "export"]);
const CODE_EXTENSIONS = new Set([".mjs", ".js", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java"]);

export async function buildContextGraph(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const inventory = await buildContextInventory(root, {
    maxFiles: options.maxFiles
  });
  const files = [...new Set(inventory.units.map((unit) => unit.file))];
  const fileTexts = new Map();

  for (const file of files) {
    if (!CODE_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    fileTexts.set(file, await fs.readFile(path.join(root, file), "utf8"));
  }

  const nodes = inventory.units.map((unit) => ({
    id: unit.id,
    type: unit.type,
    name: unit.name,
    file: unit.file,
    line: unit.line,
    source_hash: unit.source_hash,
    estimated_tokens: unit.estimated_tokens
  }));
  const edges = buildEdges(inventory.units, fileTexts);
  const byType = edges.reduce((acc, edge) => {
    acc[edge.type] = (acc[edge.type] ?? 0) + 1;
    return acc;
  }, {});

  return {
    schema: "ContextGraphV1",
    root,
    generated_at: new Date().toISOString(),
    inventory_hash: `sha256:${sha256(JSON.stringify(inventory.units.map((unit) => unit.source_hash)))}`,
    totals: {
      nodes: nodes.length,
      edges: edges.length,
      by_edge_type: byType
    },
    nodes,
    edges
  };
}

export function findSymbolNeighborhood(graph, query, options = {}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    throw new Error("Bitte ein Symbol oder Suchwort angeben.");
  }

  const limit = Number(options.limit) || 80;
  const seeds = graph.nodes.filter((node) => (
    node.name.toLowerCase().includes(normalizedQuery)
    || node.file.toLowerCase().includes(normalizedQuery)
    || node.type.toLowerCase() === normalizedQuery
  ));
  const selectedNodeIds = new Set(seeds.map((node) => node.id));
  const selectedEdges = [];

  for (const edge of graph.edges) {
    if (selectedEdges.length >= limit) break;
    if (selectedNodeIds.has(edge.from) || selectedNodeIds.has(edge.to)) {
      selectedEdges.push(edge);
      selectedNodeIds.add(edge.from);
      selectedNodeIds.add(edge.to);
    }
  }

  return {
    schema: "ContextGraphNeighborhoodV1",
    query,
    seed_count: seeds.length,
    nodes: graph.nodes.filter((node) => selectedNodeIds.has(node.id)).slice(0, limit),
    edges: selectedEdges
  };
}

export function formatGraphReport(graph, neighborhood = null) {
  const byType = Object.entries(graph.totals.by_edge_type)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `- ${type}: ${formatNumber(count)}`)
    .join("\n");
  const previewEdges = (neighborhood?.edges || graph.edges).slice(0, 24)
    .map((edge) => `- ${edge.type}: ${edge.from} -> ${edge.to} (${edge.reason})`)
    .join("\n");
  const neighborhoodSummary = neighborhood
    ? `\n\n## Neighborhood\n\nQuery: ${neighborhood.query}\nSeeds: ${formatNumber(neighborhood.seed_count)}\nKnoten: ${formatNumber(neighborhood.nodes.length)}\nKanten: ${formatNumber(neighborhood.edges.length)}`
    : "";

  return `
# Context Graph

Pfad: ${graph.root}

- Knoten: ${formatNumber(graph.totals.nodes)}
- Kanten: ${formatNumber(graph.totals.edges)}

## Kantentypen

${byType || "- keine Kanten"}
${neighborhoodSummary}

## Vorschau

${previewEdges || "- keine Kanten"}
`.trim();
}

function buildEdges(units, fileTexts) {
  const edges = [];
  const edgeKeys = new Set();
  const unitsByFile = groupBy(units, (unit) => unit.file);
  const symbols = units.filter((unit) => CODE_TYPES.has(unit.type));
  const symbolsByName = groupBy(symbols, (unit) => unit.name);
  const symbolsByFile = groupBy(symbols, (unit) => unit.file);

  for (const [file, text] of fileTexts.entries()) {
    const fileUnits = unitsByFile.get(file) || [];
    const importUnits = fileUnits.filter((unit) => unit.type === "import");
    const fileSymbols = symbolsByFile.get(file) || [];

    for (const importUnit of importUnits) {
      const targetFiles = resolveImportTargets(file, importUnit.name, [...fileTexts.keys()]);
      for (const targetFile of targetFiles) {
        const targetSymbols = symbolsByFile.get(targetFile) || [];
        for (const target of targetSymbols.slice(0, 12)) {
          addEdge(edges, edgeKeys, {
            type: "imports-symbol",
            from: importUnit.id,
            to: target.id,
            reason: `local import from ${targetFile}`,
            evidence: {
              file,
              line: importUnit.line,
              source_hash: importUnit.source_hash
            }
          });
        }
      }
    }

    const spans = buildSymbolSpans(fileSymbols, text);
    for (const span of spans) {
      for (const [name, candidates] of symbolsByName.entries()) {
        if (name === span.unit.name && candidates.every((candidate) => candidate.file === file)) continue;
        if (!containsWord(span.text, name)) continue;

        for (const target of candidates.slice(0, 8)) {
          if (target.id === span.unit.id) continue;
          addEdge(edges, edgeKeys, {
            type: isTestFile(file) && !isTestFile(target.file) ? "tests-symbol" : "references-symbol",
            from: span.unit.id,
            to: target.id,
            reason: `mentions ${name}`,
            evidence: {
              file,
              line: span.unit.line,
              source_hash: span.unit.source_hash
            }
          });
        }
      }
    }
  }

  return edges;
}

function buildSymbolSpans(fileSymbols, text) {
  const lines = text.split(/\r\n|\r|\n/);
  const sorted = [...fileSymbols].sort((a, b) => a.line - b.line);

  return sorted.map((unit, index) => {
    const next = sorted[index + 1];
    const start = unit.line;
    const end = next ? Math.max(unit.line, next.line - 1) : lines.length;
    return {
      unit,
      line_start: start,
      line_end: end,
      text: lines.slice(start - 1, end).join("\n")
    };
  });
}

function resolveImportTargets(file, importSource, knownFiles) {
  const match = importSource.match(/\bfrom\s+["']([^"']+)["']|import\s+["']([^"']+)["']/);
  const specifier = match?.[1] || match?.[2] || "";
  if (!specifier.startsWith(".")) return [];

  const base = path.normalize(path.join(path.dirname(file), specifier));
  return knownFiles.filter((candidate) => {
    const withoutExt = candidate.slice(0, -path.extname(candidate).length);
    return candidate === base || withoutExt === base || candidate.startsWith(`${base}/`);
  });
}

function addEdge(edges, edgeKeys, edge) {
  const key = `${edge.type}:${edge.from}:${edge.to}`;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push({
    id: `edge-${sha256(key).slice(0, 12)}`,
    ...edge
  });
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function containsWord(text, word) {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text);
}

function isTestFile(file) {
  return /(^|\/)(test|tests|__tests__)(\/|$)|[._-]test\.[cm]?[jt]sx?$/i.test(file);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
