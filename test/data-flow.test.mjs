import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildDataFlowTrace } from "../src/data-flow.mjs";

describe("DataFlowTraceV1", () => {
  it("traces argument-to-parameter bindings across resolved calls", async () => {
    const root = await makeFlowFixture();
    const trace = await buildDataFlowTrace(root, {
      query: "beta",
      depth: 2
    });

    assert.equal(trace.schema, "DataFlowTraceV1");
    assert.equal(trace.status, "verified-trace");
    assert.ok(trace.nodes.some((node) => node.name === "alpha"));
    assert.ok(trace.nodes.some((node) => node.name === "helper"));

    const alphaEdge = trace.edges.find((edge) => edge.call === "alpha");
    assert.ok(alphaEdge);
    assert.equal(alphaEdge.status, "resolved");
    assert.deepEqual(alphaEdge.bindings[0], {
      index: 0,
      argument: "input",
      argument_identifiers: ["input"],
      parameter: "input",
      status: "bound"
    });

    const helperEdge = trace.edges.find((edge) => edge.call === "helper");
    assert.ok(helperEdge);
    assert.equal(helperEdge.to.file, "src/beta.mjs");
    assert.equal(helperEdge.bindings[0].argument, "result");
    assert.equal(helperEdge.bindings[0].parameter, "value");
  });

  it("CLI flow emits JSON", async () => {
    const root = await makeFlowFixture();
    const result = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "flow",
      root,
      "--query",
      "beta",
      "--json"
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "DataFlowTraceV1");
    assert.equal(payload.status, "verified-trace");
  });

  it("preserves AST parameter order when building bindings", async () => {
    const root = await makeFlowFixture();
    const trace = await buildDataFlowTrace(root, {
      query: "orderSource",
      depth: 1
    });

    const edge = trace.edges.find((candidate) => candidate.call === "orderTarget");
    assert.ok(edge);
    assert.deepEqual(edge.bindings.map((binding) => binding.parameter), ["z", "a", "m"]);
    assert.deepEqual(edge.bindings.map((binding) => binding.argument), ["value", "1", "2"]);
  });
});

async function makeFlowFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-flow-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src/alpha.mjs"), [
    "export function alpha(input) {",
    "  return input + 1;",
    "}"
  ].join("\n"));
  await fs.writeFile(path.join(root, "src/beta.mjs"), [
    "import { alpha } from \"./alpha.mjs\";",
    "",
    "export function beta(input) {",
    "  const result = alpha(input);",
    "  return helper(result);",
    "}",
    "",
    "function helper(value) {",
    "  return value * 2;",
    "}"
  ].join("\n"));
  await fs.writeFile(path.join(root, "src/order.mjs"), [
    "export function orderSource(value) {",
    "  return orderTarget(value, 1, 2);",
    "}",
    "",
    "function orderTarget(z, a, m) {",
    "  return z + a + m;",
    "}"
  ].join("\n"));
  return root;
}
