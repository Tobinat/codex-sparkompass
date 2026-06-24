import { createHash } from "node:crypto";
import { buildProgramSlice } from "./program-slice.mjs";
import { formatNumber } from "./token-estimator.mjs";

export async function buildDataFlowTrace(rootPath, options = {}) {
  const query = String(options.query || "").trim();
  if (!query) throw new Error("Bitte Query angeben: sparkompass flow . --query \"...\"");

  const maxDepth = clampInteger(options.depth, 2, 0, 5);
  const maxEdges = clampInteger(options.maxEdges, 60, 1, 300);
  const rootSlice = await buildProgramSlice(rootPath, {
    query,
    maxFiles: options.maxFiles
  });

  if (!rootSlice.target) {
    return {
      schema: "DataFlowTraceV1",
      root: rootSlice.root,
      query,
      generated_at: new Date().toISOString(),
      status: "no-target",
      nodes: [],
      edges: [],
      quality: {
        status: "no-target",
        warnings: ["no-root-slice"]
      }
    };
  }

  const nodes = new Map();
  const edges = [];
  const queue = [{ slice: rootSlice, depth: 0 }];
  nodes.set(rootSlice.target.id, summarizeSlice(rootSlice, 0));

  while (queue.length && edges.length < maxEdges) {
    const { slice, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    for (const call of slice.calls) {
      if (edges.length >= maxEdges) break;
      if (!call.resolved || !call.target?.id) {
        edges.push(buildUnresolvedEdge(slice, call, depth));
        continue;
      }

      const targetSlice = await buildProgramSlice(rootPath, {
        query: call.target.name,
        targetId: call.target.id,
        maxFiles: options.maxFiles
      });
      nodes.set(targetSlice.target.id, summarizeSlice(targetSlice, depth + 1));
      edges.push(buildResolvedEdge(slice, targetSlice, call, depth));

      if (!nodes.get(targetSlice.target.id).expanded && depth + 1 < maxDepth) {
        nodes.set(targetSlice.target.id, {
          ...nodes.get(targetSlice.target.id),
          expanded: true
        });
        queue.push({ slice: targetSlice, depth: depth + 1 });
      }
    }
  }

  const warnings = [];
  if (edges.some((edge) => edge.status === "unresolved")) warnings.push("unresolved-flow-edges-present");
  if (edges.length >= maxEdges) warnings.push("max-edges-reached");

  return {
    schema: "DataFlowTraceV1",
    root: rootSlice.root,
    query,
    generated_at: new Date().toISOString(),
    max_depth: maxDepth,
    graph_hash: rootSlice.graph_hash,
    status: warnings.length ? "review-needed" : "verified-trace",
    nodes: [...nodes.values()].map(({ expanded, ...node }) => node),
    edges,
    evidence: {
      evidence_id: `flow-${sha256(`${rootSlice.target.id}:${edges.map((edge) => edge.id).join(":")}`).slice(0, 12)}`,
      root_slice_evidence: rootSlice.evidence,
      edge_hash: `sha256:${sha256(JSON.stringify(edges.map((edge) => ({
        from: edge.from.id,
        to: edge.to?.id || null,
        bindings: edge.bindings
      }))))}`
    },
    quality: {
      status: warnings.length ? "review-needed" : "verified-trace",
      warnings
    }
  };
}

export function formatDataFlowTraceReport(trace) {
  if (trace.status === "no-target") {
    return `
# Data Flow Trace

Query: ${trace.query}
Status: kein Treffer
`.trim();
  }

  return `
# Data Flow Trace

Query: ${trace.query}
Tiefe: ${trace.max_depth}
Status: ${trace.status}

- Knoten: ${formatNumber(trace.nodes.length)}
- Kanten: ${formatNumber(trace.edges.length)}
- Qualität: ${trace.quality.status}

## Kanten

${trace.edges.map(formatEdge).join("\n") || "- keine"}
`.trim();
}

function summarizeSlice(slice, depth) {
  return {
    id: slice.target.id,
    name: slice.target.name,
    type: slice.target.type,
    file: slice.target.file,
    line: slice.target.line,
    depth,
    analysis_mode: slice.analysis.mode,
    quality: slice.quality.status,
    parameters: slice.dataflow.parameters || [],
    reads: slice.dataflow.reads,
    writes: slice.dataflow.writes,
    evidence: slice.evidence,
    expanded: false
  };
}

function buildResolvedEdge(sourceSlice, targetSlice, call, depth) {
  const bindings = buildBindings(call, targetSlice);
  return {
    id: `flow-edge-${sha256(`${sourceSlice.target.id}:${call.name}:${targetSlice.target.id}:${depth}`).slice(0, 12)}`,
    status: "resolved",
    depth,
    call: call.name,
    from: {
      id: sourceSlice.target.id,
      name: sourceSlice.target.name,
      file: sourceSlice.target.file,
      line: sourceSlice.target.line
    },
    to: {
      id: targetSlice.target.id,
      name: targetSlice.target.name,
      file: targetSlice.target.file,
      line: targetSlice.target.line
    },
    bindings,
    evidence: {
      source: sourceSlice.evidence,
      target: targetSlice.evidence
    }
  };
}

function buildUnresolvedEdge(sourceSlice, call, depth) {
  return {
    id: `flow-edge-${sha256(`${sourceSlice.target.id}:${call.name}:unresolved:${depth}`).slice(0, 12)}`,
    status: "unresolved",
    depth,
    call: call.name,
    from: {
      id: sourceSlice.target.id,
      name: sourceSlice.target.name,
      file: sourceSlice.target.file,
      line: sourceSlice.target.line
    },
    to: null,
    bindings: call.arguments || [],
    evidence: {
      source: sourceSlice.evidence
    }
  };
}

function buildBindings(call, targetSlice) {
  const parameters = targetSlice.dataflow.parameters || [];
  const args = call.arguments || [];
  const max = Math.max(parameters.length, args.length);
  const bindings = [];

  for (let index = 0; index < max; index += 1) {
    const arg = args[index] || {
      index,
      expression: "<missing>",
      identifiers: []
    };
    bindings.push({
      index,
      argument: arg.expression,
      argument_identifiers: arg.identifiers,
      parameter: parameters[index] || null,
      status: parameters[index] ? "bound" : "extra-argument"
    });
  }

  return bindings;
}

function formatEdge(edge) {
  const target = edge.to ? `${edge.to.name} (${edge.to.file}:${edge.to.line})` : "unaufgelöst";
  const bindings = edge.bindings.map((binding) => (
    `${binding.argument} -> ${binding.parameter || "?"}`
  )).join(", ");
  return `- ${edge.from.name} -> ${target} via ${edge.call}${bindings ? ` [${bindings}]` : ""}`;
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}
