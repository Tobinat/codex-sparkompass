import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAstSliceAnalysis } from "./ast-slice.mjs";
import { buildContextGraph } from "./context-graph.mjs";
import { estimateTextStats, formatNumber } from "./token-estimator.mjs";

const CODE_NODE_TYPES = new Set(["function", "class", "export"]);
const DECLARATION_TYPES = new Set(["const", "let", "var"]);

export async function buildProgramSlice(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const query = String(options.query || "").trim();
  if (!query) throw new Error("Bitte Symbol angeben: sparkompass slice . --query \"...\"");

  const graph = await buildContextGraph(root, {
    maxFiles: options.maxFiles
  });
  const target = options.targetId
    ? graph.nodes.find((node) => node.id === options.targetId)
    : selectTargetNode(graph, query);
  if (!target) {
    return emptySlice(root, query, graph);
  }

  const fileText = await fs.readFile(path.join(root, target.file), "utf8");
  const fileLines = splitLines(fileText);
  const spans = buildFileSpans(graph.nodes.filter((node) => node.file === target.file), fileLines);
  const astAnalysis = buildAstSliceAnalysis({
    file: target.file,
    text: fileText,
    target,
    graphNodes: graph.nodes
  });
  const targetSpan = astAnalysis.ok
    ? {
      line_start: astAnalysis.span.line_start,
      line_end: astAnalysis.span.line_end
    }
    : spans.get(target.id) || fallbackSpan(target, fileLines);
  const targetText = astAnalysis.ok
    ? astAnalysis.source_text
    : fileLines.slice(targetSpan.line_start - 1, targetSpan.line_end).join("\n");
  const localImports = astAnalysis.ok
    ? astAnalysis.imports.map((item) => ({
      id: `ast-import-${sha256(`${target.file}:${item.line}:${item.source}`).slice(0, 12)}`,
      file: target.file,
      line: item.line,
      source: item.source,
      specifiers: item.specifiers,
      source_hash: `sha256:${sha256(item.source)}`
    }))
    : collectImports(graph, target.file);
  const localSymbols = graph.nodes.filter((node) => node.file === target.file && CODE_NODE_TYPES.has(node.type));
  const calls = astAnalysis.ok ? astAnalysis.calls : collectCalls(targetText, target, graph.nodes);
  const dataflow = astAnalysis.ok ? astAnalysis.dataflow : collectDataflow(targetText);
  const relatedTests = collectRelatedTests(graph, target);
  const relatedEdges = graph.edges.filter((edge) => edge.from === target.id || edge.to === target.id);
  const analysis = astAnalysis.ok
    ? {
      mode: "ast",
      parser: astAnalysis.parser,
      parser_version: astAnalysis.parser_version,
      target_node_type: astAnalysis.target_node_type,
      fallback: false
    }
    : {
      mode: "heuristic",
      parser: null,
      fallback: true,
      fallback_reason: astAnalysis.reason
    };

  return {
    schema: "ProgramSliceV1",
    root,
    query,
    generated_at: new Date().toISOString(),
    graph_hash: `sha256:${sha256(JSON.stringify(graph.edges.map((edge) => edge.id)))}`,
    analysis,
    target: {
      ...target,
      span: targetSpan,
      source_hash: `sha256:${sha256(targetText.trim())}`,
      estimated_tokens: estimateTextStats(targetText).estimatedTokens
    },
    code: {
      text: targetText,
      line_start: targetSpan.line_start,
      line_end: targetSpan.line_end,
      text_hash: `sha256:${sha256(targetText)}`
    },
    imports: localImports,
    local_symbols: localSymbols.map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      line: node.line
    })),
    calls,
    dataflow,
    related_tests: relatedTests,
    graph_edges: relatedEdges,
    evidence: buildEvidence(target, targetSpan, targetText, relatedTests),
    quality: buildQuality({ calls, dataflow, targetText, analysisWarnings: astAnalysis.warnings || [] })
  };
}

