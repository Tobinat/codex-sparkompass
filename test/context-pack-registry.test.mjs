import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { buildContextPack } from "../src/context-pack.mjs";
import { buildContextPackRegistryReport, registerContextPack, verifyRegisteredContextPack } from "../src/context-pack-registry.mjs";

describe("ContextPackRegistryV1", () => {
  it("registers a ContextPack and verifies it later by context_pack_id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-contextpack-registry-"));
    const source = [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes.",
      "Noise that can be removed."
    ].join("\n");
    await fs.writeFile(path.join(root, "auth.log"), source, "utf8");
    const pack = buildContextPack(source, {
      label: "auth.log",
      targetPercent: 35,
      keep: ["AUTH_RESET_TOKEN_EXPIRED", "src/auth/session.ts"],
      expect: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    const write = await registerContextPack(root, pack, {
      sourceFile: "auth.log",
      registry: "registry.json"
    });

    assert.equal(write.schema, "ContextPackRegistryWriteResultV1");
    assert.equal(write.entry.schema, "ContextPackRegistryEntryV1");
    assert.equal(write.entry.context_pack_id, pack.receipt.context_pack_id);
    assert.equal(write.entry.source.file, "auth.log");
    assert.equal(write.entry.source.text_stored, false);
    assert.equal(write.entry.delivered_context.text_stored, true);

    const verification = await verifyRegisteredContextPack(root, {
      registry: "registry.json",
      contextPackId: pack.receipt.context_pack_id
    });

    assert.equal(verification.schema, "ContextPackRegistryVerificationV1");
    assert.equal(verification.status, "verified-context-pack-id");
    assert.equal(verification.verified, true);
    assert.equal(verification.receipt_verification.status, "verified-receipt");
    assert.equal(verification.receipt_verification.checks.source_hash.status, "passed");
    assert.equal(verification.receipt_verification.checks.delivered_context_hash.status, "passed");

    const registry = await buildContextPackRegistryReport(root, {
      registry: "registry.json"
    });
    assert.equal(registry.schema, "ContextPackRegistryV1");
    assert.equal(registry.totals.entries, 1);
    assert.equal(registry.totals.source_files, 1);
    assert.equal(registry.totals.delivered_contexts, 1);
  });

  it("returns needs-review when the registered source changed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-contextpack-registry-drift-"));
    const source = "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts";
    const sourcePath = path.join(root, "auth.log");
    await fs.writeFile(sourcePath, source, "utf8");
    const pack = buildContextPack(source, {
      label: "auth.log",
      keep: ["AUTH_RESET_TOKEN_EXPIRED"]
    });
    await registerContextPack(root, pack, {
      sourceFile: "auth.log",
      registry: "registry.json"
    });
    await fs.writeFile(sourcePath, source.replace("AUTH_RESET_TOKEN_EXPIRED", "AUTH_CHANGED"), "utf8");

    const verification = await verifyRegisteredContextPack(root, {
      registry: "registry.json",
      contextPackId: pack.receipt.context_pack_id
    });

    assert.equal(verification.status, "context-pack-id-needs-review");
    assert.equal(verification.verified, false);
    assert.ok(verification.failures.some((failure) => failure.reason === "source-hash-mismatch"));
  });

  it("CLI pack --registry can be verified by contextpack verify", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sparkompass-contextpack-cli-"));
    const sourcePath = path.join(root, "auth.log");
    const registryPath = path.join(root, "context-pack-registry.json");
    await fs.writeFile(sourcePath, [
      "ERROR AUTH_RESET_TOKEN_EXPIRED in src/auth/session.ts",
      "Done when: Auth reset test passes."
    ].join("\n"), "utf8");

    const packResult = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "pack",
      "--file",
      sourcePath,
      "--keep",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--expect",
      "AUTH_RESET_TOKEN_EXPIRED",
      "--registry",
      registryPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(packResult.status, 0, packResult.stderr);
    const pack = JSON.parse(packResult.stdout);
    assert.equal(pack.registry.schema, "ContextPackRegistryWriteResultV1");

    const verifyResult = spawnSync(process.execPath, [
      "./bin/codex-sparkompass.mjs",
      "contextpack",
      "verify",
      ".",
      "--context-pack-id",
      pack.receipt.context_pack_id,
      "--registry",
      registryPath,
      "--json"
    ], {
      encoding: "utf8"
    });

    assert.equal(verifyResult.status, 0, verifyResult.stderr);
    const verification = JSON.parse(verifyResult.stdout);
    assert.equal(verification.schema, "ContextPackRegistryVerificationV1");
    assert.equal(verification.status, "verified-context-pack-id");
    assert.equal(verification.verified, true);
  });
});
