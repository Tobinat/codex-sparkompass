import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildProgramSlice } from "../src/program-slice.mjs";

describe("ProgramSliceV1", () => {
  it("extracts a symbol span with calls, dataflow hints, imports, and related tests", async () => {
    const root = await makeSliceFixture();
    const slice = await buildProgramSlice(root, {
      query: "beta"
    });

    assert.equal(slice.schema, "ProgramSliceV1");
    assert.equal(slice.analysis.mode, "ast");
    assert.equal(slice.analysis.parser, "acorn");
    assert.equal(slice.target.name, "beta");
    assert.match(slice.code.text, /alpha\(input\)/);
    assert.ok(slice.calls.some((call) => call.name === "alpha" && call.resolved));
    assert.ok(slice.calls.some((call) => call.name === "helper" && call.resolved && call.target.file === "src/beta.mjs"));
    assert.ok(slice.dataflow.writes.includes("result"));
    assert.ok(slice.dataflow.reads.includes("input"));
    assert.ok(slice.imports.some((item) => item.source.includes("./alpha.mjs")));
    assert.ok(slice.related_tests.some((test) => test.file === "test/beta.test.mjs"));
    assert.equal(slice.quality.status, "verified-slice");
  });

  it("CLI slice emits JSON", async () => {
    const root = await makeSliceFixture();
    const result = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "slice",
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
    assert.equal(payload.schema, "ProgramSliceV1");
    assert.equal(payload.target.name, "beta");
  });
});

async function makeSliceFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-slice-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "test"), { recursive: true });
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
  await fs.writeFile(path.join(root, "src/other.mjs"), [
    "export function helper(value) {",
    "  return value - 1;",
    "}"
  ].join("\n"));
  await fs.writeFile(path.join(root, "test/beta.test.mjs"), [
    "import { beta } from \"../src/beta.mjs\";",
    "",
    "export function betaSpec() {",
    "  return beta(1);",
    "}"
  ].join("\n"));
  return root;
}