export function formatProgramSliceReport(slice) {
  if (!slice.target) {
    return `
# Program Slice

Query: ${slice.query}
Status: kein Treffer
Graph-Knoten: ${formatNumber(slice.graph_totals.nodes)}
`.trim();
  }

  return `
# Program Slice

Query: ${slice.query}
Ziel: ${slice.target.type} ${slice.target.name}
Ort: ${slice.target.file}:${slice.target.span.line_start}-${slice.target.span.line_end}

- Code-Tokens: ${formatNumber(slice.target.estimated_tokens)}
- Direkte Calls: ${formatNumber(slice.calls.length)}
- Reads: ${formatNumber(slice.dataflow.reads.length)}
- Writes: ${formatNumber(slice.dataflow.writes.length)}
- Tests: ${formatNumber(slice.related_tests.length)}
- Analyse: ${slice.analysis.mode}${slice.analysis.parser ? ` (${slice.analysis.parser} ${slice.analysis.parser_version})` : ""}
- Qualität: ${slice.quality.status}

## Calls

${slice.calls.map((call) => `- ${call.name}${call.resolved ? ` -> ${call.target.file}:${call.target.line}` : ""}`).join("\n") || "- keine"}

## Datenhinweise

Reads: ${slice.dataflow.reads.join(", ") || "keine"}
Writes: ${slice.dataflow.writes.join(", ") || "keine"}

## Code

\`\`\`text
${slice.code.text}
\`\`\`
`.trim();
}

