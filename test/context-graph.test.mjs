import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextGraph, findSymbolNeighborhood } from "../src/context-graph.mjs";

describe("Context Graph", () => {
  it("connects local imports, symbol references, and test references", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-graph-"));
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(path.join(root, "test"), { recursive: true });
    await fs.writeFile(path.join(root, "src/math.mjs"), [
      "export function alpha() {",
      "  return 1;",
      "}",
      "",
      "export function beta() {",
      "  return alpha() + 1;",
      "}"
    ].join("\n"));
    await fs.writeFile(path.join(root, "test/math.test.mjs"), [
      "import { beta } from \"../src/math.mjs\";",
      "",
      "function betaSpec() {",
      "  return beta();",
      "}"
    ].join("\n"));

    const graph = await buildContextGraph(root);
    const neighborhood = findSymbolNeighborhood(graph, "beta");

    assert.equal(graph.schema, "ContextGraphV1");
    assert.ok(graph.edges.some((edge) => edge.type === "imports-symbol"));
    assert.ok(graph.edges.some((edge) => edge.type === "references-symbol"));
    assert.ok(graph.edges.some((edge) => edge.type === "tests-symbol"));
    assert.ok(neighborhood.nodes.some((node) => node.name === "beta"));
  });

  it("CLI graph emits JSON with a symbol neighborhood", () => {
    const result = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "graph",
      "test/fixtures",
      "--query",
      "compressText",
      "--json"
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.graph.schema, "ContextGraphV1");
    assert.equal(payload.neighborhood.schema, "ContextGraphNeighborhoodV1");
    assert.ok(payload.neighborhood.nodes.some((node) => node.name === "compressText"));
  });
});
