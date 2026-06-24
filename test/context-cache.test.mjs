import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextDelta, lookupContext, writeContextCache } from "../src/context-cache.mjs";

describe("Context cache, delta, and lookup", () => {
  it("stores inventory and detects changed semantic units", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-cache-"));
    await fs.writeFile(path.join(root, "sample.mjs"), [
      "export function alpha() {",
      "  return 1;",
      "}"
    ].join("\n"));

    await writeContextCache(root, {
      out: ".sparkompass/context-cache.json"
    });

    await fs.writeFile(path.join(root, "sample.mjs"), [
      "export async function alpha() {",
      "  return 1;",
      "}"
    ].join("\n"));

    const delta = await buildContextDelta(root, {
      cache: ".sparkompass/context-cache.json"
    });

    assert.equal(delta.schema, "ContextDeltaV1");
    assert.equal(delta.totals.changed, 1);
    assert.equal(delta.changed[0].after.identity_key, "function:sample.mjs:alpha");
  });

  it("finds relevant units under a budget", async () => {
    const result = await lookupContext("test/fixtures", {
      query: "compressText",
      budget: 80
    });

    assert.equal(result.schema, "ContextLookupV1");
    assert.ok(result.selected.some((unit) => unit.name === "compressText"));
    assert.ok(result.used_tokens <= 80);
    assert.ok(result.evidence.every((item) => item.source_hash.startsWith("sha256:")));
  });

  it("excludes the selected cache file from current delta inventory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-cache-exclude-"));
    await fs.writeFile(path.join(root, "sample.mjs"), "export function gamma() {\n  return 1;\n}\n");
    await writeContextCache(root, {
      out: "cache.json"
    });
    await fs.writeFile(path.join(root, "sample.mjs"), "export async function gamma() {\n  return 2;\n}\n");

    const delta = await buildContextDelta(root, {
      cache: "cache.json"
    });

    assert.equal(delta.totals.previous_units, 1);
    assert.equal(delta.totals.current_units, 1);
    assert.equal(delta.totals.changed, 1);
    assert.ok(!delta.added.some((unit) => unit.file === "cache.json"));
  });

  it("CLI cache/delta/lookup work together", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-cli-cache-"));
    await fs.writeFile(path.join(root, "sample.mjs"), "export function beta() {\n  return 1;\n}\n");

    const cache = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "cache",
      root,
      "--json"
    ], {
      encoding: "utf8"
    });
    assert.equal(cache.status, 0, cache.stderr);

    await fs.writeFile(path.join(root, "sample.mjs"), "export async function beta() {\n  return 2;\n}\n");

    const delta = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "delta",
      root,
      "--json"
    ], {
      encoding: "utf8"
    });
    assert.equal(delta.status, 0, delta.stderr);
    assert.equal(JSON.parse(delta.stdout).totals.changed, 1);

    const lookup = spawnSync(process.execPath, [
      path.resolve("bin/codex-sparkompass.mjs"),
      "lookup",
      root,
      "--query",
      "beta",
      "--json"
    ], {
      encoding: "utf8"
    });
    assert.equal(lookup.status, 0, lookup.stderr);
    assert.equal(JSON.parse(lookup.stdout).selected[0].name, "beta");
  });
});