function selectTargetNode(graph, query) {
  const normalized = query.toLowerCase();
  const candidates = graph.nodes
    .filter((node) => CODE_NODE_TYPES.has(node.type))
    .map((node) => ({
      node,
      score: scoreTarget(node, normalized)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.node.file.localeCompare(b.node.file));

  return candidates[0]?.node || null;
}

function scoreTarget(node, normalizedQuery) {
  const name = node.name.toLowerCase();
  const file = node.file.toLowerCase();
  if (name === normalizedQuery) return 100;
  if (name.includes(normalizedQuery)) return 70;
  if (file.includes(normalizedQuery)) return 25;
  return 0;
}

function buildFileSpans(nodes, lines) {
  const spans = new Map();
  const sorted = nodes
    .filter((node) => CODE_NODE_TYPES.has(node.type))
    .sort((a, b) => a.line - b.line);

  for (let index = 0; index < sorted.length; index += 1) {
    const node = sorted[index];
    const next = sorted[index + 1];
    const start = node.line;
    const end = next ? Math.max(node.line, next.line - 1) : findBlockEnd(lines, node.line);
    spans.set(node.id, {
      line_start: start,
      line_end: Math.min(lines.length, end)
    });
  }

  return spans;
}

function findBlockEnd(lines, startLine) {
  let braceDepth = 0;
  let sawBrace = false;

  for (let index = startLine - 1; index < lines.length; index += 1) {
    const line = stripLineComment(lines[index]);
    for (const char of line) {
      if (char === "{") {
        braceDepth += 1;
        sawBrace = true;
      } else if (char === "}") {
        braceDepth -= 1;
      }
    }
    if (sawBrace && braceDepth <= 0) return index + 1;
  }

  return Math.min(lines.length, startLine + 40);
}

function fallbackSpan(target, lines) {
  return {
    line_start: target.line,
    line_end: Math.min(lines.length, target.line + 20)
  };
}

function collectImports(graph, file) {
  return graph.nodes
    .filter((node) => node.file === file && node.type === "import")
    .map((node) => ({
      id: node.id,
      file: node.file,
      line: node.line,
      source: node.name,
      source_hash: node.source_hash
    }));
}

function collectCalls(text, target, nodes) {
  const calls = [];
  const seen = new Set();
  const symbolsByName = new Map(nodes.filter((node) => CODE_NODE_TYPES.has(node.type)).map((node) => [node.name, node]));
  const cleanText = stripStringLiterals(text);
  const callPattern = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  const ignored = new Set(["if", "for", "while", "switch", "catch", "function", "return", "String", "Number", "Boolean", "Array", "Object", "JSON"]);
  let match;

  while ((match = callPattern.exec(cleanText)) !== null) {
    const name = match[1];
    const previous = previousNonWhitespace(cleanText, match.index);
    if (previous === ".") continue;
    if (ignored.has(name) || name === target.name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const resolved = symbolsByName.get(name);
    calls.push({
      name,
      resolved: Boolean(resolved),
      target: resolved ? {
        id: resolved.id,
        type: resolved.type,
        name: resolved.name,
        file: resolved.file,
        line: resolved.line,
        source_hash: resolved.source_hash
      } : null
    });
  }

  return calls;
}

function collectDataflow(text) {
  const cleanText = stripStringLiterals(text);
  const writes = new Set();
  const reads = new Set();
  const declarationPattern = /\b(const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const assignmentPattern = /\b([A-Za-z_$][\w$]*)\s*(?:=|\+=|-=|\*=|\/=)/g;
  const identifierPattern = /\b[A-Za-z_$][\w$]*\b/g;
  const builtins = new Set(["String", "Number", "Boolean", "Array", "Object", "JSON", "Math", "Date", "Promise"]);
  const reserved = new Set([
    "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "else",
    "export", "false", "for", "from", "function", "if", "import", "in", "let", "new", "null",
    "return", "switch", "throw", "true", "try", "typeof", "undefined", "var", "while"
  ]);
  let match;

  while ((match = declarationPattern.exec(cleanText)) !== null) {
    if (DECLARATION_TYPES.has(match[1])) writes.add(match[2]);
  }
  while ((match = assignmentPattern.exec(cleanText)) !== null) {
    writes.add(match[1]);
  }
  while ((match = identifierPattern.exec(cleanText)) !== null) {
    const name = match[0];
    if (reserved.has(name) || writes.has(name) || builtins.has(name)) continue;
    if (previousNonWhitespace(cleanText, match.index) === ".") continue;
    if (nextNonWhitespace(cleanText, match.index + name.length) === ":") continue;
    if (isFunctionDeclarationName(cleanText, match.index)) continue;
    reads.add(name);
  }

  return {
    reads: [...reads].sort(),
    writes: [...writes].sort()
  };
}

function collectRelatedTests(graph, target) {
  return graph.edges
    .filter((edge) => edge.to === target.id && edge.type === "tests-symbol")
    .map((edge) => {
      const node = graph.nodes.find((candidate) => candidate.id === edge.from);
      return {
        edge_id: edge.id,
        reason: edge.reason,
        file: node?.file || edge.evidence.file,
        line: node?.line || edge.evidence.line,
        node_id: edge.from,
        source_hash: edge.evidence.source_hash
      };
    });
}

function buildEvidence(target, span, text, relatedTests) {
  return {
    evidence_id: `slice-${sha256(`${target.id}:${span.line_start}:${span.line_end}`).slice(0, 12)}`,
    target_id: target.id,
    file: target.file,
    line_start: span.line_start,
    line_end: span.line_end,
    source_hash: `sha256:${sha256(text.trim())}`,
    excerpt_hash: `sha256:${sha256(text)}`,
    test_evidence: relatedTests
  };
}

function buildQuality({ calls, dataflow, targetText, analysisWarnings = [] }) {
  const warnings = [];
  if (!targetText.includes("{")) warnings.push("slice-without-block-braces");
  if (calls.some((call) => !call.resolved) && !analysisWarnings.includes("unresolved-calls-present")) warnings.push("unresolved-calls-present");
  if (dataflow.reads.length > 50) warnings.push("large-read-set");
  warnings.push(...analysisWarnings);

  return {
    status: warnings.length ? "review-needed" : "verified-slice",
    warnings
  };
}

function emptySlice(root, query, graph) {
  return {
    schema: "ProgramSliceV1",
    root,
    query,
    generated_at: new Date().toISOString(),
    target: null,
    graph_totals: graph.totals,
    quality: {
      status: "no-target",
      warnings: ["no-symbol-match"]
    }
  };
}

function splitLines(text) {
  return text.split(/\r\n|\r|\n/);
}

function stripLineComment(line) {
  return line.replace(/\/\/.*$/, "");
}

function stripStringLiterals(text) {
  return text
    .replace(/`(?:\\.|[^`\\])*`/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ");
}

function previousNonWhitespace(text, index) {
  for (let position = index - 1; position >= 0; position -= 1) {
    const char = text[position];
    if (!/\s/.test(char)) return char;
  }
  return "";
}

function nextNonWhitespace(text, index) {
  for (let position = index; position < text.length; position += 1) {
    const char = text[position];
    if (!/\s/.test(char)) return char;
  }
  return "";
}

function isFunctionDeclarationName(text, index) {
  const before = text.slice(Math.max(0, index - 24), index);
  return /\bfunction\s+$/.test(before);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
