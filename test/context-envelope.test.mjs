import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeContextCache } from "../src/context-cache.mjs";
import { buildContextEnvelope } from "../src/context-envelope.mjs";

describe("ContextEnvelopeV1", () => {
  it("orders stable prefix before variable tail and keeps changed units volatile", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-envelope-"));
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableAuthHelper() { return 'same'; }",
      "export function changedAuthFlow() { return 'old'; }"
    ].join("\n"));
    await writeContextCache(root, {
      out: "cache.json"
    });
    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableAuthHelper() { return 'same'; }",
      "export function changedAuthFlow() { return 'new'; }",
      "export function addedAuthGuard() { return 'guard'; }"
    ].join("\n"));

    const envelope = await buildContextEnvelope(root, {
      goal: "stableAuthHelper changedAuthFlow addedAuthGuard",
      budget: 180,
      cache: "cache.json",
      expect: ["changedAuthFlow"],
      minCachePrefixTokens: 1
    });
    const repeat = await buildContextEnvelope(root, {
      goal: "stableAuthHelper changedAuthFlow addedAuthGuard",
      budget: 180,
      cache: "cache.json",
      expect: ["changedAuthFlow"],
      minCachePrefixTokens: 1
    });
    const semiStable = envelope.segments.find((segment) => segment.id === "semi-stable-prefix-0001");
    const volatile = envelope.segments.find((segment) => segment.id === "variable-tail-0002");

    assert.equal(envelope.schema, "ContextEnvelopeV1");
    assert.equal(envelope.gate.status, "verified-envelope");
    assert.equal(envelope.prompt_cache_strategy.exact_prefix_required, true);
    assert.equal(envelope.cache_metrics.prefix_status, "prefix-meets-estimated-threshold");
    assert.deepEqual(envelope.assembly.send_order, [
      "stable-prefix-0001",
      "semi-stable-prefix-0001",
      "variable-tail-0001",
      "variable-tail-0002"
    ]);
    assert.ok(semiStable.text.includes("stableAuthHelper"));
    assert.ok(!semiStable.text.includes("changedAuthFlow"));
    assert.ok(volatile.text.includes("changedAuthFlow"));
    assert.ok(volatile.text.includes("addedAuthGuard"));
    assert.ok(envelope.on_demand_index.text.includes("raw=sparkompass_load_source_hash"));
    assert.ok(envelope.prompt.text.indexOf("Stable Prefix") < envelope.prompt.text.indexOf("Variable Tail"));
    assert.equal(envelope.assembly.stable_prefix_hash, repeat.assembly.stable_prefix_hash);
    assert.equal(envelope.prefix_reuse.status, "not-compared");

    const compared = await buildContextEnvelope(root, {
      goal: "stableAuthHelper changedAuthFlow addedAuthGuard",
      budget: 180,
      cache: "cache.json",
      expect: ["changedAuthFlow"],
      minCachePrefixTokens: 1,
      previousEnvelope: envelope
    });

    assert.equal(compared.prefix_reuse.status, "full-prefix-reusable");
    assert.equal(compared.prefix_reuse.exact_stable_prefix_match, true);
    assert.equal(compared.prefix_reuse.reusable_prefix_percent, 100);

    await fs.writeFile(path.join(root, "feature.mjs"), [
      "export function stableAuthHelper() { return 'changed'; }",
      "export function changedAuthFlow() { return 'new'; }",
      "export function addedAuthGuard() { return 'guard'; }"
    ].join("\n"));
    const staticOnly = await buildContextEnvelope(root, {
      goal: "stableAuthHelper changedAuthFlow addedAuthGuard",
      budget: 180,
      cache: "cache.json",
      expect: ["changedAuthFlow"],
      minCachePrefixTokens: 1,
      previousEnvelope: envelope
    });

    assert.equal(staticOnly.prefix_reuse.status, "static-prefix-only-reusable");
    assert.equal(staticOnly.prefix_reuse.exact_static_prefix_match, true);
    assert.ok(staticOnly.prefix_reuse.invalidated_prefix_tokens > 0);
  });

  it("CLI envelope emits JSON and a human report", async () => {
    const json = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "envelope",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--budget",
      "120",
      "--min-cache-prefix-tokens",
      "1",
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(json.status, 0, json.stderr);
    const envelope = JSON.parse(json.stdout);
    assert.equal(envelope.schema, "ContextEnvelopeV1");
    assert.equal(envelope.plan.schema, "ContextPlanV1");
    assert.equal(envelope.gate.status, "verified-envelope");
    assert.equal(envelope.prefix_reuse.status, "not-compared");

    const previousPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-envelope-previous-")), "previous.json");
    await fs.writeFile(previousPath, json.stdout, "utf8");
    const compared = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "envelope",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--budget",
      "120",
      "--min-cache-prefix-tokens",
      "1",
      "--previous-envelope",
      previousPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(compared.status, 0, compared.stderr);
    assert.equal(JSON.parse(compared.stdout).prefix_reuse.status, "full-prefix-reusable");

    const human = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "envelope",
      ".",
      "--goal",
      "compressText quality warnings",
      "--file",
      "src/compressor.mjs",
      "--budget",
      "120"
    ], {
      encoding: "utf8"
    });

    assert.equal(human.status, 0, human.stderr);
    assert.match(human.stdout, /ContextEnvelopeV1/);
    assert.match(human.stdout, /Prompt-Cache-Status/);
    assert.match(human.stdout, /Prefix-Wiederverwendung/);
    assert.match(human.stdout, /Sende-Reihenfolge/);
  });
});
